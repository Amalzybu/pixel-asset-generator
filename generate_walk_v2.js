/**
 * generate_walk_v2.js  —  Segment-based walking animation from a static sprite
 *
 * Instead of crudely sliding rows, this script:
 *   1. Auto-detects head / torso / hip / front-leg / back-leg regions
 *   2. Extracts each as an independent sprite
 *   3. Applies per-segment transforms (shear for legs, counter-swing for arms,
 *      hip drop, head bob) using a proper 8-phase walk cycle
 *   4. Composites segments back-to-front per frame
 *
 * Usage:
 *   node generate_walk_v2.js <input.png> [options]
 *
 * Options:
 *   --frames   Number of animation frames (default: 8)
 *   --scale    Output upscale factor     (default: 6)
 *   --stride   Leg stride intensity 0-1  (default: 0.6)
 *   --output   Output directory           (default: output)
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { PNG } = require('pngjs');
const PixelCanvas = require('./src/canvas/PixelCanvas');
const SpriteSheetGenerator = require('./src/spritesheet/SpriteSheetGenerator');
const { AnimationSystem }  = require('./src/animation/AnimationSystem');

// ──────────────────────────────────────────────────────────────────────────────
// CLI
// ──────────────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const a = { positional: [] };
  for (let i = 2; i < argv.length; i++) {
    const s = argv[i];
    if (s.startsWith('--')) {
      const k = s.slice(2), n = argv[i + 1];
      a[k] = n && !n.startsWith('--') ? (i++, n) : true;
    } else a.positional.push(s);
  }
  return a;
}

const args       = parseArgs(process.argv);
const inputPath  = args.positional[0] || 'output/charcterTest.png';
const FRAMES     = parseInt(args.frames || '8', 10);
const SCALE      = parseInt(args.scale  || '6', 10);
const STRIDE     = parseFloat(args.stride || '0.6');   // 0-1 intensity
const OUTPUT_DIR = args.output || 'output';

// ──────────────────────────────────────────────────────────────────────────────
// PNG ↔ PixelCanvas helpers
// ──────────────────────────────────────────────────────────────────────────────

function loadPNG(filePath) {
  const buf = fs.readFileSync(filePath);
  const png = PNG.sync.read(buf);
  const c   = new PixelCanvas(png.width, png.height, 1);
  for (let y = 0; y < png.height; y++)
    for (let x = 0; x < png.width; x++) {
      const i = (y * png.width + x) * 4;
      c.setPixel(x, y, png.data[i], png.data[i+1], png.data[i+2], png.data[i+3]);
    }
  return c;
}

// ──────────────────────────────────────────────────────────────────────────────
// Auto body-segment detection
// ──────────────────────────────────────────────────────────────────────────────

function analyseSprite(canvas) {
  const w = canvas.width, h = canvas.height;

  // 1. Overall bounding box
  let minX = w, maxX = 0, minY = h, maxY = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (canvas.getPixel(x, y).a > 10) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }

  const bw = maxX - minX + 1, bh = maxY - minY + 1;

  // 2. Row width profile (for finding waist / leg split)
  const rowWidth = [];
  for (let y = minY; y <= maxY; y++) {
    let cnt = 0;
    for (let x = minX; x <= maxX; x++) if (canvas.getPixel(x, y).a > 10) cnt++;
    rowWidth.push(cnt);
  }

  // 3. Find the widest row (usually chest/shoulders) and the narrowest row
  //    between 30-80% down the body (usually waist / crotch).
  const chestSearchStart = Math.floor(bh * 0.1);
  const chestSearchEnd   = Math.floor(bh * 0.5);
  let chestRow = chestSearchStart, chestW = 0;
  for (let r = chestSearchStart; r < chestSearchEnd; r++) {
    if (rowWidth[r] > chestW) { chestW = rowWidth[r]; chestRow = r; }
  }

  // Find waist (narrowest between 40-70% body)
  const waistSearchStart = Math.floor(bh * 0.4);
  const waistSearchEnd   = Math.floor(bh * 0.72);
  let waistRow = waistSearchStart, waistW = 999;
  for (let r = waistSearchStart; r < waistSearchEnd; r++) {
    if (rowWidth[r] < waistW) { waistW = rowWidth[r]; waistRow = r; }
  }

  // Head ends roughly where shoulders begin (first major width increase)
  const headEnd = Math.floor(chestRow * 0.8) || Math.floor(bh * 0.15);

  // Hip / crotch — look for narrowing below waist then widening (two legs)
  // or just use ~55% body height if no clear split
  let hipRow = waistRow;

  // Convert relative rows to absolute Y
  const headY   = minY;
  const headEndY   = minY + headEnd;    // head bottom
  const torsoEndY  = minY + waistRow;   // torso bottom / hip start
  const legStartY  = minY + hipRow;     // legs start (may == torsoEnd)
  const footY      = maxY;

  // 4. Split legs into front/back by vertical center of leg region
  const legMidX = Math.floor((minX + maxX) / 2); // center split

  console.log(`  Body bbox  : (${minX},${minY})-(${maxX},${maxY})  ${bw}×${bh}px`);
  console.log(`  Head       : y ${headY}-${headEndY}`);
  console.log(`  Torso      : y ${headEndY}-${torsoEndY}`);
  console.log(`  Legs       : y ${torsoEndY}-${footY}  split at x=${legMidX}`);

  return { minX, maxX, minY, maxY, bw, bh,
           headY, headEndY, torsoEndY, legStartY, footY, legMidX };
}

// ──────────────────────────────────────────────────────────────────────────────
// Extract a rectangular region from a canvas into a new canvas.
// Pixels outside the original or transparent are left as (0,0,0,0).
// ──────────────────────────────────────────────────────────────────────────────

function extractRegion(src, x0, y0, x1, y1) {
  const rw = x1 - x0 + 1, rh = y1 - y0 + 1;
  const c = new PixelCanvas(src.width, src.height, 1);
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const p = src.getPixel(x, y);
      if (p.a > 0) c.setPixel(x, y, p.r, p.g, p.b, p.a);
    }
  return c;
}

// Extract only pixels matching a mask function
function extractMask(src, maskFn) {
  const c = new PixelCanvas(src.width, src.height, 1);
  for (let y = 0; y < src.height; y++)
    for (let x = 0; x < src.width; x++) {
      const p = src.getPixel(x, y);
      if (p.a > 0 && maskFn(x, y)) c.setPixel(x, y, p.r, p.g, p.b, p.a);
    }
  return c;
}

// ──────────────────────────────────────────────────────────────────────────────
// Transform helpers — shear, translate, composite
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Apply a displacement to every opaque pixel of a segment canvas.
 * displaceFn(x, y) → { dx, dy }   (can be fractional, will round)
 */
