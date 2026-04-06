'use strict';

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

/**
 * StyleAnalyzer — Analyzes a set of reference images to extract visual
 * characteristics and produces an ImagePixelizer preset that recreates
 * a similar pixel-art style.
 *
 * Metrics extracted per image:
 *  - Dominant colors (k-means-style clustering)
 *  - Average contrast / dynamic range
 *  - Average saturation
 *  - Edge density (how "outlined" the art style is)
 *  - Color count (palette richness)
 *  - Brightness distribution (dark vs bright)
 */
class StyleAnalyzer {

  /**
   * Analyze an array of image file paths and return a preset config.
   * @param {string[]} imagePaths
   * @param {Object} [opts]
   * @param {string} [opts.name]  human-readable name for the preset
   * @param {number} [opts.targetPixelDensity] override pixel density (otherwise auto-detected)
   * @returns {Promise<{preset: Object, palette: {r,g,b}[], stats: Object}>}
   */
  static async analyze(imagePaths, opts = {}) {
    const validPaths = imagePaths.filter(p => fs.existsSync(p));
    if (validPaths.length === 0) throw new Error('No valid image paths provided');

    console.log(`Analyzing ${validPaths.length} reference image(s)…`);

    const allStats = [];

    for (const imgPath of validPaths) {
      console.log(`  → ${path.basename(imgPath)}`);
      const stats = await StyleAnalyzer._analyzeOne(imgPath);
      allStats.push(stats);
    }

    // ── Aggregate stats across all images ───────────────────────────
    const agg = StyleAnalyzer._aggregate(allStats);

    // ── Extract a merged dominant palette ────────────────────────────
    const mergedColors = [];
    for (const s of allStats) mergedColors.push(...s.dominantColors);
    const palette = StyleAnalyzer._deduplicateColors(mergedColors, agg.avgColorCount);

    // ── Derive preset parameters from aggregated stats ──────────────
    const preset = StyleAnalyzer._derivePreset(agg, palette, opts);

    console.log(`\n✓ Style analysis complete — preset "${preset._name}" generated`);
    console.log(`  Colors: ${palette.length}, Contrast: ${agg.avgContrast.toFixed(2)}, Saturation: ${agg.avgSaturation.toFixed(2)}, Edge density: ${(agg.avgEdgeDensity * 100).toFixed(1)}%`);

    return { preset, palette, stats: agg };
  }

  // ────────────────────────────────────────────────────────────────────
  //  Single-image analysis
  // ────────────────────────────────────────────────────────────────────

  static async _analyzeOne(imgPath) {
    // Resize to manageable size for fast analysis
    const analysisSize = 128;
    const img = sharp(imgPath);
    const meta = await img.metadata();

    const aspect = meta.height / meta.width;
    const w = analysisSize;
    const h = Math.round(analysisSize * aspect);

    const { data, info } = await img
      .resize(w, h, { fit: 'fill', kernel: 'lanczos3' })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const pixels = new Uint8Array(data);
    const channels = info.channels;
    const pixelCount = w * h;

    // 1. Color statistics
    const { dominantColors, uniqueColorCount } = StyleAnalyzer._extractColors(pixels, w, h, channels);

    // 2. Brightness & contrast
    const { avgBrightness, contrast, dynamicRange } = StyleAnalyzer._brightnessStats(pixels, w, h, channels);

    // 3. Saturation
    const avgSaturation = StyleAnalyzer._avgSaturation(pixels, w, h, channels);

    // 4. Edge density (via Sobel)
    const edgeDensity = StyleAnalyzer._edgeDensity(pixels, w, h, channels);

    return {
      file: path.basename(imgPath),
      width: meta.width,
      height: meta.height,
      dominantColors,
      uniqueColorCount,
      avgBrightness,
      contrast,
      dynamicRange,
      avgSaturation,
      edgeDensity,
    };
  }

