/**
 * generate_walk_v3.js  —  Color-segmented skeletal walk animation
 *
 * APPROACH:
 *   1. Color clustering → identify body-part pixel groups
 *   2. Connected component labeling → discrete regions
 *   3. Anatomical classification → head / torso / left-arm / right-arm / left-leg / right-leg / feet
 *   4. Joint pivot detection → shoulder, hip, knee pivots
 *   5. Rotation-based animation → rotate limbs around joint pivots per walk-cycle phase
 *
 * Usage:
 *   node generate_walk_v3.js <input.png> [options]
 *
 * Options:
 *   --frames   Number of frames (default: 8)
 *   --scale    Output upscale   (default: 6)
 *   --stride   Walk intensity 0-1 (default: 0.7)
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
const STRIDE     = parseFloat(args.stride || '0.85');
const OUTPUT_DIR = args.output || 'output';
const DEBUG      = !!args.debug;

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
  // Collect all opaque pixels with positions
  const pixels = [];
  for (let y = 0; y < canvas.height; y++)
    for (let x = 0; x < canvas.width; x++) {
      const p = canvas.getPixel(x, y);
      if (p.a > 20) pixels.push({ x, y, r: p.r, g: p.g, b: p.b, a: p.a });
    }

  if (pixels.length === 0) return { labels: [], centroids: [], pixels };

  // Initialize centroids using k-means++ seeding
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

  // Iterate
  const labels = new Array(pixels.length).fill(0);
  for (let iter = 0; iter < iterations; iter++) {
    // Assign each pixel to nearest centroid
    for (let i = 0; i < pixels.length; i++) {
      let bestC = 0, bestD = Infinity;
      for (let c = 0; c < k; c++) {
        const d = colorDist(pixels[i], centroids[c]);
        if (d < bestD) { bestD = d; bestC = c; }
      }
      labels[i] = bestC;
    }
    // Recompute centroids
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
  // Build cluster grid
  const grid = Array.from({ length: h }, () => new Int16Array(w).fill(-1));
  for (let i = 0; i < pixels.length; i++) {
    grid[pixels[i].y][pixels[i].x] = clusterLabels[i];
  }

  // Flood-fill based CC labeling
  const ccGrid = Array.from({ length: h }, () => new Int16Array(w).fill(-1));
  const components = []; // { id, cluster, pixels: [{x,y}], minX, maxX, minY, maxY, centroidX, centroidY }
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

      // Compute region stats
      let minX = w, maxX = 0, minY = h, maxY = 0, sumX = 0, sumY = 0;
      for (const p of ccPixels) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
        sumX += p.x; sumY += p.y;
      }

      components.push({
        id: ccId,
        cluster,
        pixels: ccPixels,
        area: ccPixels.length,
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
  FEET: 'feet',
  OUTLINE: 'outline',
  OTHER: 'other',
};

function classifyBodyParts(components, centroids, bodyBBox) {
  const { minY, maxY, minX, maxX } = bodyBBox;
  const bodyH = maxY - minY + 1;
  const bodyCenterX = (minX + maxX) / 2;

  // Classify centroids first by color properties
  const centroidTypes = centroids.map(c => {
    const brightness = (c.r + c.g + c.b) / 3;
    const isBlack = brightness < 25;
    const isSkinTone = c.r > 150 && c.g > 100 && c.b > 60 && c.r > c.g && c.g > c.b;
    const isDark = brightness < 60;
    return { isBlack, isSkinTone, isDark, brightness };
  });

  // Merge small components into nearest large one
  // Sort by area descending
  const sorted = [...components].sort((a, b) => b.area - a.area);

  // Assign body parts based on position + color analysis
  const bodyParts = new Map(); // partName → [component ids]
  for (const name of Object.values(BODY_PARTS)) bodyParts.set(name, []);

  // Find the vertical splits
  const headEndY = minY + Math.round(bodyH * 0.2);   // top 20% = head
  const torsoEndY = minY + Math.round(bodyH * 0.55);  // 20-55% = torso
  const legSplitY = minY + Math.round(bodyH * 0.6);   // where legs clearly separate

  // Determine left/right leg boundary: find X where gap appears in lower body
  let legCenterX = bodyCenterX;

  // Look for the gap column in the leg region
  const gapSearchStartY = Math.round(minY + bodyH * 0.65);
  const gapSearchEndY = Math.round(minY + bodyH * 0.9);
  const colCounts = {};
  for (const comp of components) {
    for (const p of comp.pixels) {
      if (p.y >= gapSearchStartY && p.y <= gapSearchEndY) {
        colCounts[p.x] = (colCounts[p.x] || 0) + 1;
      }
    }
  }
  // Find column with minimum pixel count in the legs region
  let gapCol = Math.round(bodyCenterX), minCount = Infinity;
  for (let x = Math.round(bodyCenterX - 3); x <= Math.round(bodyCenterX + 3); x++) {
    const cnt = colCounts[x] || 0;
    if (cnt < minCount) { minCount = cnt; gapCol = x; }
  }
  legCenterX = gapCol;

  // Classify each component
  for (const comp of components) {
    const ct = centroidTypes[comp.cluster];
    const relY = (comp.centroidY - minY) / bodyH; // 0=top, 1=bottom
    const relX = comp.centroidX - bodyCenterX;     // negative=left, positive=right

    // Black outline pixels → outline
    if (ct.isBlack && comp.area > 10) {
      bodyParts.get(BODY_PARTS.OUTLINE).push(comp.id);
      comp.part = BODY_PARTS.OUTLINE;
      continue;
    }

    // Tiny components (1-2 pixels) → classify by position
    // Head region (top 20%)
    if (relY < 0.2) {
      bodyParts.get(BODY_PARTS.HEAD).push(comp.id);
      comp.part = BODY_PARTS.HEAD;
    }
    // Torso region (20-55%)
    else if (relY < 0.55) {
      // Check if it's on the far left/right (arm)
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
    }
    // Leg region (55-90%)
    else if (relY < 0.92) {
      if (comp.centroidX < legCenterX) {
        bodyParts.get(BODY_PARTS.LEFT_LEG).push(comp.id);
        comp.part = BODY_PARTS.LEFT_LEG;
      } else {
        bodyParts.get(BODY_PARTS.RIGHT_LEG).push(comp.id);
        comp.part = BODY_PARTS.RIGHT_LEG;
      }
    }
    // Feet (bottom 10%): merge into the nearest leg based on X — shoes must
    // rotate rigidly with their leg segment rather than being moved separately.
    else {
      if (comp.centroidX < legCenterX) {
        bodyParts.get(BODY_PARTS.LEFT_LEG).push(comp.id);
        comp.part = BODY_PARTS.LEFT_LEG;
      } else {
        bodyParts.get(BODY_PARTS.RIGHT_LEG).push(comp.id);
        comp.part = BODY_PARTS.RIGHT_LEG;
      }
    }
  }

  return {
    bodyParts,
    headEndY,
    torsoEndY,
    legSplitY,
    legCenterX,
    bodyCenterX,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Build body part pixel masks
// Now we combine component analysis + position-based fallback for outlines
// ──────────────────────────────────────────────────────────────────────────────

function buildPartMasks(canvas, components, classification) {
  const w = canvas.width, h = canvas.height;
  const { headEndY, torsoEndY, legCenterX, bodyCenterX } = classification;

  // Get body bounding box
  let minY = h, maxY = 0;
  for (const comp of components) {
    if (comp.minY < minY) minY = comp.minY;
    if (comp.maxY > maxY) maxY = comp.maxY;
  }
  const bodyH = maxY - minY + 1;
  const feetStartY = minY + Math.round(bodyH * 0.92);

  // ── SMALL COMPONENT FILTER ──────────────────────────────────────────────────
  // Components with very few pixels are noise/dithering artifacts.
  // Re-assign them purely by position rather than by their cluster classification.
  // This prevents tiny isolated islands from scattering when their part is rotated.
  const MIN_COMPONENT_AREA = Math.max(4, Math.round(canvas.width * canvas.height * 0.0008));
  for (const comp of components) {
    if (comp.area < MIN_COMPONENT_AREA && comp.part !== BODY_PARTS.OUTLINE) {
      // Override with position-based assignment
      const relY = (comp.centroidY - minY) / bodyH;
      if (relY < 0.2) comp.part = BODY_PARTS.HEAD;
      else if (relY < 0.55) comp.part = BODY_PARTS.TORSO;
      else if (relY < 0.92) comp.part = comp.centroidX < legCenterX ? BODY_PARTS.LEFT_LEG : BODY_PARTS.RIGHT_LEG;
      else comp.part = comp.centroidX < legCenterX ? BODY_PARTS.LEFT_LEG : BODY_PARTS.RIGHT_LEG;
    }
  }

  // Create a part-assignment grid based on components
  const partGrid = Array.from({ length: h }, () => new Array(w).fill(null));
  for (const comp of components) {
    for (const p of comp.pixels) {
      if (comp.part && comp.part !== BODY_PARTS.OUTLINE) {
        partGrid[p.y][p.x] = comp.part;
      }
    }
  }

  // For outline pixels, assign to nearest non-outline body part by proximity
  const outlinePixels = [];
  for (const comp of components) {
    if (comp.part === BODY_PARTS.OUTLINE) {
      for (const p of comp.pixels) {
        outlinePixels.push(p);
      }
    }
  }

  // Assign outline pixels by position
  for (const p of outlinePixels) {
    const relY = (p.y - minY) / bodyH;
    if (relY < 0.2) {
      partGrid[p.y][p.x] = BODY_PARTS.HEAD;
    } else if (relY < 0.55) {
      partGrid[p.y][p.x] = BODY_PARTS.TORSO;
    } else if (relY < 0.92) {
      if (p.x < legCenterX) {
        partGrid[p.y][p.x] = BODY_PARTS.LEFT_LEG;
      } else {
        partGrid[p.y][p.x] = BODY_PARTS.RIGHT_LEG;
      }
    } else {
      if (p.x < legCenterX) {
        partGrid[p.y][p.x] = BODY_PARTS.LEFT_LEG; // feet outlines go with legs
      } else {
        partGrid[p.y][p.x] = BODY_PARTS.RIGHT_LEG;
      }
    }
  }

  // Extract each part as a PixelCanvas with pixels at original positions
  const parts = {};
  for (const partName of Object.values(BODY_PARTS)) {
    if (partName === BODY_PARTS.OUTLINE || partName === BODY_PARTS.OTHER) continue;
    parts[partName] = {
      canvas: new PixelCanvas(w, h, 1),
      pixels: [],
      minX: w, maxX: 0, minY: h, maxY: 0,
      sumX: 0, sumY: 0,
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

  // Compute centroids
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

  // Neck joint: bottom-center of head
  const head = parts[BODY_PARTS.HEAD];
  if (head && head.pixels.length > 0) {
    joints.neck = {
      x: Math.round(head.centroidX),
      y: head.maxY,
    };
  }

  // Left hip: top-center of left leg
  const ll = parts[BODY_PARTS.LEFT_LEG];
  if (ll && ll.pixels.length > 0) {
    joints.leftHip = {
      x: Math.round(ll.centroidX),
      y: ll.minY,
    };
    // Left knee: midpoint of left leg
    joints.leftKnee = {
      x: Math.round(ll.centroidX),
      y: Math.round((ll.minY + ll.maxY) / 2),
    };
    joints.leftAnkle = {
      x: Math.round(ll.centroidX),
      y: ll.maxY,
    };
  }

  // Right hip: top-center of right leg
  const rl = parts[BODY_PARTS.RIGHT_LEG];
  if (rl && rl.pixels.length > 0) {
    joints.rightHip = {
      x: Math.round(rl.centroidX),
      y: rl.minY,
    };
    joints.rightKnee = {
      x: Math.round(rl.centroidX),
      y: Math.round((rl.minY + rl.maxY) / 2),
    };
    joints.rightAnkle = {
      x: Math.round(rl.centroidX),
      y: rl.maxY,
    };
  }

  // Torso center (for sway)
  const torso = parts[BODY_PARTS.TORSO];
  if (torso && torso.pixels.length > 0) {
    joints.torsoCenter = {
      x: Math.round(torso.centroidX),
      y: Math.round(torso.centroidY),
    };
    joints.hipCenter = {
      x: Math.round(torso.centroidX),
      y: torso.maxY,
    };
    joints.shoulderCenter = {
      x: Math.round(torso.centroidX),
      y: torso.minY,
    };
  }

  // Shoulder pivots: top of each arm region (or fallback to torso top)
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
// Rotation of pixel region around a pivot point
// Uses inverse-mapping (sample source for each output pixel) to avoid gaps
// ──────────────────────────────────────────────────────────────────────────────

function rotatePartAroundPivot(partCanvas, pivotX, pivotY, angleDeg, translateDX = 0, translateDY = 0) {
  const out = new PixelCanvas(partCanvas.width, partCanvas.height, 1);
  const rad = -angleDeg * Math.PI / 180; // negative for inverse mapping
  const cosA = Math.cos(rad), sinA = Math.sin(rad);

  for (let y = 0; y < partCanvas.height; y++) {
    for (let x = 0; x < partCanvas.width; x++) {
      // Inverse transform: where in source does this output pixel come from?
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
// deSpeckle: remove isolated pixels (no opaque 4-connected neighbor).
// These are inverse-mapping artifacts — single pixels with no adjacent fill.
// ──────────────────────────────────────────────────────────────────────────────

function deSpeckle(canvas) {
  const out = new PixelCanvas(canvas.width, canvas.height, 1);
  const w = canvas.width, h = canvas.height;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = canvas.getPixel(x, y);
      if (p.a === 0) continue;
      // Check 4-connected neighbors
      const hasNeighbor =
        (x > 0     && canvas.getPixel(x-1, y).a > 0) ||
        (x < w-1   && canvas.getPixel(x+1, y).a > 0) ||
        (y > 0     && canvas.getPixel(x, y-1).a > 0) ||
        (y < h-1   && canvas.getPixel(x, y+1).a > 0);
      if (hasNeighbor) out.setPixel(x, y, p.r, p.g, p.b, p.a);
    }
  }
  return out;
}

// ──────────────────────────────────────────────────────────────────────────────
// Walk cycle keyframe angles (biomechanically-inspired)
//   t ∈ [0, 1) → one full walk cycle
//   Returns rotation angles (degrees) + translation for each body part
// ──────────────────────────────────────────────────────────────────────────────

function walkCycleKeyframes(t, stride) {
  const tau = Math.PI * 2;
  const s = stride;

  // Reference pixel-art walk cycle:
  //   - Very wide hip swing (~38°) for dramatically separated legs like references
  //   - Deep knee bend (~32°) only during the FORWARD swing (swing leg bends, stance leg straight)
  //   - POSITIVE knee angle: calf swings back toward vertical = natural human bend
  //   - High foot lift (5×s) so foot clearly clears the ground
  //   - Noticeable body bob (rises at mid-stride when stance leg is fully extended)
  //   - Slight constant forward lean (character leans into the walk, pixel-art style)
  //   - Dynamic torso rock adds life to the upper body
  const hipAngle  = 38 * s;   // wide stride like pixel art references
  const kneeAngle = 32 * s;   // deep, visible knee bend on swing leg

  const sinT = Math.sin(t * tau);

  // legA = left leg.  Swings FORWARD when sinT < 0.
  const legA_hip   =  sinT * hipAngle;
  const legA_knee  = +Math.max(0, -sinT) * kneeAngle; // bends only during forward swing
  const legA_lift  =  Math.max(0, -sinT) * 5 * s;     // high foot clearance

  // legB = right leg. Swings FORWARD when sinT > 0.
  const legB_hip   = -sinT * hipAngle;
  const legB_knee  = +Math.max(0,  sinT) * kneeAngle;
  const legB_lift  =  Math.max(0,  sinT) * 5 * s;

  // Body rises UP at mid-stride, dips slightly at heel-strike.
  // Coefficient 2.0 keeps bounce visible but not so large it breaks the upper body.
  const bodyBounce = -(Math.abs(sinT) - 0.3) * 2.0 * s;

  // No lateral sway.
  const hipSway = 0;

  // Torso: NO static rotation lean (avoids pixel gaps on small sprites from inverse-mapping).
  // Only a very tiny dynamic rock is applied — upper body moves as ONE translated unit.
  const torsoLean = sinT * 1.0 * s;

  // Head matches torso exactly (both move as one unit in buildFrame — headTilt unused there).
  const headTilt = 0;

  // Arm swing as rotation angle around shoulder pivot (degrees).
  // Right arm swings forward when left leg is forward (sinT < 0), and vice-versa.
  // rightArm forward = negative rotation (counterclockwise for left-facing character = forward).
  const armSwingAngle = sinT * 18 * s;  // reduced from 28 to avoid stray pixel scatter
  // Also keep vertical translation component for any residual arm pixels.
  const armSwing = sinT * 5 * s;

  return {
    leftLeg: { hipAngle: legA_hip, kneeAngle: legA_knee, lift: legA_lift },
    rightLeg: { hipAngle: legB_hip, kneeAngle: legB_knee, lift: legB_lift },
    bodyBounce,
    torsoLean,
    headTilt,
    armSwing,
    armSwingAngle,
    hipSway,
  };
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
// Rotate leg segments: upper leg around hip, lower leg around knee
// For pixel art, we split the leg into upper/lower at the knee joint
// ──────────────────────────────────────────────────────────────────────────────

function animateLeg(legPart, hipJoint, kneeJoint, hipAngle, kneeAngle, liftDY, bodyDY) {
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

  // Rotate upper leg around hip, then clean stray pixels
  const upperRotated = deSpeckle(rotatePartAroundPivot(upperLeg, hipJoint.x, hipJoint.y, hipAngle, 0, bodyDY));

  // For the lower leg, first rotate with hip (it moves with upper leg),
  // then apply knee bend.
  // Compute where the knee ends up after hip rotation
  const hipRad = hipAngle * Math.PI / 180;
  const kneeNewX = hipJoint.x + Math.cos(hipRad) * (kneeJoint.x - hipJoint.x) - Math.sin(hipRad) * (kneeJoint.y - hipJoint.y);
  const kneeNewY = hipJoint.y + Math.sin(hipRad) * (kneeJoint.x - hipJoint.x) + Math.cos(hipRad) * (kneeJoint.y - hipJoint.y) + bodyDY;

  // Rotate lower leg around original knee first (with hip)
  const lowerWithHip = rotatePartAroundPivot(lowerLeg, hipJoint.x, hipJoint.y, hipAngle, 0, bodyDY);
  // Then apply knee bend around the new knee position, clean stray pixels
  const lowerFinal = deSpeckle(rotatePartAroundPivot(lowerWithHip, Math.round(kneeNewX), Math.round(kneeNewY), kneeAngle));

  // Apply lift (foot clearance during swing phase)
  const liftedLower = translatePart(lowerFinal, 0, -liftDY);

  // Composite upper + lower
  const result = new PixelCanvas(w, h, 1);
  composite(result, upperRotated);
  composite(result, liftedLower);

  return result;
}

// ──────────────────────────────────────────────────────────────────────────────
// Build one complete animation frame
// ──────────────────────────────────────────────────────────────────────────────

function buildFrame(base, parts, joints, t, stride) {
  const kf = walkCycleKeyframes(t, stride);
  const w = base.width, h = base.height;
  const frame = new PixelCanvas(w, h, 1);

  // The leg SWINGING FORWARD (negative hip angle = toward viewer) draws on top.
  // legA (left leg) swings forward when hipAngle < 0 → leftInFront = true.
  const leftInFront = kf.leftLeg.hipAngle < 0;

  // Animate legs
  const leftLegAnim = animateLeg(
    parts[BODY_PARTS.LEFT_LEG],
    joints.leftHip || joints.hipCenter || { x: 22, y: 27 },
    joints.leftKnee || { x: 22, y: 35 },
    kf.leftLeg.hipAngle,
    kf.leftLeg.kneeAngle,
    kf.leftLeg.lift,
    kf.bodyBounce
  );

  const rightLegAnim = animateLeg(
    parts[BODY_PARTS.RIGHT_LEG],
    joints.rightHip || joints.hipCenter || { x: 26, y: 27 },
    joints.rightKnee || { x: 26, y: 35 },
    kf.rightLeg.hipAngle,
    kf.rightLeg.kneeAngle,
    kf.rightLeg.lift,
    kf.bodyBounce
  );

  // Upper body (head + torso) composited as ONE unit before animation.
  // This prevents head/torso from drifting apart when different translations are applied.
  // We apply only a vertical translate (bodyBounce) + very slight lean tilt to the combined canvas.
  const upperBodyCanvas = new PixelCanvas(w, h, 1);
  composite(upperBodyCanvas, parts[BODY_PARTS.TORSO].canvas);
  composite(upperBodyCanvas, parts[BODY_PARTS.HEAD].canvas);

  // Pivot at hipCenter (bottom of torso) for any lean rotation.
  // torsoLean is very small (≤1°×s) so pixel gaps are negligible.
  const upperBodyAnim = deSpeckle(rotatePartAroundPivot(
    upperBodyCanvas,
    joints.hipCenter ? joints.hipCenter.x : 24,
    joints.hipCenter ? joints.hipCenter.y : 27,
    kf.torsoLean,
    0,
    kf.bodyBounce
  ));

  // Arms: rotate around shoulder pivots (forward/back counter-swing).
  // For a side-facing character, arm rotation = forward or backward lean around shoulder.
  // rightArm is opposite to rightLeg: forward when hipAngle < 0 (left leg forward).
  const leftArm  = parts[BODY_PARTS.LEFT_ARM];
  const rightArm = parts[BODY_PARTS.RIGHT_ARM];
  const lShoulder = joints.leftShoulder  || joints.shoulderCenter || { x: 22, y: 12 };
  const rShoulder = joints.rightShoulder || joints.shoulderCenter || { x: 26, y: 12 };

  // Left arm swings opposite to left leg (forward when right leg is forward, sinT>0).
  const leftArmAnim = leftArm && leftArm.pixels.length > 0
    ? deSpeckle(rotatePartAroundPivot(leftArm.canvas, lShoulder.x, lShoulder.y,
        -kf.armSwingAngle, 0, kf.bodyBounce))
    : new PixelCanvas(w, h, 1);
  // Right arm swings opposite to right leg (forward when left leg is forward, sinT<0).
  const rightArmAnim = rightArm && rightArm.pixels.length > 0
    ? deSpeckle(rotatePartAroundPivot(rightArm.canvas, rShoulder.x, rShoulder.y,
        kf.armSwingAngle, 0, kf.bodyBounce))
    : new PixelCanvas(w, h, 1);

  // Composite in painter's order (back to front)
  // Feet are now baked into their leg segments — no separate feet layer.
  // Back leg → back arm → upper body (torso+head as one unit) → front arm → front leg
  if (leftInFront) {
    composite(frame, rightLegAnim);   // back leg (includes back shoe)
    composite(frame, rightArmAnim);   // back arm
    composite(frame, upperBodyAnim);  // torso + head (single unit, no drift)
    composite(frame, leftArmAnim);    // front arm
    composite(frame, leftLegAnim);    // front leg (includes front shoe)
  } else {
    composite(frame, leftLegAnim);    // back leg (includes back shoe)
    composite(frame, leftArmAnim);    // back arm
    composite(frame, upperBodyAnim);  // torso + head (single unit, no drift)
    composite(frame, rightArmAnim);   // front arm
    composite(frame, rightLegAnim);   // front leg (includes front shoe)
  }

  return frame;
}

// ──────────────────────────────────────────────────────────────────────────────
// Ground-lock: shift entire frame so the lowest opaque pixel stays at groundY.
// Prevents the character from floating up or sinking into the floor.
// ──────────────────────────────────────────────────────────────────────────────

function groundLock(frame, groundY) {
  // Find the lowest row containing any opaque pixel
  let lowestY = -1;
  outer: for (let y = frame.height - 1; y >= 0; y--) {
    for (let x = 0; x < frame.width; x++) {
      if (frame.getPixel(x, y).a > 0) { lowestY = y; break outer; }
    }
  }
  if (lowestY < 0) return frame;

  const drift = lowestY - groundY;
  if (Math.abs(drift) < 1) return frame; // within one pixel — acceptable

  // Shift every row up or down to compensate
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
    [BODY_PARTS.HEAD]: { r: 255, g: 100, b: 100 },
    [BODY_PARTS.TORSO]: { r: 100, g: 255, b: 100 },
    [BODY_PARTS.LEFT_ARM]: { r: 100, g: 100, b: 255 },
    [BODY_PARTS.RIGHT_ARM]: { r: 255, g: 255, b: 100 },
    [BODY_PARTS.LEFT_LEG]: { r: 255, g: 100, b: 255 },
    [BODY_PARTS.RIGHT_LEG]: { r: 100, g: 255, b: 255 },
    [BODY_PARTS.FEET]: { r: 255, g: 200, b: 100 },
  };

  const debug = new PixelCanvas(w, h, SCALE);
  for (const [partName, part] of Object.entries(parts)) {
    const color = debugColors[partName];
    if (!color) continue;
    for (const p of part.pixels) {
      debug.setPixel(p.x, p.y, color.r, color.g, color.b, 255);
    }
  }

  // Mark joints
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
    const debugPath = path.join(OUTPUT_DIR, path.basename(inputPath, '.png') + '_debug_parts.png');
    exportDebug(parts, joints, base.width, base.height, debugPath);
  }

  // Step 6: Generate walk cycle frames
  console.log(`Step 6: Generating ${FRAMES}-frame walk cycle (stride=${STRIDE})...`);
  const frames = [];
  for (let i = 0; i < FRAMES; i++) {
    const t = i / FRAMES;
    let frame = buildFrame(base, parts, joints, t, STRIDE);
    // Ground-lock: keep the lowest foot pixel anchored to the original floor line
    frame = groundLock(frame, maxY);
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
  const baseName = path.basename(inputPath, '.png') + '_walk_v3';
  const clip = AnimationSystem.createClip('walk', {
    frames: frames.map((_, i) => i),
    fps: 8,
  });

  const { canvas: sheet, metadata } = SpriteSheetGenerator.pack(scaled, {
    prefix: 'walk',
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
  console.log(`Frames: ${FRAMES}  |  Sheet: ${metadata.meta.size.w}×${metadata.meta.size.h}px  |  Scale: ${SCALE}x`);
})();
