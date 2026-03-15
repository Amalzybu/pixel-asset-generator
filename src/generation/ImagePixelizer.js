const sharp = require('sharp');
const PixelCanvas = require('../canvas/PixelCanvas');
const { PaletteManager } = require('../palette/PaletteManager');

/**
 * ImagePixelizer - Converts photos to pixel art with cartoonification
 * Features:
 * - Custom pixel density (8-256 pixels for width)
 * - Edge detection for cartoon effect
 * - Color quantization to palette
 * - Adaptive contrast enhancement
 * - Optional posterization
 */
class ImagePixelizer {
  /**
   * Default cartoonification settings
   */
  static get DEFAULT_CONFIG() {
    return {
      pixelDensity: 32,           // Width in pixels
      enableEdgeDetection: true,
      edgeThreshold: 30,          // 0-255
      contrastBoost: 1.2,         // 1.0 = none, 1.5 = strong
      posterization: 4,           // Colors per channel (2-8, lower = flatter)
      enableOutlines: true,
      outlineColor: 'black',
      outlineThickness: 1,        // Outline thickness in pixels (1-3)
      saturation: 1.0,            // Saturation multiplier (1.0 = none, 2.0 = vivid)
      palette: 'AUTO',            // 'AUTO', 'PICO-8', 'NES', 'GAMEBOY', 'ENDESGA-32'
      maxColors: 16,
      smoothing: 1,               // 0 = no smoothing, 1 = normal, 2 = heavy
      preBlur: 0.6,               // Gaussian sigma before downscale (0 = off, 0.5-1.5 recommended)
      medianFilter: true,         // Median filter after quantization to kill scattered pixels
      cleanIsolated: true         // Remove lone pixels surrounded by different colors
    };
  }