  static _extractColors(pixels, w, h, ch) {
    const colorMap = new Map();
    for (let i = 0; i < pixels.length; i += ch) {
      // Quantize to 5-bit per channel for clustering
      const r = (pixels[i] >> 3) << 3;
      const g = (pixels[i + 1] >> 3) << 3;
      const b = (pixels[i + 2] >> 3) << 3;
      const key = (r << 16) | (g << 8) | b;
      colorMap.set(key, (colorMap.get(key) || 0) + 1);
    }

    // Sort by frequency, take top N
    const sorted = [...colorMap.entries()].sort((a, b) => b[1] - a[1]);
    const topN = Math.min(48, sorted.length);
    const dominantColors = sorted.slice(0, topN).map(([key]) => ({
      r: (key >> 16) & 0xFF,
      g: (key >> 8) & 0xFF,
      b: key & 0xFF,
    }));

    return { dominantColors, uniqueColorCount: colorMap.size };
  }

  static _brightnessStats(pixels, w, h, ch) {
    let sum = 0, min = 255, max = 0;
    const count = w * h;
    for (let i = 0; i < pixels.length; i += ch) {
      const lum = 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
      sum += lum;
      if (lum < min) min = lum;
      if (lum > max) max = lum;
    }
    const avgBrightness = sum / count;
    const dynamicRange = max - min;

    // Contrast = std deviation of brightness
    let variance = 0;
    for (let i = 0; i < pixels.length; i += ch) {
      const lum = 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
      const diff = lum - avgBrightness;
      variance += diff * diff;
    }
    const contrast = Math.sqrt(variance / count) / 128; // normalise 0-2 range

    return { avgBrightness, contrast, dynamicRange };
  }

  static _avgSaturation(pixels, w, h, ch) {
    let satSum = 0;
    const count = w * h;
    for (let i = 0; i < pixels.length; i += ch) {
      const r = pixels[i] / 255, g = pixels[i + 1] / 255, b = pixels[i + 2] / 255;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      const l = (mx + mn) / 2;
      let s = 0;
      if (mx !== mn) {
        s = l > 0.5 ? (mx - mn) / (2 - mx - mn) : (mx - mn) / (mx + mn);
      }
      satSum += s;
    }
    return satSum / count;
  }

