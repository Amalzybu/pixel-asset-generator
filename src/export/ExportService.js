const fs = require('fs');
const path = require('path');
const GIFEncoder = require('gif-encoder-2');
const { PNG } = require('pngjs');

class ExportService {
  /**
   * Export sprite sheet as PNG + JSON (Phaser/PixiJS atlas format).
   */
  static exportPhaserAtlas(sheetCanvas, metadata, outputDir, baseName = 'spritesheet') {
    fs.mkdirSync(outputDir, { recursive: true });
    const pngPath = path.join(outputDir, `${baseName}.png`);
    const jsonPath = path.join(outputDir, `${baseName}.json`);

    fs.writeFileSync(pngPath, sheetCanvas.toBuffer());
    metadata.meta.image = `${baseName}.png`;
    fs.writeFileSync(jsonPath, JSON.stringify(metadata, null, 2));

    return { pngPath, jsonPath };
  }

  /**
   * Export sprite sheet as PNG + XML (Starling/TexturePacker XML format).
   */
  static exportXmlAtlas(sheetCanvas, metadata, outputDir, baseName = 'spritesheet') {
    fs.mkdirSync(outputDir, { recursive: true });
    const pngPath = path.join(outputDir, `${baseName}.png`);
    const xmlPath = path.join(outputDir, `${baseName}.xml`);

    fs.writeFileSync(pngPath, sheetCanvas.toBuffer());

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<TextureAtlas imagePath="${baseName}.png" width="${metadata.meta.size.w}" height="${metadata.meta.size.h}">\n`;
    for (const [name, data] of Object.entries(metadata.frames)) {
      const f = data.frame;
      xml += `  <SubTexture name="${name}" x="${f.x}" y="${f.y}" width="${f.w}" height="${f.h}"/>\n`;
    }
    xml += `</TextureAtlas>\n`;
    fs.writeFileSync(xmlPath, xml);

    return { pngPath, xmlPath };
  }

  /**
   * Export individual frame PNGs (Unity-style).
   */
  static exportFramePNGs(frames, outputDir, baseName = 'frame') {
    fs.mkdirSync(outputDir, { recursive: true });
    const paths = [];
    for (let i = 0; i < frames.length; i++) {
      const framePath = path.join(outputDir, `${baseName}_${String(i).padStart(3, '0')}.png`);
      fs.writeFileSync(framePath, frames[i].toBuffer());
      paths.push(framePath);
    }
    return paths;
  }

  /**
   * Export as Godot 4 SpriteFrames resource (.tres).
   */
  static exportGodot4(frames, metadata, outputDir, baseName = 'sprite') {
    fs.mkdirSync(outputDir, { recursive: true });

    // Write individual frame PNGs
    const framePaths = [];
    for (let i = 0; i < frames.length; i++) {
      const framePath = path.join(outputDir, `${baseName}_${String(i).padStart(3, '0')}.png`);
      fs.writeFileSync(framePath, frames[i].toBuffer());
      framePaths.push(`${baseName}_${String(i).padStart(3, '0')}.png`);
    }

    // Generate .tres SpriteFrames resource
    let tres = `[gd_resource type="SpriteFrames" format=3]\n\n`;
    tres += `[resource]\n`;

    const animations = metadata.animations || [{ name: 'default', frames: frames.map((_, i) => i), fps: 8, loop: true }];

    const animArray = [];
    for (const anim of animations) {
      const animFrames = (anim.frames || []).map((fi) => {
        const fp = framePaths[fi] || framePaths[0];
        return `SubResource("atlas_${fi}")`;
      });

      animArray.push(`{
"frames": [${anim.frames.map((fi) => `{
"duration": 1.0,
"texture": ExtResource("${fi + 1}")
}`).join(', ')}],
"loop": ${anim.loop !== false},
"name": &"${anim.name}",
"speed": ${anim.fps || 8}.0
}`);
    }

    // Add ExtResources for each frame
    for (let i = 0; i < framePaths.length; i++) {
      tres = `[ext_resource type="Texture2D" path="res://assets/${framePaths[i]}" id="${i + 1}"]\n` + tres;
    }

    tres += `animations = [${animArray.join(', ')}]\n`;

    const tresPath = path.join(outputDir, `${baseName}.tres`);
    fs.writeFileSync(tresPath, tres);

    return { tresPath, framePaths: framePaths.map(fp => path.join(outputDir, fp)) };
  }

  /**
   * Export as animated GIF.
   */
  static exportGIF(frames, outputPath, options = {}) {
    const { fps = 8, scale } = options;
    if (frames.length === 0) throw new Error('No frames for GIF export');

    const w = frames[0].width * (scale || frames[0].scale);
    const h = frames[0].height * (scale || frames[0].scale);
    const delay = Math.round(1000 / fps);

    const encoder = new GIFEncoder(w, h);
    const dir = path.dirname(outputPath);
    fs.mkdirSync(dir, { recursive: true });
    const writeStream = fs.createWriteStream(outputPath);
    encoder.createReadStream().pipe(writeStream);

    encoder.start();
    encoder.setDelay(delay);
    encoder.setRepeat(0); // loop forever
    encoder.setTransparent(0x00000000);

    for (const frame of frames) {
      const buf = frame.toBuffer();
      const png = PNG.sync.read(buf);
      encoder.addFrame(png.data);
    }

    encoder.finish();

    return new Promise((resolve, reject) => {
      writeStream.on('finish', () => resolve(outputPath));
      writeStream.on('error', reject);
    });
  }

  /**
   * Export as Base64 JSON (for REST API inline response).
   */
  static exportBase64(sheetCanvas, metadata) {
    const dataURL = sheetCanvas.toDataURL();
    return {
      spriteSheet: dataURL,
      metadata,
    };
  }
}

module.exports = ExportService;