  /**
   * Load and pixelize an image from file path
   * @param {string} imagePath - Path to image file
   * @param {Object} config - Configuration overrides
   * @returns {Promise<PixelCanvas>} Pixelized image as PixelCanvas
   */
  static async fromFile(imagePath, config = {}) {
    const mergedConfig = { ...ImagePixelizer.DEFAULT_CONFIG, ...config };

    try {
      // Load image with sharp
      const image = sharp(imagePath);
      const metadata = await image.metadata();
      
      // Validate image
      if (!metadata.width || !metadata.height) {
        throw new Error('Invalid image format');
      }

      // Calculate target dimensions preserving aspect ratio
      const targetWidth = Math.max(8, Math.min(256, mergedConfig.pixelDensity));
      const aspectRatio = metadata.height / metadata.width;
      const targetHeight = Math.round(targetWidth * aspectRatio);

      // Step 1: Load, optionally pre-blur, and resize to pixel density.
      // Pre-blur (Gaussian) before downscaling prevents aliasing artifacts
      // that become scattered stray pixels after quantization.
      let pipeline = image;
      if (mergedConfig.preBlur > 0) {
        pipeline = pipeline.blur(mergedConfig.preBlur);
      }
      let imgBuffer = await pipeline
        .resize(targetWidth, targetHeight, {
          fit: 'fill',
          kernel: 'lanczos3',
          withoutEnlargement: false
        })
        .raw()
        .toBuffer({ resolveWithObject: true });

      // Extract raw pixel data
      let pixels = new Uint8Array(imgBuffer.data);
      let pixelWidth = imgBuffer.info.width;
      let pixelHeight = imgBuffer.info.height;
      let channels = imgBuffer.info.channels;

      // Step 2: Enhance contrast if needed
      if (mergedConfig.contrastBoost !== 1.0) {
        pixels = ImagePixelizer._boostContrast(pixels, mergedConfig.contrastBoost);
      }

      // Step 3: Detect edges NOW — on the natural image before any color crushing.
      // Running edge detection after posterization causes false edges at every
      // color-step boundary, flooding the image with black outlines.
      let edgeMask = null;
      if (mergedConfig.enableEdgeDetection) {
        edgeMask = ImagePixelizer._detectEdges(
          pixels,
          pixelWidth,
          pixelHeight,
          channels,
          mergedConfig.edgeThreshold
        );

        // Optionally thicken for bold cartoon outlines
        if (edgeMask && mergedConfig.outlineThickness > 1) {
          edgeMask = ImagePixelizer._thickenEdges(
            edgeMask,
            pixelWidth,
            pixelHeight,
            mergedConfig.outlineThickness
          );
        }
      }

      // Step 4: Boost saturation for vivid cartoon colors
      if (mergedConfig.saturation !== 1.0) {
        pixels = ImagePixelizer._saturate(pixels, mergedConfig.saturation, channels);
      }

      // Step 5: Posterize colors for flat cartoon areas
      if (mergedConfig.posterization < 8) {
        pixels = ImagePixelizer._posterize(pixels, mergedConfig.posterization);
      }

      // Step 6: Quantize to palette
      const palette = ImagePixelizer._getPalette(mergedConfig.palette, mergedConfig.maxColors);
      pixels = ImagePixelizer._quantizeColors(pixels, palette, channels);

      // Step 7: Median filter — removes salt-and-pepper / scattered pixels
      // while preserving hard color boundaries (unlike averaging which blurs them).
      if (mergedConfig.medianFilter) {
        pixels = ImagePixelizer._medianFilter(pixels, pixelWidth, pixelHeight, channels);
      }

      // Step 8: Remove isolated lone pixels (surrounded entirely by different colors).
      if (mergedConfig.cleanIsolated) {
        pixels = ImagePixelizer._removeIsolatedPixels(pixels, pixelWidth, pixelHeight, channels);
      }

      // Step 9: Apply edge outlines if enabled
      if (mergedConfig.enableOutlines && edgeMask) {
        const outlineRGB = ImagePixelizer._colorToRGB(mergedConfig.outlineColor);
        pixels = ImagePixelizer._applyEdgeOutlines(
          pixels,
          edgeMask,
          pixelWidth,
          pixelHeight,
          channels,
          outlineRGB
        );
      }

      // Step 10: Light smoothing only if explicitly requested
      if (mergedConfig.smoothing > 0) {
        pixels = ImagePixelizer._smoothPixels(
          pixels,
          pixelWidth,
          pixelHeight,
          channels,
          mergedConfig.smoothing
        );
      }

      // Step 11: Create PixelCanvas from processed pixels
      const canvas = new PixelCanvas(pixelWidth, pixelHeight);
      ImagePixelizer._writePixelsToCanvas(canvas, pixels, pixelWidth, pixelHeight, channels);

      return canvas;

    } catch (error) {
      throw new Error(`ImagePixelizer error: ${error.message}`);
    }
  }

