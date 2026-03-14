# 🚀 Pixel Asset Generator — Quick Reference

## ⚡ 30-Second Setup

```bash
npm install          # Install dependencies
npm start            # Start REST API (port 3000)

# OR use CLI
node src/cli.js --type character --palette pico8
```

---

## 📋 CLI Cheatsheet

### Generate Character
```bash
# Minimal
node src/cli.js --type character

# Full options
node src/cli.js --type character \
  --width 16 --height 16 --scale 4 \
  --palette pico8 \
  --animations idle,walk,attack_slash \
  --symmetry horizontal \
  --outline true \
  --shading directional \
  --seed 12345 \
  --format phaser \
  --output ./my_assets
```

### Generate Tileset
```bash
# Minimal
node src/cli.js --type tileset

# Full options
node src/cli.js --type tileset \
  --biome dungeon \
  --tileSize 16 --scale 2 \
  --palette endesga32 \
  --variants base,edge,corner,decoration
```

### Generate Effect
```bash
# Minimal
node src/cli.js --type effect --effect fire

# Full options
node src/cli.js --type effect \
  --effect fire \
  --width 16 --height 16 --frames 8 \
  --scale 4 \
  --colors "#ff4400,#ff8800,#ffcc00"
```

### Convert Photo to Pixel Art ✨ NEW!
```bash
# Minimal (cartoon style)
node src/cli.js --type photo --image ./photo.jpg

# Full options
node src/cli.js --type photo \
  --image ./photo.jpg \
  --style cartoon \
  --pixelDensity 32 \
  --palette PICO-8 \
  --maxColors 16 \
  --edges true \
  --outlines true \
  --contrast 1.3 \
  --posterize 6 \
  --smooth 1 \
  --upscale 2
```

---

## 🎨 Available Options

### Photo Styles
- `cartoon` – Cartoon-like with outlines (default)
- `highRes` – High detail, 64px density
- `lowRes` – Retro pixelated, 16px density
- `minimal` – Minimal processing, color quantization only

### Photo Palettes
- `AUTO` – Auto-generated from image
- `PICO-8` – 16 colors
- `NES` – 54 colors
- `GAMEBOY` – 4 colors
- `ENDESGA-32` – 32 colors

### Palettes
- `pico8` – 16 colors (fantasy RPG)
- `nes` – 54 colors (classic 8-bit)
- `gameboy` – 4 colors (monochrome)
- `endesga32` – 32 colors (modern pixel art)

### Animation Types
- `idle` – Breathing/subtle movement
- `walk` – Walk cycle
- `run` – Fast running
- `jump` – Jump arc
- `attack_slash` – Melee attack
- `attack_cast` – Magic cast
- `hurt` – Damage flash
- `death` – Fall animation

### Biomes
- `dungeon` – Stone/dark
- `grass` – Forest/nature
- `snow` – Ice/winter
- `desert` – Sand/rocky

### Effects
- `fire` – Flame animation
- `water` – Ripple/wave
- `magic` – Circular energy
- `explosion` – Shock wave

### Export Formats
- `png` – PNG + JSON atlas (default)
- `phaser` – Phaser 3 compatible
- `godot4` – Godot 4 .tres resource
- `unity` – Individual PNG frames
- `xml` – Starling XML format
- `gif` – Animated GIF

---

## 📡 REST API Quick Reference

### Start Server
```bash
npm start
# http://localhost:3000
```

### Generate Sprite (POST)
```bash
curl -X POST http://localhost:3000/api/generate/sprite \
  -H "Content-Type: application/json" \
  -d '{
    "type": "character",
    "width": 16,
    "height": 16,
    "scale": 4,
    "palette": "pico8",
    "animations": ["idle", "walk"]
  }'
```

### Generate Tileset (POST)
```bash
curl -X POST http://localhost:3000/api/generate/tileset \
  -H "Content-Type: application/json" \
  -d '{
    "biome": "dungeon",
    "tileSize": 16,
    "scale": 2,
    "palette": "endesga32"
  }'
```

### Generate Effect (POST)
```bash
curl -X POST http://localhost:3000/api/generate/effect \
  -H "Content-Type: application/json" \
  -d '{
    "effect": "fire",
    "frames": 6,
    "palette": "pico8"
  }'
```

### List Palettes (GET)
```bash
curl http://localhost:3000/api/palettes
```

### List Animations (GET)
```bash
curl http://localhost:3000/api/animations
```

### Health Check (GET)
```bash
curl http://localhost:3000/api/health
```

---

## 🎯 Common Use Cases

