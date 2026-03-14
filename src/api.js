const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const AssetGenerator = require('./AssetGenerator');
const ExportService = require('./export/ExportService');
const { PaletteManager } = require('./palette/PaletteManager');
const { AnimationSystem } = require('./animation/AnimationSystem');
const ImagePixelizer = require('./generation/ImagePixelizer');

const app = express();
app.use(express.json({ limit: '10mb' }));

const paletteManager = new PaletteManager();

// Setup multer for file uploads
const uploadDir = './uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({
  dest: uploadDir,
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, WebP, and GIF images are allowed'));
    }
  },
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB max
});

// In-memory asset store (replace with DB for production)
const assetStore = new Map();

// --- API Routes ---

// Generate a sprite / sprite sheet
app.post('/api/generate/sprite', (req, res) => {
  try {
    const result = AssetGenerator.generateSprite(req.body);
    assetStore.set(result.id, result);

    const exported = ExportService.exportBase64(result.canvas, result.metadata);
    res.json({
      id: result.id,
      spriteSheet: exported.spriteSheet,
      metadata: exported.metadata,
      frames: result.frames.length,
      generationTimeMs: result.generationTimeMs,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Generate a tileset
app.post('/api/generate/tileset', (req, res) => {
  try {
    const result = AssetGenerator.generateTileset(req.body);
    assetStore.set(result.id, result);

    const exported = ExportService.exportBase64(result.canvas, result.metadata);
    res.json({
      id: result.id,
      spriteSheet: exported.spriteSheet,
      metadata: exported.metadata,
      tiles: result.metadata.tileNames,
      generationTimeMs: result.generationTimeMs,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Generate a particle effect
app.post('/api/generate/effect', (req, res) => {
  try {
    const result = AssetGenerator.generateEffect(req.body);
    assetStore.set(result.id, result);

    const exported = ExportService.exportBase64(result.canvas, result.metadata);
    res.json({
      id: result.id,
      spriteSheet: exported.spriteSheet,
      metadata: exported.metadata,
      frames: result.frames.length,
      generationTimeMs: result.generationTimeMs,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Generate pixel art from a photo
app.post('/api/generate/from-photo', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    const imagePath = req.file.path;
    const config = req.body;

    // Generate from photo
    const result = await AssetGenerator.generateFromPhoto({
      imagePath,
      pixelDensity: parseInt(config.pixelDensity) || 32,
      palette: config.palette || 'AUTO',
      style: config.style || 'cartoon',
      enableEdgeDetection: config.enableEdgeDetection !== 'false',
      edgeThreshold: parseInt(config.edgeThreshold) || 30,
      contrastBoost: parseFloat(config.contrastBoost) || 1.2,
      posterization: parseInt(config.posterization) || 4,
      enableOutlines: config.enableOutlines !== 'false',
      outlineColor: config.outlineColor || 'black',
      maxColors: parseInt(config.maxColors) || 16,
      smoothing: parseInt(config.smoothing) || 1,
      upscale: parseInt(config.upscale) || 1,
    });

    // Store result
    assetStore.set(result.id, result);

    // Export as base64
    const exported = ExportService.exportBase64(result.canvas, {});

    // Clean up uploaded file
    fs.unlinkSync(imagePath);

    res.json({
      id: result.id,
      type: result.type,
      image: exported.spriteSheet,
      style: result.style,
      pixelDensity: result.pixelDensity,
      upscale: result.upscale,
      generationTimeMs: result.generationTimeMs,
    });
  } catch (err) {
    // Clean up uploaded file on error
    if (req.file) {
      fs.unlinkSync(req.file.path);
    }
    res.status(400).json({ error: err.message });
  }
});

// List photo-to-pixel presets
app.get('/api/photo-presets', (_req, res) => {
  const presets = ImagePixelizer.getPresets();
  const supportedPalettes = ImagePixelizer.getSupportedPalettes();
  res.json({
    presets,
    supportedPalettes,
  });
});

// List palettes
app.get('/api/palettes', (_req, res) => {
  res.json(paletteManager.list());
});

// List animation templates
app.get('/api/animations', (_req, res) => {
  res.json(AnimationSystem.listTemplates());
});

// Export a previously generated asset
app.post('/api/export', async (req, res) => {
  try {
    const { assetId, format, options = {} } = req.body;
    if (!assetId) return res.status(400).json({ error: 'assetId is required' });

    const asset = assetStore.get(assetId);
    if (!asset) return res.status(404).json({ error: 'Asset not found' });

    const baseName = `${asset.type}_${assetId}`;
    const outputDir = `./output/${assetId}`;

    switch (format) {
      case 'phaser':
      case 'pixi': {
        const paths = ExportService.exportPhaserAtlas(asset.canvas, asset.metadata, outputDir, baseName);
        res.json({ format, files: paths });
        break;
      }
      case 'xml':
      case 'starling': {
        const paths = ExportService.exportXmlAtlas(asset.canvas, asset.metadata, outputDir, baseName);
        res.json({ format, files: paths });
        break;
      }
      case 'unity': {
        const paths = ExportService.exportFramePNGs(asset.frames, outputDir, baseName);
        res.json({ format, files: paths });
        break;
      }
      case 'godot4': {
        const paths = ExportService.exportGodot4(asset.frames, asset.metadata, outputDir, baseName);
        res.json({ format, files: paths });
        break;
      }
      case 'gif': {
        const gifPath = `${outputDir}/${baseName}.gif`;
        await ExportService.exportGIF(asset.frames, gifPath, { fps: options.fps || 8 });
        res.json({ format, file: gifPath });
        break;
      }
      case 'base64':
      default: {
        const exported = ExportService.exportBase64(asset.canvas, asset.metadata);
        res.json({ format: 'base64', ...exported });
        break;
      }
    }
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', version: '0.5.0' });
});

module.exports = app;
