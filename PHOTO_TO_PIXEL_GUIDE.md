# Photo-to-Pixel Conversion Guide

## Overview

The Photo-to-Pixel feature allows you to convert photographs and images into pixel art with customizable cartoonification effects. This guide covers how to use this feature via both CLI and REST API.

## Features

- **Custom Pixel Density**: Control the output resolution (8-256 pixels width)
- **Cartoonification**: Automatic edge detection and cartoon effect
- **Color Quantization**: Reduce colors to a specific palette
- **Edge Outlines**: Optional black outlines around detected edges
- **Contrast Enhancement**: Boost or reduce contrast for more vivid colors
- **Posterization**: Reduce color depth for more retro look
- **Smoothing**: Optional pixel smoothing for cleaner results
- **Upscaling**: After pixelization, scale up the result (1-8x)

## Style Presets

The feature comes with pre-configured style presets:

### 1. **cartoon** (Default)
Best for natural photos with cartoon-like appearance
- Pixel Density: 24px
- Edge Detection: ✓ Enabled
- Contrast Boost: 1.3x
- Posterization: 6 levels
- Outlines: ✓ Enabled (black)
- Smoothing: 1 (normal)

### 2. **highRes**
High-resolution pixel art with detail preservation
- Pixel Density: 64px
- Edge Detection: ✗ Disabled
- Contrast Boost: 1.1x
- Posterization: 5 levels
- Outlines: ✗ Disabled
- Smoothing: 0 (none)

### 3. **lowRes**
Retro, heavily pixelated appearance
- Pixel Density: 16px
- Edge Detection: ✓ Enabled
- Edge Threshold: 35 (higher = fewer edges)
- Contrast Boost: 1.4x
- Posterization: 4 levels
- Outlines: ✓ Enabled (black)
- Smoothing: 2 (heavy)

### 4. **minimal**
Minimal processing, mostly color quantization
- Pixel Density: 32px
- Edge Detection: ✗ Disabled
- Contrast Boost: 1.0x (none)
- Posterization: 8 levels (more colors)
- Outlines: ✗ Disabled
- Smoothing: 0 (none)

## Supported Palettes

- **AUTO** (default) - Automatically generates a harmonic palette
- **PICO-8** - 16 colors inspired by PICO-8 fantasy console
- **NES** - 54 colors from Nintendo Entertainment System
- **GAMEBOY** - 4 colors from classic Game Boy
- **ENDESGA-32** - 32 colors from ENDESGA-32 palette

## CLI Usage

### Basic Usage

```bash
pixel-gen --type photo --image ./path/to/image.jpg --style cartoon
```

### With Custom Parameters

```bash
pixel-gen --type photo \
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
  --upscale 2 \
  --output ./output
```

### CLI Options Reference

| Option | Type | Default | Range | Description |
|--------|------|---------|-------|-------------|
| `--image` | Path | Required | - | Path to input image file |
| `--style` | String | cartoon | cartoon, highRes, lowRes, minimal | Preset style |
| `--pixelDensity` | Number | 32 | 8-256 | Target width in pixels |
| `--palette` | String | AUTO | AUTO, PICO-8, NES, GAMEBOY, ENDESGA-32 | Color palette |
| `--maxColors` | Number | 16 | 4-32 | Maximum colors to use |
| `--edges` | Boolean | true | true, false | Enable edge detection |
| `--outlines` | Boolean | true | true, false | Add edge outlines |
| `--contrast` | Float | 1.2 | 1.0-2.0 | Contrast multiplier |
| `--posterize` | Number | 4 | 2-8 | Color quantization levels |
| `--smooth` | Number | 1 | 0-2 | Smoothing intensity |
| `--upscale` | Number | 1 | 1-8 | Upscaling factor |
| `--output` | Path | ./output | - | Output directory |
| `--format` | String | png | png, gif | Export format |

## REST API Usage

### Endpoint

```
POST /api/generate/from-photo
```

### Request

Multipart form data with the following fields:

```javascript
const formData = new FormData();
formData.append('image', imageFile); // File input

// Optional parameters
formData.append('pixelDensity', '32');
formData.append('palette', 'PICO-8');
formData.append('style', 'cartoon');
formData.append('enableEdgeDetection', 'true');
formData.append('edgeThreshold', '30');
formData.append('contrastBoost', '1.2');
formData.append('posterization', '4');
formData.append('enableOutlines', 'true');
formData.append('outlineColor', 'black');
formData.append('maxColors', '16');
formData.append('smoothing', '1');
formData.append('upscale', '1');

const response = await fetch('http://localhost:3000/api/generate/from-photo', {
  method: 'POST',
  body: formData
});

const result = await response.json();
```

### Response

```json
{
  "id": "asset_abc12345",
  "type": "photo-pixelized",
  "image": "data:image/png;base64,iVBORw0K...",
  "style": "cartoon",
  "pixelDensity": 32,
  "upscale": 1,
  "generationTimeMs": 156
}
```

### Get Available Presets

```
GET /api/photo-presets
```

Response includes all available presets and supported palettes:

```json
{
  "presets": {
    "cartoon": { ... },
    "highRes": { ... },
    "lowRes": { ... },
    "minimal": { ... }
  },
  "supportedPalettes": ["AUTO", "PICO-8", "NES", "GAMEBOY", "ENDESGA-32"]
}
```

## Examples

### Example 1: Portrait with Cartoon Style