  /**
   * Boost saturation via HSL conversion
   * @private
   */
  static _saturate(pixels, factor, channels) {
    const result = new Uint8Array(pixels.length);
    for (let i = 0; i < pixels.length; i += channels) {
      const r = pixels[i] / 255;
      const g = pixels[i + 1] / 255;
      const b = pixels[i + 2] / 255;

      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const l = (max + min) / 2;
      let h = 0, s = 0;

      if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        else if (max === g) h = ((b - r) / d + 2) / 6;
        else h = ((r - g) / d + 4) / 6;
      }

      const sNew = Math.min(1, s * factor);

      // HSL -> RGB
      let rr, gg, bb;
      if (sNew === 0) {
        rr = gg = bb = l;
      } else {
        const hue2rgb = (p, q, t) => {
          if (t < 0) t += 1;
          if (t > 1) t -= 1;
          if (t < 1 / 6) return p + (q - p) * 6 * t;
          if (t < 1 / 2) return q;
          if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
          return p;
        };
        const q = l < 0.5 ? l * (1 + sNew) : l + sNew - l * sNew;
        const p = 2 * l - q;
        rr = hue2rgb(p, q, h + 1 / 3);
        gg = hue2rgb(p, q, h);
        bb = hue2rgb(p, q, h - 1 / 3);
      }

      result[i]     = Math.round(Math.max(0, Math.min(255, rr * 255)));
      result[i + 1] = Math.round(Math.max(0, Math.min(255, gg * 255)));
      result[i + 2] = Math.round(Math.max(0, Math.min(255, bb * 255)));
      if (channels === 4) result[i + 3] = pixels[i + 3];
    }
    return result;
  }

  /**
   * Median filter — for each pixel takes the median R/G/B of the 3x3 neighbourhood.
   * Crushes isolated scattered pixels while keeping hard cartoon edges sharp.
   * @private
   */
  static _medianFilter(pixels, width, height, channels) {
    const result = new Uint8Array(pixels.length);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const rArr = [], gArr = [], bArr = [];
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = Math.max(0, Math.min(width - 1, x + dx));
            const ny = Math.max(0, Math.min(height - 1, y + dy));
            const ni = (ny * width + nx) * channels;
            rArr.push(pixels[ni]);
            gArr.push(pixels[ni + 1]);
            bArr.push(pixels[ni + 2]);
          }
        }
        rArr.sort((a, b) => a - b);
        gArr.sort((a, b) => a - b);
        bArr.sort((a, b) => a - b);
        const mid = 4; // median of 9 values
        const idx = (y * width + x) * channels;
        result[idx]     = rArr[mid];
        result[idx + 1] = gArr[mid];
        result[idx + 2] = bArr[mid];
        if (channels === 4) result[idx + 3] = pixels[idx + 3];
      }
    }
    return result;
  }

  /**
   * Remove isolated pixels: any pixel whose color matches none of its 8 neighbours
   * is replaced by the most common neighbour color.
   * @private
   */
  static _removeIsolatedPixels(pixels, width, height, channels) {
    const result = new Uint8Array(pixels);
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = (y * width + x) * channels;
        const pr = pixels[idx], pg = pixels[idx + 1], pb = pixels[idx + 2];
        const colorCount = new Map();
        let matchFound = false;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const ni = ((y + dy) * width + (x + dx)) * channels;
            const nr = pixels[ni], ng = pixels[ni + 1], nb = pixels[ni + 2];
            if (nr === pr && ng === pg && nb === pb) { matchFound = true; }
            const key = `${nr},${ng},${nb}`;
            colorCount.set(key, (colorCount.get(key) || 0) + 1);
          }
        }
        if (!matchFound) {
          // Replace with most frequent neighbour color
          let best = null, bestCount = 0;
          for (const [key, count] of colorCount) {
            if (count > bestCount) { bestCount = count; best = key; }
          }
          if (best) {
            const [r, g, b] = best.split(',').map(Number);
            result[idx] = r; result[idx + 1] = g; result[idx + 2] = b;
          }
        }
      }
    }
    return result;
  }

  /**
   * Dilate edge mask to create thicker cartoon outlines
   * @private
   */
  static _thickenEdges(edges, width, height, thickness) {
    let mask = edges;
    for (let t = 1; t < thickness; t++) {
      const next = new Uint8Array(mask.length);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (mask[y * width + x] === 255) {
            // Spread to 4-connected neighbours
            for (const [dy, dx] of [[-1,0],[1,0],[0,-1],[0,1]]) {
              const nx = x + dx, ny = y + dy;
              if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                next[ny * width + nx] = 255;
              }
            }
            next[y * width + x] = 255;
          }
        }
      }
      mask = next;
    }
    return mask;
  }

  /**
   * Boost contrast using standard contrast formula
   * @private
   */
  static _boostContrast(pixels, factor) {
    const result = new Uint8Array(pixels.length);
    for (let i = 0; i < pixels.length; i++) {
      // Apply contrast formula: (value - 128) * factor + 128
      const adjusted = Math.round((pixels[i] - 128) * factor + 128);
      result[i] = Math.max(0, Math.min(255, adjusted));
    }
    return result;
  }

  /**
   * Reduce color depth via posterization
   * @private
   */
  static _posterize(pixels, levels) {
    const result = new Uint8Array(pixels.length);
    const step = Math.floor(256 / levels);
    
    for (let i = 0; i < pixels.length; i++) {
      // Quantize to nearest level
      const quantized = Math.round(pixels[i] / step) * step;
      result[i] = Math.min(255, quantized);
    }
    return result;
  }

  /**
   * Edge detection using Sobel filter
   * Returns binary mask (0 or 255) for edges
   * @private
   */
  static _detectEdges(pixels, width, height, channels, threshold) {
    const edges = new Uint8Array(width * height);
    
    // Sobel kernels
    const sobelX = [[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]];
    const sobelY = [[-1, -2, -1], [0, 0, 0], [1, 2, 1]];

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        let gx = 0, gy = 0;

        // Apply Sobel operators
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const idx = ((y + dy) * width + (x + dx)) * channels;
            // Use luminance (average of RGB)
            const pixel = (pixels[idx] + pixels[idx + 1] + pixels[idx + 2]) / 3;
            gx += pixel * sobelX[dy + 1][dx + 1];
            gy += pixel * sobelY[dy + 1][dx + 1];
          }
        }

        // Calculate edge magnitude
        const magnitude = Math.sqrt(gx * gx + gy * gy);
        edges[y * width + x] = magnitude > threshold ? 255 : 0;
      }
    }

    return edges;
  }

  /**
   * Get or create palette
   * @private
   */
  static _getPalette(paletteType, maxColors) {
    const paletteManager = new PaletteManager();
    
    // Map palette types to IDs
    const paletteMap = {
      'PICO-8': 'pico8',
      'NES': 'nes',
      'GAMEBOY': 'gameboy',
      'ENDESGA-32': 'endesga32'
    };

    const paletteId = paletteMap[paletteType];
    
    if (paletteType === 'AUTO' || !paletteId) {
      // Generate harmonic palette
      const generatedPalette = paletteManager.generatePalette('#FF6B6B', maxColors, 'complementary');
      return generatedPalette.colors;
    }

    try {
      const palette = paletteManager.get(paletteId);
      if (palette && palette.colors) {
        const colors = palette.colors;
        if (colors.length > maxColors) {
          return colors.slice(0, maxColors);
        }
        return colors;
      }
    } catch (e) {
      // Fall back to generated palette
    }

    // Generate harmonic palette as fallback
    const generatedPalette = paletteManager.generatePalette('#FF6B6B', maxColors, 'complementary');
    return generatedPalette.colors;
  }

  /**
   * Quantize pixels to nearest palette color
   * @private
   */
  static _quantizeColors(pixels, palette, channels) {
    const result = new Uint8Array(pixels.length);
    
    for (let i = 0; i < pixels.length; i += channels) {
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];

      // Find nearest palette color (Euclidean distance)
      let bestDist = Infinity;
      let bestColor = palette[0];

      for (const color of palette) {
        const dr = color.r - r;
        const dg = color.g - g;
        const db = color.b - b;
        const dist = dr * dr + dg * dg + db * db;

        if (dist < bestDist) {
          bestDist = dist;
          bestColor = color;
        }
      }

      result[i] = bestColor.r;
      result[i + 1] = bestColor.g;
      result[i + 2] = bestColor.b;
      
      // Preserve alpha if present
      if (channels === 4) {
        result[i + 3] = pixels[i + 3];
      }
    }

    return result;
  }

  /**
   * Apply edge outlines to the image
   * @private
   */
  static _applyEdgeOutlines(pixels, edgeMask, width, height, channels, outlineRGB) {
    const result = new Uint8Array(pixels);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const maskIdx = y * width + x;
        
        if (edgeMask[maskIdx] === 255) {
          // Apply outline color
          const pixIdx = maskIdx * channels;
          result[pixIdx] = outlineRGB.r;
          result[pixIdx + 1] = outlineRGB.g;
          result[pixIdx + 2] = outlineRGB.b;
        }
      }
    }

    return result;
  }

  /**
   * Smooth pixels using simple averaging
   * @private
   */
  static _smoothPixels(pixels, width, height, channels, intensity) {
    let result = new Uint8Array(pixels);

    for (let iter = 0; iter < intensity; iter++) {
      const temp = new Uint8Array(pixels.length);

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = (y * width + x) * channels;

          // Average with neighbors
          let sumR = 0, sumG = 0, sumB = 0, count = 0;

          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const nx = x + dx;
              const ny = y + dy;

              if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                const nidx = (ny * width + nx) * channels;
                sumR += result[nidx];
                sumG += result[nidx + 1];
                sumB += result[nidx + 2];
                count++;
              }
            }
          }

          temp[idx] = Math.round(sumR / count);
          temp[idx + 1] = Math.round(sumG / count);
          temp[idx + 2] = Math.round(sumB / count);

          if (channels === 4) {
            temp[idx + 3] = result[idx + 3];
          }
        }
      }

      result = temp;
    }

    return result;
  }

  /**
   * Write pixel data to PixelCanvas
   * @private
   */
  static _writePixelsToCanvas(canvas, pixels, width, height, channels) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * channels;
        const r = pixels[idx];
        const g = pixels[idx + 1];
        const b = pixels[idx + 2];
        const a = channels === 4 ? pixels[idx + 3] : 255;

        canvas.setPixel(x, y, r, g, b, a);
      }
    }
  }

  /**
   * Convert color name to RGB
   * @private
   */
  static _colorToRGB(colorName) {
    const colors = {
      'black': { r: 0, g: 0, b: 0 },
      'white': { r: 255, g: 255, b: 255 },
      'red': { r: 255, g: 0, b: 0 },
      'green': { r: 0, g: 255, b: 0 },
      'blue': { r: 0, g: 0, b: 255 },
      'yellow': { r: 255, g: 255, b: 0 },
      'cyan': { r: 0, g: 255, b: 255 },
      'magenta': { r: 255, g: 0, b: 255 }
    };

    if (colors[colorName.toLowerCase()]) {
      return colors[colorName.toLowerCase()];
    }

    // Try hex color
    if (colorName.startsWith('#')) {
      const hex = colorName.substring(1);
      return {
        r: parseInt(hex.substring(0, 2), 16),
        g: parseInt(hex.substring(2, 4), 16),
        b: parseInt(hex.substring(4, 6), 16)
      };
    }

    return colors['black']; // Default fallback
  }

  /**
   * Get all supported palettes
   */
  static getSupportedPalettes() {
    return ['AUTO', 'PICO-8', 'NES', 'GAMEBOY', 'ENDESGA-32'];
  }

  /**
   * Get cartoonification presets
   */
  static getPresets() {
    return {
      cartoon: {
        pixelDensity: 64,
        preBlur: 0.8,
        enableEdgeDetection: true,
        edgeThreshold: 60,
        contrastBoost: 1.3,
        saturation: 1.7,
        posterization: 5,
        enableOutlines: true,
        outlineColor: 'black',
        outlineThickness: 1,
        palette: 'ENDESGA-32',
        maxColors: 28,
        medianFilter: true,
        cleanIsolated: true,
        smoothing: 0
      },
      highRes: {
        pixelDensity: 64,
        enableEdgeDetection: false,
        contrastBoost: 1.1,
        posterization: 5,
        enableOutlines: false,
        palette: 'AUTO',
        smoothing: 0
      },
      lowRes: {
        pixelDensity: 16,
        enableEdgeDetection: true,
        edgeThreshold: 35,
        contrastBoost: 1.4,
        posterization: 4,
        enableOutlines: true,
        outlineColor: 'black',
        palette: 'PICO-8',
        smoothing: 2
      },
      minimal: {
        pixelDensity: 32,
        enableEdgeDetection: false,
        contrastBoost: 1.0,
        posterization: 8,
        enableOutlines: false,
        palette: 'AUTO',
        smoothing: 0
      }
    };
  }
}

module.exports = ImagePixelizer;
