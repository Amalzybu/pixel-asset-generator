# 🏗️ Pixel Asset Generator — Technical Architecture

**A deep-dive into the design, algorithms, and implementation details.**

---

## 📑 Table of Contents

1. [System Architecture](#system-architecture)
2. [Core Modules](#core-modules)
3. [Data Flow](#data-flow)
4. [Algorithms](#algorithms)
5. [Design Patterns](#design-patterns)
6. [Performance Optimization](#performance-optimization)
7. [Extension Guide](#extension-guide)

---

## 🏛️ System Architecture

### High-Level Design

```
┌─────────────────────────────────────────────────────┐
│                     Client Layer                     │
│            (CLI / REST API / Browser)                │
└──────────────────────┬──────────────────────────────┘
                       │ HTTP / IPC
┌──────────────────────▼──────────────────────────────┐
│                  API Gateway                         │
│    /api/generate/sprite                             │
│    /api/generate/tileset                            │
│    /api/generate/effect                             │
│    /api/palettes                                    │
│    /api/animations                                  │
│    /api/export                                      │
└──────┬────────────┬────────────┬───────────────────┘
       │            │            │
┌──────▼──┐  ┌─────▼──┐  ┌─────▼──────┐
│Generation│  │Palette │  │ Export     │
│ Engine   │  │Manager │  │ Service    │
└──┬────┬──┘  └────────┘  └────────────┘
   │    │
   │    └──► Procedural Generator
   │        ├─ SeededNoise
   │        ├─ PixelCanvas
   │        ├─ AnimationSystem
   │        └─ SpriteSheetGenerator
   │
   └──► Asset Store (in-memory Map)
        └─ {id → {canvas, metadata, frames}}
```

### Request/Response Lifecycle

```
1. User Request (CLI --flag value / API JSON)
        ↓
2. Parameter Validation & Normalization
        ↓
3. AssetGenerator Routes to Appropriate Generator
        ↓
4. Procedural Generation (3–4ms)
   ├─ Noise generation
   ├─ Color mapping
   ├─ Shading & effects
   └─ Animation frame creation
        ↓
5. Sprite Sheet Packing
   ├─ Calculate grid layout
   ├─ Composite frames
   └─ Generate TexturePacker JSON
        ↓
6. Export Service Conversion
        ↓
7. Response (PNG + JSON / GIF / .tres / etc.)
        ↓
8. File Output / Base64 Response
```

---

## 🔧 Core Modules

### 1. PixelCanvas (src/canvas/PixelCanvas.js)

**Purpose:** Low-level pixel manipulation and image rendering.

**Key Concepts:**
- **RGBA Buffer**: `Uint8ClampedArray` stores 4 bytes per pixel (R, G, B, A)
- **Logical vs. Physical Pixels**: Logical size (16×16) upscaled by factor (4x) = physical size (64×64)
- **Coordinate System**: (0,0) at top-left, x right, y down

**Core Methods:**

```javascript
constructor(width, height, scale = 1)
  // width, height = logical dimensions
  // scale = upscale factor for output

_index(x, y) → number
  // Calculate buffer index for pixel (x, y)
  // Returns (y * width + x) * 4

setPixel(x, y, r, g, b, a = 255)
  // Set pixel color directly
  // Clamps to canvas bounds

getPixel(x, y) → {r, g, b, a}
  // Retrieve pixel color
  // Returns zero-alpha for out-of-bounds

drawSprite(sprite, offsetX, offsetY)
  // Composite another canvas onto this one
  // Only non-transparent pixels drawn
  // Used for animation frame composition

applyPalette(palette)
  // Quantize all colors to palette
  // Finds nearest color per pixel

addOutline(r, g, b, thickness = 1)
  // Trace non-transparent pixels
  // Draw border around filled regions

addShadow(direction, offset, r, g, b, alpha)
  // Drop shadow effect
  // Offset: distance from edge
  // alpha: shadow transparency

clone() → PixelCanvas
  // Deep copy of pixel data

toBuffer() → Buffer
  // Upscale and encode PNG
  // Returns Node.js Buffer (PNG binary)

toDataURL() → string
  // Base64 PNG for embedding
  // Format: "data:image/png;base64,..."
```

**Implementation Detail: PNG Encoding**

Uses `pngjs` library to encode upscaled pixels:

```javascript
toBuffer() {
  const outW = this.width * this.scale;    // 16 * 4 = 64
  const outH = this.height * this.scale;   // 16 * 4 = 64
  const png = new PNG({ width: outW, height: outH });

  // For each logical pixel, write scale×scale physical pixels
  for (let y = 0; y < this.height; y++) {
    for (let x = 0; x < this.width; x++) {
      const p = this.getPixel(x, y);
      for (let sy = 0; sy < this.scale; sy++) {
        for (let sx = 0; sx < this.scale; sx++) {
          const outX = x * this.scale + sx;
          const outY = y * this.scale + sy;
          const idx = (outY * outW + outX) * 4;
          png.data[idx] = p.r;
          png.data[idx + 1] = p.g;
          png.data[idx + 2] = p.b;
          png.data[idx + 3] = p.a;
        }
      }
    }
  }
  return PNG.sync.write(png);
}
```

---

### 2. PaletteManager (src/palette/PaletteManager.js)

**Purpose:** Manage color palettes and palette-aware operations.

**Architecture:**

```
PaletteManager
├─ palettes: Map<id, Palette>
└─ Built-in Palettes:
   ├─ PICO-8 (16 colors)
   ├─ NES (54 colors)
   ├─ Game Boy (4 colors)
   └─ ENDESGA-32 (32 colors)
```

**Palette Class:**

```javascript
class Palette {
  colors: Array<{r, g, b}>     // RGB color entries

  findNearest(r, g, b) → {r, g, b}
    // Euclidean distance in RGB space
    // distance = √((Δr)² + (Δg)² + (Δb)²)

  getColor(index) → {r, g, b}
    // Modulo access (index < count)

  lighten(color, amount = 40)
    // Add to each channel (clamped to 255)

  darken(color, amount = 40)
    // Subtract from each channel (clamped to 0)
}
```

**Key Algorithms:**

**Color Quantization (findNearest):**
```javascript
findNearest(r, g, b) {
  let best = this.colors[0];
  let bestDist = Infinity;

  for (const c of this.colors) {
    const dr = c.r - r;
    const dg = c.g - g;
    const db = c.b - b;
    const dist = dr * dr + dg * dg + db * db;  // Squared distance

    if (dist < bestDist) {
      bestDist = dist;
      best = c;
    }
  }
  return best;
}
```

**Harmonic Palette Generation:**

Uses HSL color space for harmony:

```javascript
generatePalette(seedHex, count = 8, harmony = 'analogous') {
  const base = hexToRgb(seedHex);
  const hsl = rgbToHsl(base.r, base.g, base.b);
  const colors = [];

  for (let i = 0; i < count; i++) {
    let h;
    switch (harmony) {
      case 'complementary':
        h = (hsl.h + (i * 180) / count) % 360;
        break;
      case 'triadic':
        h = (hsl.h + (i * 120) / Math.ceil(count / 3)) % 360;
        break;
      case 'analogous':  // Default: colors ±30° from seed
      default:
        h = (hsl.h - 30 + (i * 60) / (count - 1)) % 360;
        break;
    }
    // Vary saturation and lightness by index
    const s = Math.max(20, Math.min(100, hsl.s + (i % 2 === 0 ? -10 : 10)));
    const l = Math.max(15, Math.min(85, 20 + (i * 60) / (count - 1)));
    const rgb = hslToRgb(h, s, l);
    colors.push(rgb);
  }
  return new Palette(colors);
}
```

---

### 3. SeededNoise (src/generation/noise.js)

**Purpose:** Deterministic noise generation for procedural sprite creation.

**Implementation:** Simplified Perlin noise using permutation table.

```javascript
class SeededNoise {
  constructor(seed) {
    // Seeded RNG for reproducible randomness
    this.rng = mulberry32(seed);

    // Build permutation table
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;

    // Fisher-Yates shuffle
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [p[i], p[j]] = [p[j], p[i]];
    }

    // Duplicate table for seamless wrapping
    this.perm = new Uint8Array(512);
    for (let i = 0; i < 512; i++) {
      this.perm[i] = p[i & 255];
    }
  }

  noise2D(x, y) → [-1, 1]
    // Returns smooth noise value
    // Uses interpolation & gradient dot products
}
```

**Perlin Noise 2D Algorithm:**

1. Get integer coordinates: `{X, Y}`
2. Get fractional coordinates: `{x, y}`
3. Apply fade function (smoothstep): `u = fade(x)`, `v = fade(y)`
4. Calculate gradient vectors at 4 corners
5. Interpolate between corners using fade values
6. Return value in range [-1, 1]

---

### 4. ProceduralGenerator (src/generation/ProceduralGenerator.js)

**Purpose:** High-level asset generation with noise and transformations.

**Key Generators:**

#### generateCharacter()

**Algorithm: Symmetric Noise Silhouette**

```
Step 1: Generate Body Mask
├─ Sample 2D Perlin noise at grid positions
├─ Apply vertical gradient mask for humanoid proportions
│  ├─ Head (top 25%): narrow → wider threshold
│  ├─ Torso (25–55%): widest area
│  └─ Legs (55–100%): narrow again
├─ Mirror left half to right for symmetry
└─ Result: boolean grid (filled/empty)

Step 2: Color Regions
├─ Sample colors from palette (random or ordered)
├─ Assign to regions:
│  ├─ Head: skin tone
│  ├─ Torso: shirt/armor
│  ├─ Legs: pants/boots
│  └─ Eyes: accent color
└─ Draw filled regions on canvas

Step 3: Directional Shading
├─ Count filled neighbors above each pixel
├─ Apply brightness based on position:
│  ├─ No neighbors above → highlight (+40)
│  ├─ Top third → mid-light (+20)
│  ├─ Middle third → base color (0)
│  └─ Bottom third → shadow (-30)
└─ Result: 3D depth perception

Step 4: Dithering (optional)
├─ Apply Bayer 4×4 threshold matrix
├─ Enhance contrast & reduce banding
└─ Authentic retro aesthetic

Step 5: Outline (optional)
├─ Trace non-transparent pixels
├─ Draw border around edges
└─ Enhances pixel clarity
```

**Code Structure:**

```javascript
generateCharacter(width, height, options) {
  // 1. Generate symmetric mask
  const mask = this._generateSymmetricMask(width, height, options.symmetry);

  // 2. Create canvas and color regions
  const canvas = new PixelCanvas(width, height, options.scale);
  this._colorRegions(canvas, mask, width, height, palette);

  // 3. Apply shading
  if (options.shading === 'directional') {
    this._applyDirectionalShading(canvas, mask, width, height, palette);
  }

  // 4. Optional effects
  if (options.dithering === 'bayer') {
    this._applyBayerDithering(canvas, width, height);
  }
  if (options.outline) {
    canvas.addOutline(outlineColor.r, outlineColor.g, outlineColor.b);
  }

  return canvas;
}
```

#### generateTileset()

**Algorithm: Biome-Specific Tile Generation**

```
Step 1: Get Biome Color Set
├─ Base colors (primary tile color)
├─ Accent colors (edge & transition colors)
└─ Detail colors (flora & minor features)

Step 2: Generate Base Tile
├─ Use 2D noise for base texture pattern
├─ Apply biome colors based on noise level
├─ Add random detail specks
└─ Result: Natural, varied base tile

Step 3: Generate Variants
├─ Edge tiles: draw colored border
├─ Corner tiles: fill corner regions
├─ Inner corners: arc pattern for smooth transitions
├─ Decoration: scatter detail sprites
└─ All based on biome colors

Step 4: Pack into Sheet
└─ Grid layout: columns × rows
```

#### generateEffect()

**Algorithm: Procedural Particle Animation**

```
Effect Types:

FIRE:
  ├─ For each frame (0 to N):
  │  ├─ Calculate frame progress (0–1)
  │  ├─ For each pixel:
  │  │  ├─ Distance from center column
  │  │  ├─ Vertical position (y / height)
  │  │  ├─ Intensity = (1 - yNorm) * (1 - xDist) * noise
  │  │  └─ Color based on intensity
  │  └─ Blend colors for flame gradient
  └─ Result: upward-flowing flame effect

WATER:
  ├─ Horizontal wave pattern
  ├─ Noise-based amplitude variation
  ├─ Color from low to high palette entries
  └─ Creates ripple/wave appearance

MAGIC:
  ├─ Radial burst pattern
  ├─ Rotating angle per frame
  ├─ Distance-based color mapping
  └─ Circular energy effect

EXPLOSION:
  ├─ Growing ring pattern
  ├─ Inner burst fills first frame
  ├─ Expanding shockwave ring
  └─ Fades outward
```

---

### 5. AnimationSystem (src/animation/AnimationSystem.js)

**Purpose:** Animation clip management and generation.

**Template Structure:**

```javascript
ANIMATION_TEMPLATES = {
  idle: {
    frames: [0, 1, 0, 1],          // Frame sequence
    fps: 4,                        // Speed
    loop: true,                    // Does it repeat?
    pingPong: false,               // Reverse on return?
    minFrames: 2,
    maxFrames: 4
  },
  walk: {
    frames: [0, 1, 2, 3, 2, 1],   // 6-frame walk cycle
    fps: 8,
    loop: true,
    pingPong: false,
    minFrames: 4,
    maxFrames: 8
  },
  // ... more templates ...
}
```

**AnimationClip Class:**

```javascript
class AnimationClip {
  name: string              // 'idle', 'walk', etc.
  frames: number[]          // [0, 1, 2, 3, ...]
  fps: number               // Frames per second
  loop: boolean             // Loops forever?
  pingPong: boolean         // Reverse play?

  get duration() {
    return this.frames.length / this.fps;  // In seconds
  }

  get frameDuration() {
    return Math.round(1000 / this.fps);   // In milliseconds
  }

  toJSON() {
    return {name, frames, fps, loop, pingPong};
  }
}
```

**Frame Generation Pipeline:**

```
Base Canvas (generated character/sprite)
        ↓
For each animation type {
  ├─ Get frame count from template
  ├─ Generate variations:
  │  ├─ IDLE: subtle vertical shift (breathing)
  │  ├─ WALK: horizontal leg offset + vertical bounce
  │  ├─ RUN: stronger lean + higher bounce
  │  ├─ JUMP: vertical movement arc
  │  ├─ ATTACK: weapon swing path
  │  ├─ HURT: brightness flash + recoil
  │  └─ DEATH: vertical fade
  └─ Store as PixelCanvas frame
        ↓
Collect all frames
        ↓
Create AnimationClip with frame indices
}
```

**Animation Transformation Code Example (Walk):**

```javascript
_generateWalkFrames(base, count) {
  const frames = [];
  const fc = Math.max(4, count);

  for (let i = 0; i < fc; i++) {
    const frame = new PixelCanvas(base.width, base.height, base.scale);
    const phase = (i / fc) * Math.PI * 2;

    // Leg shift with sine wave: walks side-to-side
    const legShift = Math.round(Math.sin(phase));

    // Vertical bounce: feet lift off ground
    const bounceY = Math.abs(Math.round(Math.sin(phase) * 0.5));

    // Draw frame with offset
    for (let y = 0; y < base.height; y++) {
      for (let x = 0; x < base.width; x++) {
        const yNorm = y / base.height;
        let srcX = x;
        let srcY = y - bounceY;

        // Apply leg shift to lower body only
        if (yNorm > 0.6) {
          srcX = x - legShift;
        }

        if (srcX >= 0 && srcX < base.width && srcY >= 0 && srcY < base.height) {
          const p = base.getPixel(srcX, srcY);
          if (p.a > 0) {
            frame.setPixel(x, y, p.r, p.g, p.b, p.a);
          }
        }
      }
    }
    frames.push(frame);
  }
  return frames;
}
```

---

### 6. SpriteSheetGenerator (src/spritesheet/SpriteSheetGenerator.js)

**Purpose:** Pack frames into sprite sheets with metadata.

**Algorithm: Frame Packing**

```
Input: Array<PixelCanvas> frames (all same size)

Step 1: Calculate Grid
├─ frameW = width of each frame
├─ frameH = height of each frame
├─ columns = sqrt(frameCount) or user-specified
├─ rows = ceil(frameCount / columns)
├─ sheetW = frameW * columns
├─ sheetH = frameH * rows

Step 2: Create Sheet Canvas
├─ size = (sheetW, sheetH)
├─ For each frame:
│  ├─ Calculate position: row = i / columns, col = i % columns
│  ├─ offsetX = col * frameW
│  ├─ offsetY = row * frameH
│  └─ canvas.drawSprite(frame, offsetX, offsetY)

Step 3: Generate Metadata
├─ For each frame:
│  ├─ frame_name = `{prefix}_{index}`
│  ├─ Position in sheet
│  ├─ Duration from animation clip
│  └─ Store in TexturePacker format
├─ Metadata.frames = {...}
├─ Metadata.animations = [...clips...]
└─ Metadata.meta = {size, scale, columns, rows, ...}

Step 4: Return Pack Result
├─ canvas: upscaled PNG
└─ metadata: JSON object
```

**TexturePacker Format:**

```json
{
  "frames": {
    "player_0": {
      "frame": {"x": 0, "y": 0, "w": 64, "h": 64},
      "duration": 250
    },
    "player_1": {
      "frame": {"x": 64, "y": 0, "w": 64, "h": 64},
      "duration": 250
    }
  },
  "animations": [
    {
      "name": "idle",
      "frames": [0, 1, 0, 1],
      "fps": 4,
      "loop": true
    }
  ],
  "meta": {
    "image": "player.png",
    "size": {"w": 256, "h": 256},
    "scale": "4",
    "frameSize": {"w": 64, "h": 64},
    "totalFrames": 14,
    "columns": 4,
    "rows": 4
  }
}
```

---

## 📊 Data Flow

### Complete Generation Pipeline

```
┌─ CLI Argument Parser / API JSON Body ─────┐
│ --type character --palette pico8 --animations │
│ idle,walk --width 16 --height 16 --scale 4  │
└──────────────────┬──────────────────────────┘
                   │ Parse & Normalize
                   ▼
┌──────────────────────────────────────────────────┐
│         AssetGenerator.generateSprite()          │
│ ├─ type: "character"                            │
│ ├─ width: 16, height: 16, scale: 4             │
│ ├─ palette: "pico8"                            │
│ └─ animations: ["idle", "walk"]                │
└──────────┬──────────────────┬───────────────────┘
           │                  │
           ▼                  ▼
    ┌─────────────┐    ┌──────────────────┐
    │ Procedural  │    │ PaletteManager   │
    │ Generator   │    │ Get palette      │
    │ .generate   │    └──────────────────┘
    │ Character() │
    └──────┬──────┘
           │
Step 1: ┌──┴─────────────────────────────┐
        │ _generateSymmetricMask()       │
        │ [SeededNoise 2D sampling]      │
        │ Result: 16×16 boolean grid     │
        └──────────┬────────────────────┘
Step 2:           │
        ┌─────────┴─────────────────┐
        │ _colorRegions()           │
        │ [Map grid to colors]      │
        │ Create PixelCanvas        │
        └──────────┬────────────────┘
Step 3:           │
        ┌─────────┴──────────────────┐
        │ _applyDirectionalShading() │
        │ [Brighten/darken pixels]   │
        └──────────┬─────────────────┘
Step 4:           │
        ┌─────────┴──────────────────┐
        │ [Optional effects]         │
        │ ├─ Dithering              │
        │ ├─ Outline                │
        │ └─ Shadow                 │
        └──────────┬─────────────────┘
                   │ Result: baseCanvas
                   │ (single 16×16 sprite)
                   ▼
        ┌──────────────────────────┐
        │ AnimationSystem           │
        │ .generateClips()          │
        │ ["idle", "walk"]          │
        └────────┬─────────────────┘
                 │
For each animation:
  │
  ├─ _generateIdleFrames(baseCanvas, 2)
  │   └─ Result: [frame0, frame1]
  │
  └─ _generateWalkFrames(baseCanvas, 6)
      └─ Result: [frame0, frame1, frame2, ...]

        collectAllFrames: [14 PixelCanvas objects]
                   │
                   ▼
        ┌─────────────────────────┐
        │ SpriteSheetGenerator    │
        │ .pack()                 │
        │ - Grid layout: 4×4      │
        │ - Composite frames      │
        │ - Generate JSON metadata│
        └────────┬────────────────┘
                 │
           ┌─────┴──────────────┐
           │                    │
    Result Canvas         Result Metadata
   256×256px PNG        TexturePacker JSON
   (upscaled 4x)           {frames, animations}
           │                    │
           ▼                    ▼
        ┌──────────────────────────────┐
        │ ExportService.exportBase64() │
        │ [Encode PNG to base64]       │
        └──────────┬───────────────────┘
                   │
        ┌──────────┴──────────────────┐
        │ Return API Response / Files │
        │ {id, spriteSheet, metadata} │
        └─────────────────────────────┘
```

---

## 🔬 Algorithms

### Bayer Dithering

**Purpose:** Reduce color banding by introducing ordered noise.

**Bayer 4×4 Matrix:**
```
 0  8  2 10
12  4 14  6
 3 11  1  9
15  7 13  5
```

**Algorithm:**

```javascript
_applyBayerDithering(canvas, width, height) {
  const BAYER_4X4 = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5],
  ];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = canvas.getPixel(x, y);

      // Get threshold for this pixel
      const threshold = BAYER_4X4[y % 4][x % 4] / 16;

      // Gray-scale brightness (0–1)
      const gray = (p.r + p.g + p.b) / (3 * 255);

      // Compare brightness to threshold
      const factor = gray > threshold ? 1.15 : 0.85;

      // Brighten or darken
      canvas.setPixel(x, y,
        Math.min(255, Math.round(p.r * factor)),
        Math.min(255, Math.round(p.g * factor)),
        Math.min(255, Math.round(p.b * factor)),
        p.a
      );
    }
  }
}
```

**Visual Effect:** Ordered pattern replaces smooth gradients, creating authentic dithered look.

---

### Directional Shading

**Purpose:** Add depth by simulating light from above.

**Algorithm:**

```javascript
_applyDirectionalShading(canvas, mask, width, height, palette) {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!mask[y][x]) continue;

      const p = canvas.getPixel(x, y);
      if (p.a === 0) continue;

      // Count filled pixels in row above
      let neighborsAbove = 0;
      if (y > 0) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx >= 0 && nx < width && mask[y - 1][nx]) {
            neighborsAbove++;
          }
        }
      }

      // Shade based on light exposure
      let shade;
      if (neighborsAbove === 0) {
        shade = +40;  // Fully exposed to light (highlight)
      } else if (y < height * 0.33) {
        shade = +20;  // Top third: mid-light
      } else if (y < height * 0.66) {
        shade = 0;    // Middle: base color
      } else {
        shade = -30;  // Bottom: shadow
      }

      canvas.setPixel(x, y,
        Math.min(255, Math.max(0, p.r + shade)),
        Math.min(255, Math.max(0, p.g + shade)),
        Math.min(255, Math.max(0, p.b + shade)),
        p.a
      );
    }
  }
}
```

**Result:** Smooth 3D appearance from flat 2D pixel art.

---

## 🎯 Design Patterns

### Separation of Concerns

```
PixelCanvas              → Pixel manipulation (low-level)
PaletteManager          → Color management
ProceduralGenerator     → High-level generation logic
AnimationSystem         → Animation templates
SpriteSheetGenerator    → Packing & metadata
ExportService           → Format conversion
```

Each module has single responsibility, easy to test and extend.

### Strategy Pattern (Export)

```javascript
// Different export strategies for different formats
ExportService.exportPhaserAtlas(...)
ExportService.exportGodot4(...)
ExportService.exportUnity(...)
ExportService.exportXmlAtlas(...)
ExportService.exportGIF(...)
ExportService.exportBase64(...)
```

Client code doesn't know implementation details.

### Factory Pattern (Asset Generation)

```javascript
// AssetGenerator route to appropriate factory
switch (type) {
  case 'character':
    return ProceduralGenerator.generateCharacter(...);
  case 'tileset':
    return ProceduralGenerator.generateTileset(...);
  case 'effect':
    return ProceduralGenerator.generateEffect(...);
}
```

---

## ⚡ Performance Optimization

### Why Generation is Fast (~3–4ms)

1. **No AI Models**: Procedural algorithms run in O(N) time (N = pixel count)
2. **Seeded Randomness**: No network calls, local computation only
3. **Lazy Evaluation**: Only generate requested asset type
4. **Efficient Data Structures**: Uint8ClampedArray for pixels, simple arrays for frames
5. **Minimal Allocations**: Reuse buffers where possible

### Complexity Analysis

| Operation | Complexity | Time |
|-----------|-----------|------|
| Generate mask | O(W × H) | <1ms |
| Color regions | O(W × H) | <1ms |
| Shading | O(W × H) | <1ms |
| Animation frames | O(N × W × H) | ~1ms |
| Pack to sheet | O(frames count × W × H) | <1ms |
| Encode PNG | O(W × H × scale²) | <1ms |
| **Total** | — | **3–4ms** |

### Optimization Tips

1. **Smaller Canvas**: 8×8 instead of 32×32 (16x fewer pixels)
2. **Fewer Animations**: Generate idle only (~1ms vs. 4ms for all 8)
3. **Lower Scale**: 2x instead of 4x (4x fewer pixels in output)
4. **Batch Generation**: Generate multiple assets in sequence

---

## 🔌 Extension Guide

### Adding a New Animation Type

**Step 1:** Add template to `ANIMATION_TEMPLATES`:

```javascript
// src/animation/AnimationSystem.js
ANIMATION_TEMPLATES.my_custom = {
  frames: [0, 1, 2, 3],
  fps: 8,
  loop: false,
  pingPong: false,
  minFrames: 4,
  maxFrames: 4
};
```

**Step 2:** Implement frame generator:

```javascript
// src/generation/ProceduralGenerator.js
_generateMyCustomFrames(base, count) {
  const frames = [];
  const fc = Math.max(4, count);

  for (let i = 0; i < fc; i++) {
    const frame = new PixelCanvas(base.width, base.height, base.scale);
    const phase = (i / fc) * Math.PI * 2;

    // Your custom transformation logic
    for (let y = 0; y < base.height; y++) {
      for (let x = 0; x < base.width; x++) {
        // Transform pixels based on phase...
      }
    }
    frames.push(frame);
  }
  return frames;
}
```

**Step 3:** Add case to generator switch:

```javascript
case 'my_custom':
  frames.push(...this._generateMyCustomFrames(baseCanvas, frameCount));
  break;
```

### Adding a New Biome

**Step 1:** Add colors to `_getBiomeColors()`:

```javascript
_getBiomeColors(biome, palette) {
  const colorSets = {
    my_biome: {
      base: [5, 6, 7],
      accent: [8, 9],
      detail: [10, 11]
    }
  };
  // ...
}
```

**Step 2:** Biome generation automatically uses the colors!

### Adding a New Export Format

**Step 1:** Add static method to `ExportService`:

```javascript
static exportMyFormat(canvas, metadata, outputDir, baseName) {
  // Generate format-specific output
  const filePath = path.join(outputDir, `${baseName}.myformat`);
  // Write file...
  return filePath;
}
```

**Step 2:** Add route to `api.js`:

```javascript
case 'myformat':
  const filePath = ExportService.exportMyFormat(...);
  res.json({format: 'myformat', file: filePath});
  break;
```

---

## 📈 Benchmarking

**Measure generation performance:**

```javascript
const start = Date.now();
const result = AssetGenerator.generateSprite(params);
const duration = Date.now() - start;
console.log(`Generated in ${duration}ms`);
```

**Profile bottlenecks:**

```javascript
console.time('mask');
const mask = this._generateSymmetricMask(...);
console.timeEnd('mask');

console.time('color');
this._colorRegions(...);
console.timeEnd('color');
// ... etc
```

---

**End of Architecture Guide**

*For implementation questions, refer to source code comments and module docstrings.*
