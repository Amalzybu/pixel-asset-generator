/**
 * generate_walk_sprite.js
 *
 * Converts an existing pixel-art PNG (e.g. from the photo pixelizer) into a
 * walking sprite sheet. Run with:
 *
 *   node generate_walk_sprite.js [inputPng] [options]
 *
 * Examples:
 *   node generate_walk_sprite.js output/photo_9595c6ab.png
 *   node generate_walk_sprite.js output/photo_9595c6ab.png --frames 6 --scale 4 --animation walk
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');
const PixelCanvas = require('./src/canvas/PixelCanvas');
const SpriteSheetGenerator = require('./src/spritesheet/SpriteSheetGenerator');
const { AnimationSystem } = require('./src/animation/AnimationSystem');

// ─── CLI argument parsing ────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { positional: [] };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      args[key] = next && !next.startsWith('--') ? (i++, next) : true;
    } else {
      args.positional.push(arg);
    }
  }
  return args;
}

const args = parseArgs(process.argv);
const inputPath   = args.positional[0] || 'output/photo_9595c6ab.png';
const frameCount  = parseInt(args.frames    || '6', 10);
const outputScale = parseInt(args.scale     || '4', 10);
const animation   = args.animation          || 'walk';
const outputDir   = args.output             || 'output';

// ─── Load PNG → PixelCanvas ──────────────────────────────────────────────────

function loadPNG(filePath) {
  const buf = fs.readFileSync(filePath);
  const png = PNG.sync.read(buf);
  const canvas = new PixelCanvas(png.width, png.height, 1); // scale=1 for logical grid
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const idx = (y * png.width + x) * 4;
      canvas.setPixel(x, y,
        png.data[idx],
        png.data[idx + 1],
        png.data[idx + 2],
        png.data[idx + 3]);
    }
  }
  return canvas;
}

// ─── Walk frame generators ───────────────────────────────────────────────────
// Each generator returns an array of PixelCanvas frames derived from base.
// Shift amounts scale with image size so motion is always visible.

function generateWalkFrames(base, count) {
  const frames = [];
  const fc = Math.max(4, count);
  // Scale shifts proportional to image height (design ref: 16px → shift 1)
  const shiftScale = Math.max(1, Math.round(base.height / 16));
  for (let i = 0; i < fc; i++) {
    const frame = new PixelCanvas(base.width, base.height, base.scale);
    const phase = (i / fc) * Math.PI * 2;
    const legShift  = Math.round(Math.sin(phase) * shiftScale);
    const bounceY   = Math.abs(Math.round(Math.sin(phase) * shiftScale * 0.5));

    for (let y = 0; y < base.height; y++) {
      for (let x = 0; x < base.width; x++) {
        const yNorm = y / base.height;
        let srcX = x;
        let srcY = y - bounceY;
        // Animate lower body (legs)
        if (yNorm > 0.6) {
          srcX = x - legShift;
        }
        if (srcX >= 0 && srcX < base.width && srcY >= 0 && srcY < base.height) {
          const p = base.getPixel(srcX, srcY);
          if (p.a > 0) frame.setPixel(x, y, p.r, p.g, p.b, p.a);
        }
      }
    }
    frames.push(frame);
  }
  return frames;
}

function generateIdleFrames(base, count) {
  const frames = [];
  const fc = Math.max(2, count);
  const shiftScale = Math.max(1, Math.round(base.height / 16));
  for (let i = 0; i < fc; i++) {
    const shift = i % 2 === 0 ? 0 : shiftScale;
    if (shift === 0) {
      frames.push(base.clone());
    } else {
      const temp = new PixelCanvas(base.width, base.height, base.scale);
      for (let y = 0; y < base.height; y++) {
        for (let x = 0; x < base.width; x++) {
          const py = y - shift;
          if (py >= 0 && py < base.height) {
            const p = base.getPixel(x, py);
            temp.setPixel(x, y, p.r, p.g, p.b, p.a);
          }
        }
      }
      frames.push(temp);
    }
  }
  return frames;
}

function generateRunFrames(base, count) {
  const frames = [];
  const fc = Math.max(4, count);
  const shiftScale = Math.max(1, Math.round(base.height / 16));
  for (let i = 0; i < fc; i++) {
    const frame = new PixelCanvas(base.width, base.height, base.scale);
    const phase  = (i / fc) * Math.PI * 2;
    const lean   = Math.round(Math.sin(phase) * shiftScale * 1.5);
    const bounceY = Math.abs(Math.round(Math.sin(phase) * shiftScale));
    for (let y = 0; y < base.height; y++) {
      for (let x = 0; x < base.width; x++) {
        const yNorm = y / base.height;
        let srcX = x;
        let srcY = y - bounceY;
        if (yNorm > 0.5) srcX = x - lean;
        if (srcX >= 0 && srcX < base.width && srcY >= 0 && srcY < base.height) {
          const p = base.getPixel(srcX, srcY);
          if (p.a > 0) frame.setPixel(x, y, p.r, p.g, p.b, p.a);
        }
      }
    }
    frames.push(frame);
  }
  return frames;
}

function generateJumpFrames(base, count) {
  const fc = Math.max(3, count);
  const frames = [];
  const shiftScale = Math.max(1, Math.round(base.height / 16));
  const jumpPhases = [0.3, 0.7, 0.3];
  for (let i = 0; i < fc; i++) {
    const frame = new PixelCanvas(base.width, base.height, base.scale);
    const phaseIdx = Math.floor((i / fc) * 3);
    const yOffset = Math.round(jumpPhases[Math.min(phaseIdx, 2)] * -3 * shiftScale);
    for (let y = 0; y < base.height; y++) {
      for (let x = 0; x < base.width; x++) {
        const srcY = y - yOffset;
        if (srcY >= 0 && srcY < base.height) {
          const p = base.getPixel(x, srcY);
          if (p.a > 0) frame.setPixel(x, y, p.r, p.g, p.b, p.a);
        }
      }
    }
    frames.push(frame);
  }
  return frames;
}

function generateFrames(base, animType, count) {
  switch (animType) {
    case 'walk':  return generateWalkFrames(base, count);
    case 'idle':  return generateIdleFrames(base, count);
    case 'run':   return generateRunFrames(base, count);
    case 'jump':  return generateJumpFrames(base, count);
    default:      return Array.from({ length: count }, () => base.clone());
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

(function main() {
  if (!fs.existsSync(inputPath)) {
    console.error(`Error: file not found: ${inputPath}`);
    process.exit(1);
  }

  console.log(`Loading: ${inputPath}`);
  const baseCanvas = loadPNG(inputPath);
  console.log(`Dimensions: ${baseCanvas.width}×${baseCanvas.height}px`);

  console.log(`Generating ${frameCount} '${animation}' frames...`);
  const frames = generateFrames(baseCanvas, animation, frameCount);

  // Apply output scale to each frame
  const scaledFrames = frames.map(f => {
    const sc = new PixelCanvas(f.width, f.height, outputScale);
    for (let y = 0; y < f.height; y++) {
      for (let x = 0; x < f.width; x++) {
        const p = f.getPixel(x, y);
        sc.setPixel(x, y, p.r, p.g, p.b, p.a);
      }
    }
    return sc;
  });

  // Build animation clip metadata
  const clip = AnimationSystem.createClip(animation, { frames: frames.map((_, i) => i) });

  // Base name derived from input file
  const baseName = path.basename(inputPath, '.png') + `_${animation}`;

  const { canvas: sheet, metadata } = SpriteSheetGenerator.pack(scaledFrames, {
    prefix: 'frame',
    imageName: `${baseName}.png`,
    animations: [clip],
  });

  // Export PNG spritesheet
  fs.mkdirSync(outputDir, { recursive: true });
  const pngOut  = path.join(outputDir, `${baseName}.png`);
  const jsonOut = path.join(outputDir, `${baseName}.json`);

  fs.writeFileSync(pngOut, sheet.toBuffer());
  fs.writeFileSync(jsonOut, JSON.stringify(metadata, null, 2));

  console.log(`\nSpritesheet written → ${pngOut}`);
  console.log(`Metadata written    → ${jsonOut}`);
  console.log(`Frames: ${frames.length}  |  Sheet size: ${metadata.meta.size.w}×${metadata.meta.size.h}px  |  Scale: ${outputScale}x`);
})();