function displaceSegment(seg, displaceFn) {
  const out = new PixelCanvas(seg.width, seg.height, seg.scale);
  for (let y = 0; y < seg.height; y++)
    for (let x = 0; x < seg.width; x++) {
      const p = seg.getPixel(x, y);
      if (p.a === 0) continue;
      const { dx, dy } = displaceFn(x, y);
      const nx = Math.round(x + dx);
      const ny = Math.round(y + dy);
      if (nx >= 0 && nx < seg.width && ny >= 0 && ny < seg.height)
        out.setPixel(nx, ny, p.r, p.g, p.b, p.a);
    }
  return out;
}

/**
 * Composite src onto dst (src drawn on top).
 */
function composite(dst, src) {
  for (let y = 0; y < src.height; y++)
    for (let x = 0; x < src.width; x++) {
      const p = src.getPixel(x, y);
      if (p.a > 0) dst.setPixel(x, y, p.r, p.g, p.b, p.a);
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// Walk-cycle keyframe data
//   t ∈ [0, 1) → one full walk cycle
//   We define continuous functions for transforms of each body part.
// ──────────────────────────────────────────────────────────────────────────────

function walkCycle(t, seg, stride) {
  const tau = Math.PI * 2;

  // --- Head: very subtle counter-bob (half freq of body) ---
  const headDY =  Math.sin(t * tau * 2) * 0.5 * stride;
  const headDX =  0;

  // --- Torso: vertical bob (2× per cycle) + slight lean ---
  const torsoDY   = -Math.abs(Math.sin(t * tau)) * 1.2 * stride;  // bounce up
  const torsoDX   =  Math.sin(t * tau) * 0.4 * stride;            // slight sway
  const torsoLean =  Math.sin(t * tau) * 0.15 * stride;           // lean shear

  // --- Hip: same vertical motion as torso but slightly dampened ---
  const hipDY = torsoDY * 0.6;
  const hipDX = torsoDX * 0.8;

  // --- Legs: shear-based swing, opposite phases ---
  // Front leg shear: positive = forward = shift bottom pixels right
  // The shear amount increases linearly from hip to foot.
  const legAmplitude = 3.5 * stride;  // max pixel shift at foot level

  const frontLegShear =  Math.sin(t * tau) * legAmplitude;
  const backLegShear  = -Math.sin(t * tau) * legAmplitude;

  // Leg bob (foot lifts during swing-through)
  const frontLegLift = Math.max(0, -Math.sin(t * tau)) * 1.5 * stride;
  const backLegLift  = Math.max(0,  Math.sin(t * tau)) * 1.5 * stride;

  // --- Arm counter-swing (vertical shift on side columns) ---
  const armSwing = Math.sin(t * tau) * 1.5 * stride;

  return {
    headDX, headDY,
    torsoDX, torsoDY, torsoLean,
    hipDX, hipDY,
    frontLegShear, backLegShear,
    frontLegLift, backLegLift,
    armSwing,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Build one animation frame
// ──────────────────────────────────────────────────────────────────────────────

function buildFrame(base, seg, t, stride) {
  const k = walkCycle(t, seg, stride);
  const { headY, headEndY, torsoEndY, footY, legMidX, minX, maxX } = seg;

  // Extract segments ---------------------------------------------------------
  const headSeg  = extractMask(base, (x, y) => y >= headY && y < headEndY);
  const torsoSeg = extractMask(base, (x, y) => y >= headEndY && y < torsoEndY);
  const frontLeg = extractMask(base, (x, y) => y >= torsoEndY && y <= footY && x >= legMidX);
  const backLeg  = extractMask(base, (x, y) => y >= torsoEndY && y <= footY && x < legMidX);

  // Find exact arm columns (outer 2px on each side of torso)
  const armWidth = Math.max(1, Math.round((maxX - minX) * 0.2));

  // Transform each segment ---------------------------------------------------

  // Head: translate
  const headOut = displaceSegment(headSeg, () => ({
    dx: k.headDX,
    dy: k.headDY + k.torsoDY * 0.3,  // follow body a bit
  }));

  // Torso: translate + slight horizontal shear (lean)
  const torsoOut = displaceSegment(torsoSeg, (x, y) => {
    const yNorm = (y - headEndY) / Math.max(1, torsoEndY - headEndY);
    // Arm swing: if pixel is on far left or far right of torso, add vertical shift
    let armDY = 0;
    if (x <= minX + armWidth) armDY = k.armSwing;        // back arm
    else if (x >= maxX - armWidth) armDY = -k.armSwing;  // front arm
    return {
      dx: k.torsoDX + k.torsoLean * yNorm,
      dy: k.torsoDY + armDY,
    };
  });

  // Front leg: shear from hip → foot
  const legHeight = Math.max(1, footY - torsoEndY);
  const frontOut = displaceSegment(frontLeg, (x, y) => {
    const yNorm = (y - torsoEndY) / legHeight;  // 0 at hip, 1 at foot
    return {
      dx: k.frontLegShear * yNorm + k.hipDX,
      dy: k.hipDY - k.frontLegLift * Math.sin(yNorm * Math.PI),
    };
  });

  // Back leg: opposite shear
  const backOut = displaceSegment(backLeg, (x, y) => {
    const yNorm = (y - torsoEndY) / legHeight;
    return {
      dx: k.backLegShear * yNorm + k.hipDX,
      dy: k.hipDY - k.backLegLift * Math.sin(yNorm * Math.PI),
    };
  });

  // Composite: back-leg → torso → head → front-leg (painter's order)
  const frame = new PixelCanvas(base.width, base.height, 1);
  composite(frame, backOut);
  composite(frame, torsoOut);
  composite(frame, headOut);
  composite(frame, frontOut);

  return frame;
}

// ──────────────────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────────────────

(function main() {
  if (!fs.existsSync(inputPath)) {
    console.error(`Error: file not found: ${inputPath}`);
    process.exit(1);
  }

  console.log(`Loading: ${inputPath}`);
  const base = loadPNG(inputPath);
  console.log(`Source: ${base.width}×${base.height}px`);

  console.log('Analysing body segments...');
  const seg = analyseSprite(base);

  console.log(`Generating ${FRAMES}-frame walk cycle (stride=${STRIDE})...`);
  const frames = [];
  for (let i = 0; i < FRAMES; i++) {
    const t = i / FRAMES;  // 0 → 1 over one cycle
    const frame = buildFrame(base, seg, t, STRIDE);
    frames.push(frame);
  }

  // Upscale each frame
  const scaled = frames.map(f => {
    const sc = new PixelCanvas(f.width, f.height, SCALE);
    for (let y = 0; y < f.height; y++)
      for (let x = 0; x < f.width; x++) {
        const p = f.getPixel(x, y);
        if (p.a > 0) sc.setPixel(x, y, p.r, p.g, p.b, p.a);
      }
    return sc;
  });

  // Build spritesheet
  const baseName = path.basename(inputPath, '.png') + '_walk_v2';
  const clip = AnimationSystem.createClip('walk', {
    frames: frames.map((_, i) => i),
    fps: 8,
  });

  const { canvas: sheet, metadata } = SpriteSheetGenerator.pack(scaled, {
    prefix: 'walk',
    imageName: `${baseName}.png`,
    animations: [clip],
  });

  // Export
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const pngOut  = path.join(OUTPUT_DIR, `${baseName}.png`);
  const jsonOut = path.join(OUTPUT_DIR, `${baseName}.json`);
  fs.writeFileSync(pngOut, sheet.toBuffer());
  fs.writeFileSync(jsonOut, JSON.stringify(metadata, null, 2));

  // Also export individual frames for review
  const framesDir = path.join(OUTPUT_DIR, `${baseName}_frames`);
  fs.mkdirSync(framesDir, { recursive: true });
  for (let i = 0; i < scaled.length; i++) {
    fs.writeFileSync(
      path.join(framesDir, `frame_${String(i).padStart(2, '0')}.png`),
      scaled[i].toBuffer()
    );
  }

  console.log(`\nSpritesheet  → ${pngOut}`);
  console.log(`Metadata     → ${jsonOut}`);
  console.log(`Ind. frames  → ${framesDir}/`);
  console.log(`Frames: ${FRAMES}  |  Sheet: ${metadata.meta.size.w}×${metadata.meta.size.h}px  |  Scale: ${SCALE}x`);
})();