  static _edgeDensity(pixels, w, h, ch) {
    const sobelX = [[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]];
    const sobelY = [[-1, -2, -1], [0, 0, 0], [1, 2, 1]];
    let edgePixels = 0;
    const threshold = 40;

    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        let gx = 0, gy = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const idx = ((y + dy) * w + (x + dx)) * ch;
            const lum = (pixels[idx] + pixels[idx + 1] + pixels[idx + 2]) / 3;
            gx += lum * sobelX[dy + 1][dx + 1];
            gy += lum * sobelY[dy + 1][dx + 1];
          }
        }
        if (Math.sqrt(gx * gx + gy * gy) > threshold) edgePixels++;
      }
    }
    return edgePixels / ((w - 2) * (h - 2));
  }

  // ────────────────────────────────────────────────────────────────────
  //  Aggregation
  // ────────────────────────────────────────────────────────────────────

  static _aggregate(statsArr) {
    const n = statsArr.length;
    const avg = (arr, key) => arr.reduce((s, a) => s + a[key], 0) / n;

    return {
      imageCount: n,
      avgBrightness: avg(statsArr, 'avgBrightness'),
      avgContrast: avg(statsArr, 'contrast'),
      avgDynamicRange: avg(statsArr, 'dynamicRange'),
      avgSaturation: avg(statsArr, 'avgSaturation'),
      avgEdgeDensity: avg(statsArr, 'edgeDensity'),
      avgColorCount: Math.round(avg(statsArr, 'uniqueColorCount')),
    };
  }

  // ────────────────────────────────────────────────────────────────────
  //  Color de-duplication (merge similar colors)
  // ────────────────────────────────────────────────────────────────────

  static _deduplicateColors(colors, targetCount) {
    // Cap palette size
    const maxColors = Math.max(8, Math.min(48, targetCount));

    // Greedy merge: keep adding the most different color
    const palette = [colors[0]];
    const used = new Set([0]);

    while (palette.length < maxColors && palette.length < colors.length) {
      let bestIdx = -1, bestDist = -1;
      for (let i = 0; i < colors.length; i++) {
        if (used.has(i)) continue;
        let minDist = Infinity;
        for (const pc of palette) {
          const dr = pc.r - colors[i].r;
          const dg = pc.g - colors[i].g;
          const db = pc.b - colors[i].b;
          const d = dr * dr + dg * dg + db * db;
          if (d < minDist) minDist = d;
        }
        if (minDist > bestDist) { bestDist = minDist; bestIdx = i; }
      }
      if (bestIdx < 0 || bestDist < 150) break; // too similar, stop
      palette.push(colors[bestIdx]);
      used.add(bestIdx);
    }

    return palette;
  }

  // ────────────────────────────────────────────────────────────────────
  //  Derive ImagePixelizer preset from aggregated stats
  // ────────────────────────────────────────────────────────────────────

  static _derivePreset(agg, palette, opts = {}) {
    // -- Contrast boost: if reference images are low-contrast, boost more
    let contrastBoost = 1.0;
    if (agg.avgContrast < 0.35) contrastBoost = 1.4;
    else if (agg.avgContrast < 0.5) contrastBoost = 1.2;
    else contrastBoost = 1.05;

    // -- Saturation: mirror the reference saturation range
    let saturation = 1.0;
    if (agg.avgSaturation > 0.5) saturation = 1.8;       // very vivid
    else if (agg.avgSaturation > 0.35) saturation = 1.5;  // moderately vivid
    else if (agg.avgSaturation > 0.2) saturation = 1.2;   // subtle
    else saturation = 1.0;                                 // desaturated / pastel

    // -- Edge detection & outlines based on edge density
    let enableEdgeDetection = true;
    let enableOutlines = true;
    let edgeThreshold = 60;
    let outlineThickness = 1;
    if (agg.avgEdgeDensity > 0.25) {
      // Very edgy style — bold outlines
      edgeThreshold = 40;
      outlineThickness = 2;
    } else if (agg.avgEdgeDensity > 0.12) {
      // Moderate edges
      edgeThreshold = 80;
      outlineThickness = 1;
    } else {
      // Soft / painterly style — minimal edges
      enableEdgeDetection = true;
      enableOutlines = false;
      edgeThreshold = 120;
    }

    // -- Posterization from color richness
    let posterization;
    if (agg.avgColorCount > 300) posterization = 6;      // rich color — preserve more
    else if (agg.avgColorCount > 150) posterization = 5;
    else if (agg.avgColorCount > 80) posterization = 4;
    else posterization = 3;                               // very limited palette look

    // -- Pre-blur: heavier when reference art is smooth / cel-shaded
    let preBlur = 0.6;
    if (agg.avgEdgeDensity < 0.1) preBlur = 1.2;     // smooth art → more blur
    else if (agg.avgEdgeDensity < 0.2) preBlur = 0.8;

    // -- Pixel density
    const pixelDensity = opts.targetPixelDensity || 64;

    // -- Max colors from palette
    const maxColors = palette.length;

    const name = opts.name || `custom_${Date.now()}`;

    return {
      _name: name,
      pixelDensity,
      preBlur,
      enableEdgeDetection,
      edgeThreshold,
      contrastBoost,
      saturation,
      posterization,
      enableOutlines,
      outlineColor: 'black',
      outlineThickness,
      palette: 'CUSTOM',         // signals to use the extracted palette
      maxColors,
      medianFilter: true,
      cleanIsolated: true,
      smoothing: 0,
    };
  }

  // ────────────────────────────────────────────────────────────────────
  //  Persistence — save / load presets as JSON
  // ────────────────────────────────────────────────────────────────────

  static savePreset(outputDir, preset, palette) {
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    const name = preset._name || 'custom';
    const filePath = path.join(outputDir, `${name}.preset.json`);

    const data = {
      name: preset._name,
      version: 1,
      createdAt: new Date().toISOString(),
      preset: { ...preset },
      palette: palette.map(c => ({ r: c.r, g: c.g, b: c.b })),
    };
    delete data.preset._name;

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    console.log(`  Saved preset → ${filePath}`);
    return filePath;
  }

  static loadPreset(filePath) {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(raw);
    data.preset._name = data.name;
    return { preset: data.preset, palette: data.palette };
  }

  static listPresets(dir) {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
      .filter(f => f.endsWith('.preset.json'))
      .map(f => {
        const raw = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8'));
        return { file: f, name: raw.name, colors: (raw.palette || []).length, createdAt: raw.createdAt };
      });
  }
}

module.exports = StyleAnalyzer;