```bash
pixel-gen --type photo \
  --image ./portrait.jpg \
  --style cartoon \
  --palette PICO-8 \
  --upscale 2
```

**Result**: A cartoony pixel art portrait at 2x upscaled resolution with PICO-8 colors and black outlines.

### Example 2: Landscape with High Resolution

```bash
pixel-gen --type photo \
  --image ./landscape.jpg \
  --style highRes \
  --pixelDensity 64 \
  --palette ENDESGA-32 \
  --maxColors 32
```

**Result**: High-detail pixel art landscape preserving more of the original image details.

### Example 3: Low Resolution Retro Style

```bash
pixel-gen --type photo \
  --image ./scene.jpg \
  --style lowRes \
  --pixelDensity 16 \
  --palette GAMEBOY \
  --upscale 4
```

**Result**: Retro 4x upscaled pixel art limited to Game Boy's 4-color palette.

### Example 4: Minimal Processing

```bash
pixel-gen --type photo \
  --image ./artwork.png \
  --style minimal \
  --pixelDensity 48 \
  --posterize 8 \
  --smooth 0
```

**Result**: Clean pixel art with minimal edge detection, good for abstract or artistic images.

## Advanced Customization

### Custom Color Palette from Image

To automatically generate a palette that matches your image:

```bash
pixel-gen --type photo \
  --image ./photo.jpg \
  --palette AUTO \
  --maxColors 12
```

### Remove Outlines for Clean Look

```bash
pixel-gen --type photo \
  --image ./photo.jpg \
  --style cartoon \
  --outlines false
```

### Boost Contrast for More Vivid Colors

```bash
pixel-gen --type photo \
  --image ./photo.jpg \
  --contrast 1.5 \
  --posterize 6
```

### Preserve More Detail

```bash
pixel-gen --type photo \
  --image ./photo.jpg \
  --pixelDensity 64 \
  --edges false \
  --smooth 0 \
  --posterize 8
```

## Tips and Best Practices

1. **Choosing Pixel Density**
   - Low (8-16): Very pixelated, retro look
   - Medium (24-32): Good balance, cartoon-like
   - High (48-64): More detail, less pixelated

2. **Edge Detection for Outlines**
   - Works best with high-contrast subjects
   - Disable for minimalist, clean results
   - Adjust `edgeThreshold` to control edge sensitivity

3. **Color Palette Selection**
   - Use preset palettes for specific aesthetics
   - Use AUTO for realistic photos
   - Limit `maxColors` for retro game look

4. **Posterization Levels**
   - 4: Very retro, limited colors
   - 6: Good balance
   - 8: More natural colors

5. **Smoothing**
   - 0: Sharp, pixelated
   - 1: Normal, good balance
   - 2: Soft, blended edges

## Processing Time

- **Small images (< 1MB)**: 5-20ms
- **Medium images (1-5MB)**: 20-100ms
- **Large images (> 5MB)**: 100-500ms

Actual times depend on:
- Image dimensions
- Pixel density setting
- Edge detection complexity
- Palette size

## Supported Image Formats

- JPEG (.jpg, .jpeg)
- PNG (.png)
- WebP (.webp)
- GIF (.gif)

## File Size Limits

- CLI: No particular limit
- REST API: 10MB per request

## Troubleshooting

### Issue: Edge detection creating too many outlines

**Solution**: Increase `edgeThreshold` value:
```bash
--edges true --edgeThreshold 50
```

### Issue: Colors look muddy or oversaturated

**Solution**: Reduce contrast boost:
```bash
--contrast 1.0
```

### Issue: Too much pixelation

**Solution**: Increase pixel density:
```bash
--pixelDensity 48
```

### Issue: Image looks too smooth/blurry

**Solution**: Reduce smoothing and disable edge detection:
```bash
--smooth 0 --edges false
```

## Integration Example

### JavaScript/Node.js

```javascript
const FormData = require('form-data');
const fs = require('fs');
const axios = require('axios');

async function convertToPixelArt(imagePath) {
  const form = new FormData();
  form.append('image', fs.createReadStream(imagePath));
  form.append('style', 'cartoon');
  form.append('pixelDensity', '32');
  form.append('palette', 'PICO-8');

  const response = await axios.post(
    'http://localhost:3000/api/generate/from-photo',
    form,
    {
      headers: form.getHeaders()
    }
  );

  return response.data;
}
```

### HTML/Browser

```html
<input type="file" id="imageInput" accept="image/*">
<button onclick="convertImage()">Convert to Pixel Art</button>
<img id="result" src="">

<script>
async function convertImage() {
  const file = document.getElementById('imageInput').files[0];
  const formData = new FormData();
  formData.append('image', file);
  formData.append('style', 'cartoon');

  const response = await fetch('/api/generate/from-photo', {
    method: 'POST',
    body: formData
  });

  const result = await response.json();
  document.getElementById('result').src = result.image;
}
</script>
```

## Performance Optimization

For batch processing of multiple images:

```bash
# Process with CLI in parallel
parallel 'pixel-gen --type photo --image {} --style cartoon' ::: *.jpg

# Or use a loop
for img in *.jpg; do
  pixel-gen --type photo --image "$img" --style lowRes --upscale 2
done
```

## See Also

- [README.md](README.md) - Main feature overview
- [QUICK_REFERENCE.md](QUICK_REFERENCE.md) - All CLI commands at a glance
- [ARCHITECTURE.md](ARCHITECTURE.md) - Technical implementation details
