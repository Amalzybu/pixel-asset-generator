# Pixel Asset Generator — Skill Document

> A comprehensive guide and project specification for building a tool that helps game developers generate pixel-art assets and sprites.

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Key Features](#key-features)
3. [Technical Architecture](#technical-architecture)
4. [Core Modules](#core-modules)
   - [Canvas & Rendering Engine](#canvas--rendering-engine)
   - [Sprite Sheet Generator](#sprite-sheet-generator)
   - [Palette Manager](#palette-manager)
   - [Animation System](#animation-system)
   - [Procedural Generation](#procedural-generation)
   - [Export System](#export-system)
5. [API Reference](#api-reference)
6. [Data Models](#data-models)
7. [Algorithms & Techniques](#algorithms--techniques)
8. [Integration Guide](#integration-guide)
9. [Example Prompts / Generation Presets](#example-prompts--generation-presets)
10. [Roadmap](#roadmap)

---

## Project Overview

The **Pixel Asset Generator** is a web-based (or CLI-driven) tool that enables game developers to:

- **Procedurally generate** pixel-art sprites, tilesets, and animations without manual drawing.
- **Customize** color palettes, resolutions, and styles (RPG, platformer, top-down, etc.).
- **Export** finished assets as PNG sprite sheets, JSON metadata, or engine-specific formats (Godot, Unity, Phaser, etc.).

### Goals

| Goal | Description |
|------|-------------|
| Speed | Generate a full character sprite sheet in under 5 seconds |
| Quality | Output clean, game-ready 8-bit / 16-bit style pixel art |
| Flexibility | Support resolutions from 8×8 to 128×128 per frame |
| Integration | Provide REST API and CLI so it fits any pipeline |

---

## Key Features

### 🎨 Asset Types
- **Characters** – humanoid, creature, vehicle sprites with walk/run/idle/attack animations
- **Tiles** – terrain, dungeon, forest, city tilesets (16×16, 32×32, 64×64)
- **UI Elements** – health bars, inventory icons, buttons, cursors
- **Backgrounds** – parallax layers (sky, mountains, ground)
- **Effects** – particle sprites (fire, water, magic, explosions)
- **Items** – weapons, potions, keys, treasure chests

### ✨ Generation Modes
| Mode | Description |
|------|-------------|
| Template-based | Fill pre-made pixel templates with palette variations |
| Procedural | Generate wholly new shapes using noise & grammar rules |
| AI-assisted | Use a diffusion / token-based model fine-tuned on pixel art |
| Hybrid | AI draft + post-processing filters to enforce pixel-art constraints |

### 🔧 Customization Options
- Grid size (pixels per cell)
- Color palette (built-in presets or custom hex codes)
- Symmetry (horizontal, vertical, 4-way)
- Outline thickness & color
- Shadow / highlight auto-shading
- Dithering style (Bayer, ordered, random)
- Number of animation frames & frame duration

---

## Technical Architecture

```
┌──────────────────────────────────────────────────────────┐
│                     Client / CLI                         │
│   (Web UI  ·  REST API calls  ·  CLI flags)              │
└───────────────────────┬──────────────────────────────────┘
                        │  HTTP / IPC
┌───────────────────────▼──────────────────────────────────┐
│                   API Gateway (Express)                   │
│   /generate  ·  /export  ·  /palette  ·  /animate        │
└──────┬─────────────────┬─────────────────┬───────────────┘
       │                 │                 │
┌──────▼──────┐  ┌───────▼──────┐  ┌──────▼──────────┐
│  Generation  │  │   Palette    │  │  Export Service  │
│   Engine     │  │   Manager    │  │  (PNG/JSON/GIF)  │
└──────┬──────┘  └──────────────┘  └─────────────────┘
       │
┌──────▼──────────────────────┐
│  Canvas Renderer (node-canvas│
│  or browser CanvasAPI)       │
└─────────────────────────────┘
```

### Technology Stack

| Layer | Recommended Technology |
|-------|----------------------|
| Runtime | Node.js 20 LTS |
| Web framework | Express 4 |
| Canvas rendering | `canvas` npm package (server) / browser `<canvas>` (client) |
| Image encoding | `sharp`, `pngjs`, `gif-encoder-2` |
| Procedural noise | `simplex-noise` |
| AI model (optional) | ONNX Runtime (pixel-art fine-tuned stable diffusion) |
| Database | PostgreSQL (user projects, assets) |
| Queue | Bull / BullMQ (async generation jobs) |
| Storage | S3-compatible object storage |

---

## Core Modules

### Canvas & Rendering Engine

Responsible for drawing pixel data onto an off-screen canvas and producing raw image buffers.

```js
// pseudocode
class PixelCanvas {
  constructor(width, height, scale = 1) {
    this.width = width;       // logical pixels (e.g. 16)
    this.height = height;
    this.scale = scale;       // upscale factor for crisp output (e.g. 4 → 64×64 PNG)
    this.pixels = new Uint8ClampedArray(width * height * 4); // RGBA
  }

  setPixel(x, y, r, g, b, a = 255) { /* ... */ }
  getPixel(x, y) { /* ... */ }
  fill(color) { /* ... */ }
  toBuffer() { /* returns PNG buffer upscaled by this.scale */ }
  toDataURL() { /* base64 PNG for browser */ }
}
```

**Key methods:**

| Method | Signature | Description |
|--------|-----------|-------------|
| `setPixel` | `(x, y, r, g, b, a?)` | Set a single logical pixel |
| `drawSprite` | `(sprite, offsetX, offsetY)` | Blit a sub-sprite onto canvas |
| `applyPalette` | `(palette)` | Remap all colors to nearest palette entry |
| `addOutline` | `(color, thickness?)` | Draw an outline around non-transparent pixels |
| `addShadow` | `(direction, offset, color)` | Auto-generate a drop shadow |
| `toBuffer` | `() => Buffer` | Export upscaled PNG |

---

### Sprite Sheet Generator

Assembles individual frames into a packed sprite sheet and outputs JSON metadata.

```
Frame 0  │ Frame 1  │ Frame 2  │ Frame 3
─────────┼──────────┼──────────┼─────────
Frame 4  │ Frame 5  │ Frame 6  │ Frame 7
```

**Output JSON (TexturePacker-compatible):**

```json
{
  "frames": {
    "player_idle_0": { "frame": { "x": 0,  "y": 0,  "w": 16, "h": 16 }, "duration": 150 },
    "player_idle_1": { "frame": { "x": 16, "y": 0,  "w": 16, "h": 16 }, "duration": 150 },
    "player_walk_0": { "frame": { "x": 32, "y": 0,  "w": 16, "h": 16 }, "duration": 100 }
  },
  "meta": {
    "image": "player.png",
    "size": { "w": 256, "h": 256 },
    "scale": "4"
  }
}
```

---

### Palette Manager

Manages named color palettes for consistent pixel-art aesthetics.

**Built-in palettes:**

| Palette | Colors | Style |
|---------|--------|-------|
| `gameboy` | 4 | Monochrome green |
| `nes` | 54 | Classic NES |
| `pico8` | 16 | PICO-8 console |
| `endesga32` | 32 | Popular indie palette |
| `lospec500` | 500 | Large community palette |
| `custom` | 2–256 | User-defined hex codes |

**Palette operations:**

```js
// Quantize a pixel buffer to the nearest palette colors
quantize(pixelBuffer, palette, algorithm = 'euclidean')

// Generate a complementary palette from a seed color
generatePalette(seedHex, count = 8, harmony = 'analogous')

// Swap a palette on an existing asset (recolor)
swapPalette(asset, fromPalette, toPalette)
```

---

### Animation System

Defines animation clips as ordered sequences of frames with per-frame timing.

**Animation clip schema:**

```json
{
  "name": "walk",
  "frames": [0, 1, 2, 3, 2, 1],
  "fps": 8,
  "loop": true,
  "pingPong": false
}
```

**Built-in animation templates:**

| Template | Frames | Description |
|----------|--------|-------------|
| `idle` | 2–4 | Subtle breathing / blinking |
| `walk` | 6–8 | Side-scrolling walk cycle |
| `run` | 4–6 | Faster walk with more lean |
| `jump` | 3 | Rise → peak → fall |
| `attack_slash` | 4 | Melee swing |
| `attack_cast` | 6 | Magic cast with windup |
| `death` | 5 | Fall and fade |
| `hurt` | 2 | Flash and recoil |

---

### Procedural Generation

Uses a combination of noise functions, symmetry, and cellular automata to generate novel pixel-art shapes.

**Character generation algorithm (overview):**

1. **Body mask** – Generate a random symmetric silhouette using Perlin noise on a grid.
2. **Color regions** – Flood-fill body sections (head, torso, legs) with palette colors.
3. **Detail pass** – Add eyes, accessories, and equipment slots using template overlays.
4. **Shading pass** – Apply a directional light model: lighten top pixels, darken bottom pixels.
5. **Outline pass** – Trace non-transparent pixels and draw a 1-pixel border.

**Tileset generation algorithm (overview):**

1. Choose a biome preset (grass, dungeon, snow, desert).
2. Generate a base tile using tiling noise textures.
3. Create transition / autotile variants (edges, corners, inner corners) for the 47-tile Wang set.
4. Add decorative detail tiles (flowers, cracks, stains) with configurable density.

---

### Export System

Converts generated assets into formats consumable by popular game engines.

| Export Format | Engine | Output |
|---------------|--------|--------|
| PNG + JSON | Phaser 3 / PixiJS | Sprite atlas |
| PNG + XML | Starling / Flash | TexturePacker XML |
| `.png` sequence | Unity | Individual frame PNGs |
| `.tres` + PNG | Godot 4 | `SpriteFrames` resource |
| `.gif` | Web / preview | Animated GIF preview |
| `.aseprite` | Aseprite | Editable source file |
| Base64 JSON | REST API | Inline data for browser |

---

## API Reference

### `POST /api/generate/sprite`

Generate a single sprite or sprite sheet.

**Request body:**

```json
{
  "type": "character",
  "width": 16,
  "height": 16,
  "scale": 4,
  "palette": "pico8",
  "symmetry": "horizontal",
  "animations": ["idle", "walk", "attack_slash"],
  "seed": 42,
  "options": {
    "outline": true,
    "outlineColor": "#000000",
    "shading": "directional",
    "dithering": "bayer"
  }
}
```

**Response:**

```json
{
  "id": "asset_abc123",
  "spriteSheet": "data:image/png;base64,iVBOR...",
  "metadata": { /* TexturePacker-compatible JSON */ },
  "frames": 12,
  "generationTimeMs": 380
}
```

---

### `POST /api/generate/tileset`

Generate a tileset with autotile variants.

**Request body:**

```json
{
  "biome": "dungeon",
  "tileSize": 16,
  "scale": 2,
  "palette": "endesga32",
  "variants": ["base", "edge", "corner", "decoration"],
  "seed": 7
}
```

---

### `POST /api/generate/effect`

Generate a particle effect sprite strip.

**Request body:**

```json
{
  "effect": "fire",
  "frames": 8,
  "width": 16,
  "height": 32,
  "palette": "custom",
  "colors": ["#ff4400", "#ff8800", "#ffcc00", "#ffffff"]
}
```

---

### `GET /api/palettes`

List all built-in palettes.

**Response:**

```json
[
  { "id": "pico8",    "name": "PICO-8",    "count": 16 },
  { "id": "endesga32","name": "ENDESGA-32","count": 32 },
  { "id": "gameboy",  "name": "Game Boy",  "count": 4  }
]
```

---

### `POST /api/export`

Export a previously generated asset in a specified format.

**Request body:**

```json
{
  "assetId": "asset_abc123",
  "format": "godot4",
  "options": { "fps": 8 }
}
```

**Response:** Binary file download or base64 JSON.

---

## Data Models

### Asset

```js
{
  id: String,           // UUID
  type: Enum,           // 'character' | 'tile' | 'effect' | 'ui' | 'background'
  width: Number,        // logical width in pixels
  height: Number,       // logical height in pixels
  scale: Number,        // output upscale factor
  palette: String,      // palette ID or 'custom'
  seed: Number,         // random seed for reproducibility
  frames: [             // array of raw pixel buffers
    { index: Number, buffer: Buffer, duration: Number }
  ],
  animations: [         // named animation clips
    { name: String, frames: [Number], fps: Number, loop: Boolean }
  ],
  metadata: Object,     // TexturePacker-compatible JSON
  createdAt: Date,
  userId: String        // optional, for saved projects
}
```

### Project

```js
{
  id: String,
  name: String,
  description: String,
  assets: [String],     // array of Asset IDs
  engine: Enum,         // 'phaser' | 'unity' | 'godot' | 'pixi' | 'other'
  createdAt: Date,
  updatedAt: Date,
  userId: String
}
```

---

## Algorithms & Techniques

### Symmetric Noise Silhouette (Character Bodies)

```
1. For each cell (x, y) in a W×H grid (e.g. 8×12):
   a. Map x to the left half only (0 … W/2).
   b. Sample 2D Perlin noise at (x * freq, y * freq + seed).
   c. If noise > threshold → pixel is filled.
   d. Mirror the left half to the right half.
2. Apply a vertical gradient mask: stronger threshold near edges
   to encourage a humanoid silhouette (narrow top, wider middle).
```

### Directional Shading

```
For each filled pixel at (x, y):
  neighbors_above = count filled pixels in 3×1 row above
  if neighbors_above == 0:        → highlight color (lightest shade)
  elif y < height * 0.33:         → mid-light shade
  elif y < height * 0.66:         → base color
  else:                           → shadow color (darkest shade)
```

### Bayer Dithering

```
Bayer 4×4 matrix M:
  [ 0,  8,  2, 10]
  [12,  4, 14,  6]
  [ 3, 11,  1,  9]
  [15,  7, 13,  5]

For pixel (x, y) with normalized gray value v ∈ [0,1]:
  threshold = M[y%4][x%4] / 16
  output = (v > threshold) ? white : black
```

### Wang Tile Autotiling (47-tile set)

Each tile has 4 edges (N, E, S, W), each edge being either "same biome" (1) or "different" (0). All 2⁴ = 16 combinations map to specific tile variants. Extended 47-tile sets handle inner corners for smoother transitions.

---

## Integration Guide

### Phaser 3

```js
// Load the generated sprite sheet
this.load.atlas('player', 'player.png', 'player.json');

// Use an animation clip
this.anims.create({
  key: 'walk',
  frames: this.anims.generateFrameNames('player', {
    prefix: 'player_walk_', start: 0, end: 5
  }),
  frameRate: 8,
  repeat: -1
});

const player = this.add.sprite(100, 100, 'player');
player.play('walk');
```

### Godot 4 (GDScript)

```gdscript
var frames = load("res://assets/player.tres")  # SpriteFrames resource
$AnimatedSprite2D.sprite_frames = frames
$AnimatedSprite2D.play("walk")
```

### Unity (C#)

```csharp
// Load individual PNGs as Sprites and add to an Animator Controller
// or use a Sprite Atlas imported from the generated PNG + JSON.
var sprites = Resources.LoadAll<Sprite>("player");
GetComponent<SpriteRenderer>().sprite = sprites[0];
```

---

## Example Prompts / Generation Presets

Use these presets as request bodies to the `/api/generate/sprite` endpoint to quickly create common asset types.

### Classic RPG Hero (16×16)

```json
{
  "type": "character",
  "width": 16, "height": 16, "scale": 4,
  "palette": "endesga32",
  "symmetry": "horizontal",
  "animations": ["idle", "walk", "attack_slash", "hurt", "death"],
  "options": { "outline": true, "shading": "directional" }
}
```

### Space Shooter Enemy Ship (24×24)

```json
{
  "type": "character",
  "width": 24, "height": 24, "scale": 3,
  "palette": "pico8",
  "symmetry": "vertical",
  "animations": ["idle", "death"],
  "options": { "outline": false, "shading": "flat", "dithering": "bayer" }
}
```

### Dungeon Floor Tileset (16×16 tiles)

```json
{
  "type": "tileset",
  "biome": "dungeon",
  "tileSize": 16, "scale": 2,
  "palette": "endesga32",
  "variants": ["base", "edge", "corner", "inner_corner", "decoration"],
  "seed": 99
}
```

### Fire Particle Effect (8×16, 6 frames)

```json
{
  "type": "effect",
  "effect": "fire",
  "width": 8, "height": 16,
  "frames": 6, "scale": 4,
  "palette": "custom",
  "colors": ["#ff2200", "#ff6600", "#ffaa00", "#ffdd00", "#ffffff"]
}
```

### Health Bar UI Icons (16×16)

```json
{
  "type": "ui",
  "subtype": "health_bar",
  "width": 16, "height": 16, "scale": 3,
  "palette": "pico8",
  "variants": ["full", "three_quarter", "half", "quarter", "empty"]
}
```

---

## Roadmap

| Version | Milestone |
|---------|-----------|
| v0.1 | Core canvas engine, symmetric noise generation, PNG export |
| v0.2 | Palette manager, directional shading, Bayer dithering |
| v0.3 | Animation system, sprite sheet packing, JSON metadata |
| v0.4 | Tileset generator with autotile (47-tile Wang set) |
| v0.5 | REST API (Express), web UI preview |
| v0.6 | Effect / particle sprite generator |
| v0.7 | Godot 4, Unity, Phaser 3 export formats |
| v0.8 | AI-assisted generation (ONNX pixel-art model) |
| v1.0 | Stable API, documentation, CLI tool |
| v1.x | Aseprite export, batch generation, user project storage |

---

## License

MIT — free to use in commercial and personal game projects.