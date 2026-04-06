/**
 * generate_jump_sprite.js  —  Color-segmented skeletal jump animation
 *
 * APPROACH  (mirrors generate_walk_v3.js):
 *   1. Color clustering → identify body-part pixel groups
 *   2. Connected component labeling → discrete regions
 *   3. Anatomical classification → head / torso / left-arm / right-arm / left-leg / right-leg
 *   4. Joint pivot detection → shoulder, hip, knee pivots
 *   5. Keyframe-based animation → crouch → push-off → airborne → peak → descent → land
 *
 * Usage:
 *   node generate_jump_sprite.js <input.png> [options]
 *
 * Options:
 *   --frames   Number of frames (default: 8)
 *   --scale    Output upscale   (default: 6)
 *   --power    Jump intensity 0-1 (default: 0.8)
 *   --output   Output directory   (default: output)
 *   --debug    Export debug visualizations (default: false)
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
const POWER      = parseFloat(args.power || '0.8');
const OUTPUT_DIR = args.output || 'output';
const DEBUG      = !!args.debug;
const ASEPRITE   = !!args.aseprite;

// ──────────────────────────────────────────────────────────────────────────────
// PNG helpers
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
// Color distance (Euclidean RGB)
// ──────────────────────────────────────────────────────────────────────────────

function colorDist(a, b) {
  return Math.sqrt((a.r-b.r)**2 + (a.g-b.g)**2 + (a.b-b.b)**2);
}

// ──────────────────────────────────────────────────────────────────────────────
// K-Means color clustering
// ──────────────────────────────────────────────────────────────────────────────

function kMeansClustering(canvas, k = 6, iterations = 20) {
  const pixels = [];
  for (let y = 0; y < canvas.height; y++)
    for (let x = 0; x < canvas.width; x++) {
      const p = canvas.getPixel(x, y);
      if (p.a > 20) pixels.push({ x, y, r: p.r, g: p.g, b: p.b, a: p.a });
    }

  if (pixels.length === 0) return { labels: [], centroids: [], pixels };

  // k-means++ seeding
  const centroids = [{ r: pixels[0].r, g: pixels[0].g, b: pixels[0].b }];
  for (let c = 1; c < k; c++) {
    const dists = pixels.map(p => {
      const minD = Math.min(...centroids.map(ct => colorDist(p, ct)));
      return minD * minD;
    });
    const total = dists.reduce((s, d) => s + d, 0);
    let rnd = Math.random() * total, acc = 0;
    for (let i = 0; i < pixels.length; i++) {
      acc += dists[i];
      if (acc >= rnd) {
        centroids.push({ r: pixels[i].r, g: pixels[i].g, b: pixels[i].b });
        break;
      }
    }
  }

  const labels = new Array(pixels.length).fill(0);
  for (let iter = 0; iter < iterations; iter++) {
    for (let i = 0; i < pixels.length; i++) {
      let bestC = 0, bestD = Infinity;
      for (let c = 0; c < k; c++) {
        const d = colorDist(pixels[i], centroids[c]);
        if (d < bestD) { bestD = d; bestC = c; }
      }
      labels[i] = bestC;
    }
    const sums = Array.from({ length: k }, () => ({ r: 0, g: 0, b: 0, n: 0 }));
    for (let i = 0; i < pixels.length; i++) {
      const s = sums[labels[i]];
      s.r += pixels[i].r; s.g += pixels[i].g; s.b += pixels[i].b; s.n++;
    }
    for (let c = 0; c < k; c++) {
      if (sums[c].n > 0) {
        centroids[c].r = Math.round(sums[c].r / sums[c].n);
        centroids[c].g = Math.round(sums[c].g / sums[c].n);
        centroids[c].b = Math.round(sums[c].b / sums[c].n);
      }
    }
  }

  return { labels, centroids, pixels };
}

// ──────────────────────────────────────────────────────────────────────────────
// Connected Component Labeling (4-connected)
// ──────────────────────────────────────────────────────────────────────────────

function connectedComponents(canvas, clusterLabels, pixels) {
  const w = canvas.width, h = canvas.height;
  const grid = Array.from({ length: h }, () => new Int16Array(w).fill(-1));
  for (let i = 0; i < pixels.length; i++) {
    grid[pixels[i].y][pixels[i].x] = clusterLabels[i];
  }

  const ccGrid = Array.from({ length: h }, () => new Int16Array(w).fill(-1));
  const components = [];
  let ccId = 0;

  const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (grid[y][x] < 0 || ccGrid[y][x] >= 0) continue;

      const cluster = grid[y][x];
      const queue = [{ x, y }];
      const ccPixels = [];
      ccGrid[y][x] = ccId;

      while (queue.length > 0) {
        const cur = queue.shift();
        ccPixels.push(cur);
        for (const [dx, dy] of dirs) {
          const nx = cur.x + dx, ny = cur.y + dy;
          if (nx >= 0 && nx < w && ny >= 0 && ny < h &&
              grid[ny][nx] === cluster && ccGrid[ny][nx] < 0) {
            ccGrid[ny][nx] = ccId;
            queue.push({ x: nx, y: ny });
          }
        }
      }

      let minX = w, maxX = 0, minY = h, maxY = 0, sumX = 0, sumY = 0;
      for (const p of ccPixels) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
        sumX += p.x; sumY += p.y;
      }

      components.push({
        id: ccId, cluster, pixels: ccPixels, area: ccPixels.length,
        minX, maxX, minY, maxY,
        centroidX: sumX / ccPixels.length,
        centroidY: sumY / ccPixels.length,
      });

      ccId++;
    }
  }

  return { components, ccGrid, grid };
}

// ──────────────────────────────────────────────────────────────────────────────
// Body Part Classification
// ──────────────────────────────────────────────────────────────────────────────

const BODY_PARTS = {
  HEAD: 'head',
  TORSO: 'torso',
  LEFT_ARM: 'left_arm',
  RIGHT_ARM: 'right_arm',
  LEFT_LEG: 'left_leg',
  RIGHT_LEG: 'right_leg',
  OUTLINE: 'outline',
  OTHER: 'other',
};

function classifyBodyParts(components, centroids, bodyBBox) {
  const { minY, maxY, minX, maxX } = bodyBBox;
  const bodyH = maxY - minY + 1;
  const bodyCenterX = (minX + maxX) / 2;

  const centroidTypes = centroids.map(c => {
    const brightness = (c.r + c.g + c.b) / 3;
    return { isBlack: brightness < 25, isDark: brightness < 60, brightness };
  });

  const bodyParts = new Map();
  for (const name of Object.values(BODY_PARTS)) bodyParts.set(name, []);

  const headEndY    = minY + Math.round(bodyH * 0.2);
  const torsoEndY   = minY + Math.round(bodyH * 0.55);

  // Find leg center X (gap between legs)
  let legCenterX = bodyCenterX;
  const gapSearchStartY = Math.round(minY + bodyH * 0.65);
  const gapSearchEndY   = Math.round(minY + bodyH * 0.9);
  const colCounts = {};
  for (const comp of components) {
    for (const p of comp.pixels) {
      if (p.y >= gapSearchStartY && p.y <= gapSearchEndY) {
        colCounts[p.x] = (colCounts[p.x] || 0) + 1;
      }
    }
  }
  let gapCol = Math.round(bodyCenterX), minCount = Infinity;
  for (let x = Math.round(bodyCenterX - 3); x <= Math.round(bodyCenterX + 3); x++) {
    const cnt = colCounts[x] || 0;
    if (cnt < minCount) { minCount = cnt; gapCol = x; }
  }
  legCenterX = gapCol;

  for (const comp of components) {
    const ct = centroidTypes[comp.cluster];
    const relY = (comp.centroidY - minY) / bodyH;
    const relX = comp.centroidX - bodyCenterX;

    if (ct.isBlack && comp.area > 10) {
      bodyParts.get(BODY_PARTS.OUTLINE).push(comp.id);
      comp.part = BODY_PARTS.OUTLINE;
      continue;
    }

    if (relY < 0.2) {
      bodyParts.get(BODY_PARTS.HEAD).push(comp.id);
      comp.part = BODY_PARTS.HEAD;
    } else if (relY < 0.55) {
      if (relX < -3) {
        bodyParts.get(BODY_PARTS.LEFT_ARM).push(comp.id);
        comp.part = BODY_PARTS.LEFT_ARM;
      } else if (relX > 3) {
        bodyParts.get(BODY_PARTS.RIGHT_ARM).push(comp.id);
        comp.part = BODY_PARTS.RIGHT_ARM;
      } else {
        bodyParts.get(BODY_PARTS.TORSO).push(comp.id);
        comp.part = BODY_PARTS.TORSO;
      }
    } else if (relY < 0.92) {
      if (comp.centroidX < legCenterX) {
        bodyParts.get(BODY_PARTS.LEFT_LEG).push(comp.id);
        comp.part = BODY_PARTS.LEFT_LEG;
      } else {
        bodyParts.get(BODY_PARTS.RIGHT_LEG).push(comp.id);
        comp.part = BODY_PARTS.RIGHT_LEG;
      }
    } else {
      // Feet → merge into their leg
      if (comp.centroidX < legCenterX) {
        bodyParts.get(BODY_PARTS.LEFT_LEG).push(comp.id);
        comp.part = BODY_PARTS.LEFT_LEG;
      } else {
        bodyParts.get(BODY_PARTS.RIGHT_LEG).push(comp.id);
        comp.part = BODY_PARTS.RIGHT_LEG;
      }
    }
  }

  return { bodyParts, headEndY, torsoEndY, legCenterX, bodyCenterX };
}

// ──────────────────────────────────────────────────────────────────────────────
// Build body part pixel masks
// ──────────────────────────────────────────────────────────────────────────────

function buildPartMasks(canvas, components, classification) {
  const w = canvas.width, h = canvas.height;
  const { headEndY, torsoEndY, legCenterX, bodyCenterX } = classification;

  let minY = h, maxY = 0;
  for (const comp of components) {
    if (comp.minY < minY) minY = comp.minY;
    if (comp.maxY > maxY) maxY = comp.maxY;
  }
  const bodyH = maxY - minY + 1;

  const MIN_COMPONENT_AREA = Math.max(4, Math.round(canvas.width * canvas.height * 0.0008));
  for (const comp of components) {
    if (comp.area < MIN_COMPONENT_AREA && comp.part !== BODY_PARTS.OUTLINE) {
      const relY = (comp.centroidY - minY) / bodyH;
      if (relY < 0.2) comp.part = BODY_PARTS.HEAD;
      else if (relY < 0.55) comp.part = BODY_PARTS.TORSO;
      else comp.part = comp.centroidX < legCenterX ? BODY_PARTS.LEFT_LEG : BODY_PARTS.RIGHT_LEG;
    }
  }

  const partGrid = Array.from({ length: h }, () => new Array(w).fill(null));
  for (const comp of components) {
    for (const p of comp.pixels) {
      if (comp.part && comp.part !== BODY_PARTS.OUTLINE) {
        partGrid[p.y][p.x] = comp.part;
      }
    }
  }

  // Assign outline pixels by position
  const outlinePixels = [];
  for (const comp of components) {
    if (comp.part === BODY_PARTS.OUTLINE) {
      for (const p of comp.pixels) outlinePixels.push(p);
    }
  }
  for (const p of outlinePixels) {
    const relY = (p.y - minY) / bodyH;
    if (relY < 0.2) {
      partGrid[p.y][p.x] = BODY_PARTS.HEAD;
    } else if (relY < 0.55) {
      partGrid[p.y][p.x] = BODY_PARTS.TORSO;
    } else {
      partGrid[p.y][p.x] = p.x < legCenterX ? BODY_PARTS.LEFT_LEG : BODY_PARTS.RIGHT_LEG;
    }
  }

  const parts = {};
  for (const partName of Object.values(BODY_PARTS)) {
    if (partName === BODY_PARTS.OUTLINE || partName === BODY_PARTS.OTHER) continue;
    parts[partName] = {
      canvas: new PixelCanvas(w, h, 1),
      pixels: [], minX: w, maxX: 0, minY: h, maxY: 0, sumX: 0, sumY: 0,
    };
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const partName = partGrid[y][x];
      if (!partName || !parts[partName]) continue;
      const p = canvas.getPixel(x, y);
      if (p.a < 20) continue;
      const part = parts[partName];
      part.canvas.setPixel(x, y, p.r, p.g, p.b, p.a);
      part.pixels.push({ x, y });
      part.sumX += x; part.sumY += y;
      if (x < part.minX) part.minX = x;
      if (x > part.maxX) part.maxX = x;
      if (y < part.minY) part.minY = y;
      if (y > part.maxY) part.maxY = y;
    }
  }

  for (const part of Object.values(parts)) {
    if (part.pixels.length > 0) {
      part.centroidX = part.sumX / part.pixels.length;
      part.centroidY = part.sumY / part.pixels.length;
    }
  }

  return parts;
}

// ──────────────────────────────────────────────────────────────────────────────
// Joint / pivot point detection
// ──────────────────────────────────────────────────────────────────────────────

function detectJoints(parts) {
  const joints = {};

  const head = parts[BODY_PARTS.HEAD];
  if (head && head.pixels.length > 0) {
    joints.neck = { x: Math.round(head.centroidX), y: head.maxY };
  }

  const ll = parts[BODY_PARTS.LEFT_LEG];
  if (ll && ll.pixels.length > 0) {
    joints.leftHip   = { x: Math.round(ll.centroidX), y: ll.minY };
    joints.leftKnee  = { x: Math.round(ll.centroidX), y: Math.round((ll.minY + ll.maxY) / 2) };
    joints.leftAnkle = { x: Math.round(ll.centroidX), y: ll.maxY };
  }

  const rl = parts[BODY_PARTS.RIGHT_LEG];
  if (rl && rl.pixels.length > 0) {
    joints.rightHip   = { x: Math.round(rl.centroidX), y: rl.minY };
    joints.rightKnee  = { x: Math.round(rl.centroidX), y: Math.round((rl.minY + rl.maxY) / 2) };
    joints.rightAnkle = { x: Math.round(rl.centroidX), y: rl.maxY };
  }

  const torso = parts[BODY_PARTS.TORSO];
  if (torso && torso.pixels.length > 0) {
    joints.torsoCenter    = { x: Math.round(torso.centroidX), y: Math.round(torso.centroidY) };
    joints.hipCenter      = { x: Math.round(torso.centroidX), y: torso.maxY };
    joints.shoulderCenter = { x: Math.round(torso.centroidX), y: torso.minY };
  }

  const la = parts[BODY_PARTS.LEFT_ARM];
  if (la && la.pixels.length > 0) {
    joints.leftShoulder = { x: Math.round(la.centroidX), y: la.minY };
  } else if (joints.shoulderCenter) {
    joints.leftShoulder = { ...joints.shoulderCenter };
  }
  const ra = parts[BODY_PARTS.RIGHT_ARM];
  if (ra && ra.pixels.length > 0) {
    joints.rightShoulder = { x: Math.round(ra.centroidX), y: ra.minY };
  } else if (joints.shoulderCenter) {
    joints.rightShoulder = { ...joints.shoulderCenter };
  }

  return joints;
}

// ──────────────────────────────────────────────────────────────────────────────
// Rotation of pixel region around a pivot point (inverse-mapping)
// ──────────────────────────────────────────────────────────────────────────────

function rotatePartAroundPivot(partCanvas, pivotX, pivotY, angleDeg, translateDX = 0, translateDY = 0) {
  const out = new PixelCanvas(partCanvas.width, partCanvas.height, 1);
  const rad = -angleDeg * Math.PI / 180;
  const cosA = Math.cos(rad), sinA = Math.sin(rad);

  for (let y = 0; y < partCanvas.height; y++) {
    for (let x = 0; x < partCanvas.width; x++) {
      const dx = x - translateDX - pivotX;
      const dy = y - translateDY - pivotY;
      const srcX = Math.round(dx * cosA - dy * sinA + pivotX);
      const srcY = Math.round(dx * sinA + dy * cosA + pivotY);

      if (srcX >= 0 && srcX < partCanvas.width && srcY >= 0 && srcY < partCanvas.height) {
        const p = partCanvas.getPixel(srcX, srcY);
        if (p.a > 0) out.setPixel(x, y, p.r, p.g, p.b, p.a);
      }
    }
  }
  return out;
}

// ──────────────────────────────────────────────────────────────────────────────
// deSpeckle: remove isolated pixels (no opaque 4-connected neighbor)
// ──────────────────────────────────────────────────────────────────────────────

function deSpeckle(canvas) {
  const out = new PixelCanvas(canvas.width, canvas.height, 1);
  const w = canvas.width, h = canvas.height;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = canvas.getPixel(x, y);
      if (p.a === 0) continue;
      const hasNeighbor =
        (x > 0   && canvas.getPixel(x-1, y).a > 0) ||
        (x < w-1 && canvas.getPixel(x+1, y).a > 0) ||
        (y > 0   && canvas.getPixel(x, y-1).a > 0) ||
        (y < h-1 && canvas.getPixel(x, y+1).a > 0);
      if (hasNeighbor) out.setPixel(x, y, p.r, p.g, p.b, p.a);
    }
  }
  return out;
}

// ──────────────────────────────────────────────────────────────────────────────
// Helper: translate a part (simple shift)
// ──────────────────────────────────────────────────────────────────────────────

function translatePart(partCanvas, dx, dy) {
  const out = new PixelCanvas(partCanvas.width, partCanvas.height, 1);
  for (let y = 0; y < partCanvas.height; y++)
    for (let x = 0; x < partCanvas.width; x++) {
      const p = partCanvas.getPixel(x, y);
      if (p.a > 0) {
        const nx = Math.round(x + dx), ny = Math.round(y + dy);
        if (nx >= 0 && nx < partCanvas.width && ny >= 0 && ny < partCanvas.height)
          out.setPixel(nx, ny, p.r, p.g, p.b, p.a);
      }
    }
  return out;
}

// ──────────────────────────────────────────────────────────────────────────────
// Composite helper
// ──────────────────────────────────────────────────────────────────────────────

function composite(dst, src) {
  for (let y = 0; y < src.height; y++)
    for (let x = 0; x < src.width; x++) {
      const p = src.getPixel(x, y);
      if (p.a > 0) dst.setPixel(x, y, p.r, p.g, p.b, p.a);
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// Jump cycle keyframes  (inspired by Mega Man X / platformer jump arcs)
//
//   t ∈ [0, 1) → one full jump cycle
//   Phase breakdown (8 frames):
//     0.000 – 0.125  Idle / ready           (frame 0)
//     0.125 – 0.250  Anticipation crouch    (frame 1)  — deep squat, arms back
//     0.250 – 0.375  Push-off / launch      (frame 2)  — legs extend, arms swing up
//     0.375 – 0.500  Rising / ascent        (frame 3)  — body upright, legs trail
//     0.500 – 0.625  Peak / apex            (frame 4)  — full extension
//     0.625 – 0.750  Descent                (frame 5)  — legs reach down
//     0.750 – 0.875  Landing impact         (frame 6)  — deep absorption squat
//     0.875 – 1.000  Recovery               (frame 7)  — return to idle
//
//   IMPORTANT: bodyLift is applied as a WHOLE-FRAME translate in buildFrame,
//   NOT passed to individual part rotations. This prevents part-drift.
// ──────────────────────────────────────────────────────────────────────────────

function jumpCycleKeyframes(t, power, bodyH) {
  const p = power;

  function phaseT(start, end) {
    if (t < start) return 0;
    if (t >= end) return 1;
    return (t - start) / (end - start);
  }

  function easeInOut(v) { return v * v * (3 - 2 * v); }
  function easeOut(v)   { return 1 - (1 - v) * (1 - v); }
  function easeIn(v)    { return v * v; }

  // ── Vertical translation (whole-frame lift) ───────────────────────────
  // Scale jump height relative to body height so small/large sprites both work.
  // Positive = down (crouch dip), negative = up (airborne).
  const jumpHeight = Math.round(bodyH * 0.35 * p);  // peak ~35% of body height
  const crouchDip  = Math.round(Math.max(3, bodyH * 0.10 * p));
  let bodyLift = 0;

  if (t < 0.125) {
    bodyLift = 0;
  } else if (t < 0.25) {
    // Crouch dip — deeper squat
    const ct = easeInOut(phaseT(0.125, 0.25));
    bodyLift = ct * crouchDip;
  } else if (t < 0.375) {
    // Push-off: rise from crouch through neutral into air
    const ct = easeIn(phaseT(0.25, 0.375));
    bodyLift = (1 - ct) * crouchDip - ct * jumpHeight * 0.5;
  } else if (t < 0.625) {
    // Airborne parabola  (peak at t=0.5)
    const mid = (t - 0.375) / (0.625 - 0.375); // 0→1
    bodyLift = -(4 * mid * (1 - mid)) * jumpHeight;
  } else if (t < 0.75) {
    // Descent → approaching ground
    const ct = easeIn(phaseT(0.625, 0.75));
    bodyLift = -(1 - ct) * jumpHeight * 0.25;
  } else if (t < 0.875) {
    // Landing: slight dip
    const ct = easeOut(phaseT(0.75, 0.875));
    bodyLift = ct * crouchDip;
  } else {
    // Recovery
    const ct = easeInOut(phaseT(0.875, 1.0));
    bodyLift = (1 - ct) * crouchDip;
  }

  // ── Leg pose ──────────────────────────────────────────────────────────
  // Visible knee-tuck is the key "action" pose for a jump sprite.
  // Crouch: deep squat.  Airborne: knees pulled up high.  Landing: absorb.
  let kneeBend = 0;
  let hipBend  = 0;

  if (t < 0.125) {
    kneeBend = 0; hipBend = 0;
  } else if (t < 0.25) {
    // Anticipation crouch — deep squat, knees visibly bent
    const ct = easeInOut(phaseT(0.125, 0.25));
    kneeBend = ct * 30 * p;
    hipBend  = ct * 12 * p;
  } else if (t < 0.375) {
    // Push-off — legs straighten explosively
    const ct = easeIn(phaseT(0.25, 0.375));
    kneeBend = (1 - ct) * 30 * p;
    hipBend  = (1 - ct) * 12 * p - ct * 5 * p;
  } else if (t < 0.5) {
    // Ascending — knees tuck UP hard (the signature jump pose)
    const ct = easeOut(phaseT(0.375, 0.5));
    kneeBend = ct * 35 * p;            // strong knee tuck
    hipBend  = -5 * p + ct * (-10) * p; // hips rotate legs backward/up
  } else if (t < 0.625) {
    // Peak — hold the tuck, legs bent underneath body
    const ct = easeInOut(phaseT(0.5, 0.625));
    kneeBend = 35 * p - ct * 10 * p;   // slight release from max tuck
    hipBend  = -15 * p + ct * 8 * p;   // start extending
  } else if (t < 0.75) {
    // Descent — legs extend downward to prepare for landing
    const ct = easeIn(phaseT(0.625, 0.75));
    kneeBend = 25 * p * (1 - ct);      // straighten out
    hipBend  = -7 * p + ct * 12 * p;   // legs swing forward/down
  } else if (t < 0.875) {
    // Landing impact — deep absorption bend, visibly crouched
    const ct = easeOut(phaseT(0.75, 0.875));
    kneeBend = ct * 32 * p;
    hipBend  = 5 * p + ct * 8 * p;
  } else {
    // Recovery — return to standing
    const ct = easeInOut(phaseT(0.875, 1.0));
    kneeBend = (1 - ct) * 32 * p;
    hipBend  = (1 - ct) * 13 * p;
  }

  // ── Arm swing ─────────────────────────────────────────────────────────
  // Negative = arms swing upward/backward.  Keep moderate for pixel art.
  let armRaise = 0;

  if (t < 0.125) {
    armRaise = 0;
  } else if (t < 0.25) {
    // Crouch: arms pull back
    const ct = easeInOut(phaseT(0.125, 0.25));
    armRaise = ct * 8 * p;
  } else if (t < 0.375) {
    // Push-off: arms swing up forcefully
    const ct = easeIn(phaseT(0.25, 0.375));
    armRaise = 8 * p - ct * 28 * p;
  } else if (t < 0.625) {
    // Airborne: arms held up, slight relax at peak
    const ct = easeInOut(phaseT(0.375, 0.625));
    armRaise = -20 * p + ct * 5 * p;
  } else if (t < 0.75) {
    // Descent: arms come down
    const ct = easeIn(phaseT(0.625, 0.75));
    armRaise = -15 * p + ct * 15 * p;
  } else if (t < 0.875) {
    // Landing: arms forward for balance
    const ct = easeOut(phaseT(0.75, 0.875));
    armRaise = ct * 6 * p;
  } else {
    const ct = easeInOut(phaseT(0.875, 1.0));
    armRaise = (1 - ct) * 6 * p;
  }

  // ── Torso lean ─────────────────────────────────────────────────────────
  // Slightly increased to complement the deeper knee bends.
  let torsoLean = 0;

  if (t < 0.125) {
    torsoLean = 0;
  } else if (t < 0.25) {
    const ct = easeInOut(phaseT(0.125, 0.25));
    torsoLean = ct * 5 * p;            // lean forward in deep crouch
  } else if (t < 0.375) {
    const ct = easeIn(phaseT(0.25, 0.375));
    torsoLean = (1 - ct) * 5 * p;      // straighten during launch
  } else if (t < 0.625) {
    torsoLean = -2 * p;                // slight backward arch in air
  } else if (t < 0.75) {
    const ct = easeIn(phaseT(0.625, 0.75));
    torsoLean = -2 * p + ct * 4 * p;   // tilt forward for landing
  } else if (t < 0.875) {
    const ct = easeOut(phaseT(0.75, 0.875));
    torsoLean = 2 * p + ct * 4 * p;    // deep forward lean on impact
  } else {
    const ct = easeInOut(phaseT(0.875, 1.0));
    torsoLean = (1 - ct) * 6 * p;
  }

  return { bodyLift, kneeBend, hipBend, armRaise, torsoLean };
}

// ──────────────────────────────────────────────────────────────────────────────
// Animate leg pair for jump (both legs move together)
// ──────────────────────────────────────────────────────────────────────────────

function animateJumpLeg(legPart, hipJoint, kneeJoint, hipAngle, kneeAngle) {
  if (!legPart || legPart.pixels.length === 0) {
    return new PixelCanvas(legPart ? legPart.canvas.width : 50, legPart ? legPart.canvas.height : 50, 1);
  }

  const c = legPart.canvas;
  const w = c.width, h = c.height;

  // Split into upper leg (hip to knee) and lower leg (knee to foot)
  const upperLeg = new PixelCanvas(w, h, 1);
  const lowerLeg = new PixelCanvas(w, h, 1);

  for (const p of legPart.pixels) {
    const px = c.getPixel(p.x, p.y);
    if (px.a === 0) continue;
    if (p.y <= kneeJoint.y) {
      upperLeg.setPixel(p.x, p.y, px.r, px.g, px.b, px.a);
    } else {
      lowerLeg.setPixel(p.x, p.y, px.r, px.g, px.b, px.a);
    }
  }

  // Rotate upper leg around hip (NO bodyDY — lift applied to whole frame later)
  const upperRotated = deSpeckle(rotatePartAroundPivot(upperLeg, hipJoint.x, hipJoint.y, hipAngle));

  // Compute new knee position after hip rotation
  const hipRad = hipAngle * Math.PI / 180;
  const kneeNewX = hipJoint.x + Math.cos(hipRad) * (kneeJoint.x - hipJoint.x)
                              - Math.sin(hipRad) * (kneeJoint.y - hipJoint.y);
  const kneeNewY = hipJoint.y + Math.sin(hipRad) * (kneeJoint.x - hipJoint.x)
                              + Math.cos(hipRad) * (kneeJoint.y - hipJoint.y);

  // Rotate lower leg: first with hip, then apply knee bend
  const lowerWithHip = rotatePartAroundPivot(lowerLeg, hipJoint.x, hipJoint.y, hipAngle);
  const lowerFinal   = deSpeckle(rotatePartAroundPivot(lowerWithHip, Math.round(kneeNewX), Math.round(kneeNewY), kneeAngle));

  const result = new PixelCanvas(w, h, 1);
  composite(result, upperRotated);
  composite(result, lowerFinal);

  return result;
}

// ──────────────────────────────────────────────────────────────────────────────
// Build one complete jump animation frame
// ──────────────────────────────────────────────────────────────────────────────

function buildFrame(base, parts, joints, t, power, bodyH) {
  const kf = jumpCycleKeyframes(t, power, bodyH);
  const w = base.width, h = base.height;

  // 1) Compose the POSE at neutral position (no vertical lift yet)
  const pose = new PixelCanvas(w, h, 1);

  // Both legs animate symmetrically
  const leftLegAnim = animateJumpLeg(
    parts[BODY_PARTS.LEFT_LEG],
    joints.leftHip  || joints.hipCenter || { x: 22, y: 27 },
    joints.leftKnee || { x: 22, y: 35 },
    kf.hipBend,
    kf.kneeBend
  );

  const rightLegAnim = animateJumpLeg(
    parts[BODY_PARTS.RIGHT_LEG],
    joints.rightHip  || joints.hipCenter || { x: 26, y: 27 },
    joints.rightKnee || { x: 26, y: 35 },
    kf.hipBend,
    kf.kneeBend
  );

  // Upper body (head + torso as one unit, tiny lean only)
  const upperBodyCanvas = new PixelCanvas(w, h, 1);
  composite(upperBodyCanvas, parts[BODY_PARTS.TORSO].canvas);
  composite(upperBodyCanvas, parts[BODY_PARTS.HEAD].canvas);

  const upperBodyAnim = deSpeckle(rotatePartAroundPivot(
    upperBodyCanvas,
    joints.hipCenter ? joints.hipCenter.x : 24,
    joints.hipCenter ? joints.hipCenter.y : 27,
    kf.torsoLean
  ));

  // Arms: both swing together
  const leftArm  = parts[BODY_PARTS.LEFT_ARM];
  const rightArm = parts[BODY_PARTS.RIGHT_ARM];
  const lShoulder = joints.leftShoulder  || joints.shoulderCenter || { x: 22, y: 12 };
  const rShoulder = joints.rightShoulder || joints.shoulderCenter || { x: 26, y: 12 };

  const leftArmAnim = leftArm && leftArm.pixels.length > 0
    ? deSpeckle(rotatePartAroundPivot(leftArm.canvas, lShoulder.x, lShoulder.y, kf.armRaise * 0.9))
    : new PixelCanvas(w, h, 1);
  const rightArmAnim = rightArm && rightArm.pixels.length > 0
    ? deSpeckle(rotatePartAroundPivot(rightArm.canvas, rShoulder.x, rShoulder.y, kf.armRaise))
    : new PixelCanvas(w, h, 1);

  // Composite pose in back-to-front order
  composite(pose, rightLegAnim);
  composite(pose, rightArmAnim);
  composite(pose, upperBodyAnim);
  composite(pose, leftArmAnim);
  composite(pose, leftLegAnim);

  // 2) Translate the ENTIRE composed pose by bodyLift (whole-frame shift).
  //    This keeps all parts locked together — no drift.
  const lift = Math.round(kf.bodyLift);
  if (lift === 0) return pose;
  return translatePart(pose, 0, lift);
}

// ──────────────────────────────────────────────────────────────────────────────
// Ground-lock: anchor the character so grounded frames stay at groundY,
// and airborne frames are allowed to lift off.
// For jump animation we only ground-lock non-airborne frames.
// ──────────────────────────────────────────────────────────────────────────────

function groundLock(frame, groundY, isAirborne) {
  if (isAirborne) return frame; // let airborne frames float naturally

  // Find the lowest opaque row
  let lowestY = -1;
  for (let y = frame.height - 1; y >= 0; y--) {
    for (let x = 0; x < frame.width; x++) {
      if (frame.getPixel(x, y).a > 0) { lowestY = y; break; }
    }
    if (lowestY >= 0) break;
  }
  if (lowestY < 0) return frame;

  const drift = lowestY - groundY;
  if (Math.abs(drift) < 1) return frame;

  const shifted = new PixelCanvas(frame.width, frame.height, 1);
  for (let y = 0; y < frame.height; y++) {
    const srcY = y + drift;
    if (srcY < 0 || srcY >= frame.height) continue;
    for (let x = 0; x < frame.width; x++) {
      const p = frame.getPixel(x, srcY);
      if (p.a > 0) shifted.setPixel(x, y, p.r, p.g, p.b, p.a);
    }
  }
  return shifted;
}

// ──────────────────────────────────────────────────────────────────────────────
// Debug: export color-coded body part visualization
// ──────────────────────────────────────────────────────────────────────────────

function exportDebug(parts, joints, w, h, outputPath) {
  const debugColors = {
    [BODY_PARTS.HEAD]:      { r: 255, g: 100, b: 100 },
    [BODY_PARTS.TORSO]:     { r: 100, g: 255, b: 100 },
    [BODY_PARTS.LEFT_ARM]:  { r: 100, g: 100, b: 255 },
    [BODY_PARTS.RIGHT_ARM]: { r: 255, g: 255, b: 100 },
    [BODY_PARTS.LEFT_LEG]:  { r: 255, g: 100, b: 255 },
    [BODY_PARTS.RIGHT_LEG]: { r: 100, g: 255, b: 255 },
  };

  const debug = new PixelCanvas(w, h, SCALE);
  for (const [partName, part] of Object.entries(parts)) {
    const color = debugColors[partName];
    if (!color) continue;
    for (const p of part.pixels) {
      debug.setPixel(p.x, p.y, color.r, color.g, color.b, 255);
    }
  }

  for (const [name, j] of Object.entries(joints)) {
    if (j) debug.setPixel(j.x, j.y, 255, 255, 255, 255);
  }

  fs.writeFileSync(outputPath, debug.toBuffer());
  console.log(`  Debug body parts → ${outputPath}`);
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

  // Step 1: K-means color clustering
  console.log('Step 1: Color clustering...');
  const { labels, centroids, pixels } = kMeansClustering(base, 8, 30);
  console.log(`  Found ${centroids.length} color clusters, ${pixels.length} opaque pixels`);

  // Step 2: Connected components
  console.log('Step 2: Connected component analysis...');
  const { components, ccGrid, grid } = connectedComponents(base, labels, pixels);
  console.log(`  Found ${components.length} connected regions`);

  // Body bounding box
  let minX = base.width, maxX = 0, minY = base.height, maxY = 0;
  for (const p of pixels) {
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
  }

  // Step 3: Classify body parts
  console.log('Step 3: Classifying body parts...');
  const classification = classifyBodyParts(components, centroids, { minX, maxX, minY, maxY });

  // Step 4: Build part masks
  console.log('Step 4: Building body part masks...');
  const parts = buildPartMasks(base, components, classification);
  for (const [name, part] of Object.entries(parts)) {
    if (part.pixels.length > 0) {
      console.log(`  ${name}: ${part.pixels.length}px, bbox (${part.minX},${part.minY})-(${part.maxX},${part.maxY})`);
    }
  }

  // Step 5: Detect joints
  console.log('Step 5: Detecting joint pivots...');
  const joints = detectJoints(parts);
  for (const [name, j] of Object.entries(joints)) {
    if (j) console.log(`  ${name}: (${j.x}, ${j.y})`);
  }

  // Debug export
  if (DEBUG) {
    const debugPath = path.join(OUTPUT_DIR, path.basename(inputPath, '.png') + '_debug_parts_jump.png');
    exportDebug(parts, joints, base.width, base.height, debugPath);
  }

  // Step 6: Generate jump cycle frames
  //   We use an EXPANDED canvas so the character has headroom to jump
  //   without clipping.  Extra padding = jumpHeight above + crouchDip below.
  const bodyH = maxY - minY + 1;
  const jumpHeight = Math.round(bodyH * 0.35 * POWER);
  const padTop    = jumpHeight + 6;  // headroom for the arc peak
  const padBottom = Math.round(Math.max(3, bodyH * 0.10 * POWER)) + 4; // room for deep crouch dip
  const expandedH = base.height + padTop + padBottom;
  const expandedW = base.width;

  console.log(`Step 6: Generating ${FRAMES}-frame jump cycle (power=${POWER})...`);
  console.log(`  Canvas expanded: ${base.width}×${base.height} → ${expandedW}×${expandedH} (+${padTop}top +${padBottom}bot)`);

  // Re-build parts, joints on the expanded canvas (shift everything down by padTop)
  const expandedBase = new PixelCanvas(expandedW, expandedH, 1);
  for (let y = 0; y < base.height; y++)
    for (let x = 0; x < base.width; x++) {
      const px = base.getPixel(x, y);
      if (px.a > 0) expandedBase.setPixel(x, y + padTop, px.r, px.g, px.b, px.a);
    }

  // Shift part canvases + pixel lists
  const shiftedParts = {};
  for (const [name, part] of Object.entries(parts)) {
    const sc = new PixelCanvas(expandedW, expandedH, 1);
    const px = [];
    for (const p of part.pixels) {
      const c = part.canvas.getPixel(p.x, p.y);
      if (c.a > 0) {
        sc.setPixel(p.x, p.y + padTop, c.r, c.g, c.b, c.a);
        px.push({ x: p.x, y: p.y + padTop });
      }
    }
    shiftedParts[name] = {
      canvas: sc, pixels: px,
      minX: part.minX, maxX: part.maxX,
      minY: part.minY + padTop, maxY: part.maxY + padTop,
      centroidX: part.centroidX, centroidY: part.centroidY + padTop,
    };
  }

  // Shift joints
  const shiftedJoints = {};
  for (const [name, j] of Object.entries(joints)) {
    if (j) shiftedJoints[name] = { x: j.x, y: j.y + padTop };
  }

  const expandedGroundY = maxY + padTop;

  const frames = [];
  for (let i = 0; i < FRAMES; i++) {
    const t = i / FRAMES;
    let frame = buildFrame(expandedBase, shiftedParts, shiftedJoints, t, POWER, bodyH);

    // Ground-lock grounded frames; let airborne frames float.
    const isAirborne = (t >= 0.3 && t < 0.72);
    frame = groundLock(frame, expandedGroundY, isAirborne);
    frames.push(frame);
  }

  // Upscale
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
  const baseName = path.basename(inputPath, '.png') + '_jump';
  const clip = AnimationSystem.createClip('jump', {
    frames: frames.map((_, i) => i),
    fps: 10,
  });

  const { canvas: sheet, metadata } = SpriteSheetGenerator.pack(scaled, {
    prefix: 'jump',
    imageName: `${baseName}.png`,
    animations: [clip],
    columns: scaled.length,  // single horizontal row
  });

  // Export
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const pngOut  = path.join(OUTPUT_DIR, `${baseName}.png`);
  const jsonOut = path.join(OUTPUT_DIR, `${baseName}.json`);
  fs.writeFileSync(pngOut, sheet.toBuffer());
  fs.writeFileSync(jsonOut, JSON.stringify(metadata, null, 2));

  // Individual frames
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

  // Aseprite export
  if (ASEPRITE) {
    const AsepriteExporter = require('./src/export/AsepriteExporter');
    const aseOut = path.join(OUTPUT_DIR, `${baseName}.aseprite`);
    AsepriteExporter.export(scaled, aseOut, { fps: 10 });
    console.log(`Aseprite     → ${aseOut}`);
  }

  console.log(`Frames: ${FRAMES}  |  Sheet: ${metadata.meta.size.w}×${metadata.meta.size.h}px  |  Scale: ${SCALE}x`);
})();