### 🎮 RPG Character with Full Animations
```bash
node src/cli.js \
  --type character \
  --palette endesga32 \
  --animations idle,walk,run,attack_slash,hurt,death \
  --symmetry horizontal
```

### 🗺️ Dungeon Map Tileset
```bash
node src/cli.js \
  --type tileset \
  --biome dungeon \
  --variants base,edge,corner,decoration \
  --palette endesga32
```

### 🔥 Fire Particle System
```bash
node src/cli.js \
  --type effect \
  --effect fire \
  --frames 8 \
  --scale 4
```

### 🎪 Space Game Enemy (Minimal)
```bash
node src/cli.js \
  --type character \
  --palette pico8 \
  --width 24 --height 24 \
  --animations idle,death \
  --symmetry vertical
```

### 🌙 Custom Magic Effect
```bash
node src/cli.js \
  --type effect \
  --effect magic \
  --colors "#ff00ff,#aa00ff,#5500ff" \
  --frames 6
```

---

## 📁 Output Structure

```
output/
├── character_abc123.png        # Sprite sheet image
├── character_abc123.json       # Animation metadata
├── tileset_def456.png
├── tileset_def456.json
├── effect_ghi789.png
└── effect_ghi789.json
```

Each JSON contains:
- `frames` – Position/duration of each frame
- `animations` – Frame arrays for each animation
- `meta` – Image size, scale, frame size

---

## ⚙️ Performance Tips

| Goal | Setting |
|------|---------|
| **Fastest** | `--width 8 --height 8 --scale 2 --animations idle` → ~1ms |
| **Balanced** | `--width 16 --height 16 --scale 4` → ~4ms |
| **High Quality** | `--width 32 --height 32 --scale 4` → ~8ms |

---

## 🔍 Troubleshooting

| Problem | Solution |
|---------|----------|
| `npm not found` | Install Node.js from nodejs.org |
| Palette not found | Check spelling, use `curl /api/palettes` to list |
| File permission error | Ensure write access to `./output` folder |
| Animation not showing | Verify animation name in list (see animations table) |
| Blank/transparent output | Increase `--scale` value or check canvas size |

---

## 💾 Export Integration

### Phaser 3
```javascript
this.load.atlas('player', 'character.png', 'character.json');
this.anims.create({
  key: 'walk',
  frames: this.anims.generateFrameNames('player', {prefix: 'player_walk_', start: 0, end: 5}),
  frameRate: 8,
  repeat: -1
});
player.play('walk');
```

### Godot 4
```gdscript
var frames = load("res://assets/character.tres")
$AnimatedSprite2D.sprite_frames = frames
$AnimatedSprite2D.play("walk")
```

### Unity
```csharp
var sprites = Resources.LoadAll<Sprite>("player");
GetComponent<SpriteRenderer>().sprite = sprites[0];
```

---

## 📊 Generation Quality Matrix

| Palette | Characters | Tilesets | Quality |
|---------|-----------|----------|---------|
| PICO-8 | ✓ Great | ✓ Good | High |
| NES | ✓ Great | ✓ Good | High |
| ENDESGA-32 | ✓✓ Excellent | ✓✓ Excellent | Very High |
| Game Boy | ✓ Good | ✓ Poor | Medium |

---

## 🎬 Animation Frame Counts

| Type | Default | Recommended | Max |
|------|---------|-------------|-----|
| `idle` | 2 | 2–4 | 4 |
| `walk` | 6 | 6 | 8 |
| `run` | 4 | 4 | 6 |
| `jump` | 3 | 3 | 3 |
| `attack_slash` | 4 | 4 | 4 |
| `attack_cast` | 6 | 6 | 6 |
| `hurt` | 2 | 2 | 2 |
| `death` | 5 | 5 | 5 |

---

## 🔗 Useful Links

- **Node.js Download**: https://nodejs.org (v20 LTS)
- **Project GitHub**: (to be added)
- **Phaser Docs**: https://photonstorm.github.io/phaser3-docs
- **Godot Docs**: https://docs.godotengine.org/en/stable/
- **Unity Docs**: https://docs.unity3d.com

---

## 📝 Examples in Output Folder

After running examples, check `./output/`:

- `character_dc429be7.png` – Character with 3 animations
- `tileset_73417113.png` – Dungeon tileset with edges
- `effect_9329572d.png` – Fire particle effect

Open PNG in any image viewer. Open JSON in text editor to see metadata structure.

---

**Generated:** March 14, 2026
**Version:** 0.5.0
**Status:** Production Ready ✅
