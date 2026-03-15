const { v4: uuidv4 } = require('uuid');
const ProceduralGenerator = require('./generation/ProceduralGenerator');
const { AnimationSystem, ANIMATION_TEMPLATES } = require('./animation/AnimationSystem');
const SpriteSheetGenerator = require('./spritesheet/SpriteSheetGenerator');
const { PaletteManager, hexToRgb } = require('./palette/PaletteManager');
const ImagePixelizer = require('./generation/ImagePixelizer');
const PixelCanvas = require('./canvas/PixelCanvas');

const paletteManager = new PaletteManager();

class AssetGenerator {
  /**
   * Generate a character sprite sheet with animations.
   */
  static generateSprite(params) {
    const {
      type = 'character',
      width = 16,
      height = 16,
      scale = 4,
      palette = 'pico8',
      symmetry = 'horizontal',
      animations = ['idle'],
      seed = Date.now(),
      options = {},
    } = params;

    const start = Date.now();
    const generator = new ProceduralGenerator(seed);

    // Register custom palette if custom colors provided
    if (palette === 'custom' && params.colors) {
      paletteManager.createCustom('_custom_temp', params.colors);
    }

    const genOptions = {
      paletteId: palette === 'custom' ? '_custom_temp' : palette,
      symmetry,
      outline: options.outline !== false,
      outlineColor: options.outlineColor ? hexToRgb(options.outlineColor) : { r: 0, g: 0, b: 0 },
      shading: options.shading || 'directional',
      dithering: options.dithering || null,
      scale,
    };

    // Generate base character
    const baseCanvas = generator.generateCharacter(width, height, genOptions);

    // Generate animation frames
    const animFrameMap = new Map();
    const allFrames = [];

    for (const animName of animations) {
      const template = AnimationSystem.getTemplate(animName);
      const frameCount = template ? template.frames.length : 4;
      const frames = generator.generateAnimationFrames(baseCanvas, animName, frameCount, genOptions);
      animFrameMap.set(animName, frames);
      allFrames.push(...frames);
    }

    // Create animation clips
    const clips = AnimationSystem.generateClips(animations);

    // Build sprite sheet
    const prefix = type === 'character' ? 'player' : type;
    const { canvas: sheetCanvas, metadata } = SpriteSheetGenerator.pack(allFrames, {
      prefix: `${prefix}`,
      imageName: `${prefix}.png`,
      animations: clips,
    });

    const genTime = Date.now() - start;

    return {
      id: `asset_${uuidv4().split('-')[0]}`,
      type,
      width,
      height,
      scale,
      seed,
      canvas: sheetCanvas,
      frames: allFrames,
      metadata,
      generationTimeMs: genTime,
    };
  }

  /**
   * Generate a tileset with autotile variants.
   */
  static generateTileset(params) {
    const {
      biome = 'dungeon',
      tileSize = 16,
      scale = 2,
      palette = 'endesga32',
      variants = ['base'],
      seed = Date.now(),
    } = params;

    const start = Date.now();
    const generator = new ProceduralGenerator(seed);

    const tiles = generator.generateTileset(tileSize, {
      biome,
      paletteId: palette,
      variants,
      scale,
    });

    // Pack tiles into a sheet
    const tileCanvases = tiles.map(t => t.canvas);
    const { canvas: sheetCanvas, metadata } = SpriteSheetGenerator.pack(tileCanvases, {
      prefix: `${biome}_tile`,
      imageName: `${biome}_tileset.png`,
    });

    // Add tile names to metadata
    metadata.tileNames = tiles.map(t => t.name);

    return {
      id: `asset_${uuidv4().split('-')[0]}`,
      type: 'tileset',
      biome,
      tileSize,
      scale,
      seed,
      canvas: sheetCanvas,
      frames: tileCanvases,
      metadata,
      generationTimeMs: Date.now() - start,
    };
  }

  /**
   * Generate pixel art from a photo.
   */
  static async generateFromPhoto(params) {
    const {
      imagePath,
      pixelDensity = 32,
      palette = 'AUTO',
      style = 'cartoon', // 'cartoon', 'highRes', 'lowRes', 'minimal'
      enableEdgeDetection = true,
      edgeThreshold = 30,
      contrastBoost = 1.2,
      posterization = 4,
      enableOutlines = true,
      outlineColor = 'black',
      outlineThickness = 1,
      saturation = 1.0,
      maxColors = 16,
      smoothing = 1,
      preBlur = 0.6,
      medianFilter = true,
      cleanIsolated = true,
      upscale = 1,
      seed = Date.now(),
    } = params;

    const start = Date.now();

    try {
      // Determine config from style preset
      let config;
      if (typeof style === 'object') {
        // Custom config provided
        config = style;
      } else if (ImagePixelizer.getPresets()[style]) {
        // Use preset
        config = ImagePixelizer.getPresets()[style];
      } else {
        // Default config with user overrides
        config = {
          pixelDensity,
          enableEdgeDetection,
          edgeThreshold,
          contrastBoost,
          posterization,
          enableOutlines,
          outlineColor,
          palette,
          maxColors,
          smoothing,
        };
      }

      // Override individual values if provided
      if (pixelDensity !== 32) config.pixelDensity = pixelDensity;
      if (edgeThreshold !== 30) config.edgeThreshold = edgeThreshold;
      if (contrastBoost !== 1.2) config.contrastBoost = contrastBoost;
      if (posterization !== 4) config.posterization = posterization;
      if (maxColors !== 16) config.maxColors = maxColors;
      if (smoothing !== 1) config.smoothing = smoothing;
      if (saturation !== 1.0) config.saturation = saturation;
      if (outlineThickness !== 1) config.outlineThickness = outlineThickness;
      if (palette !== 'AUTO') config.palette = palette;
      if (preBlur !== 0.6) config.preBlur = preBlur;
      if (!medianFilter) config.medianFilter = false;
      if (!cleanIsolated) config.cleanIsolated = false;

      // Pixelize the image
      const pixelCanvas = await ImagePixelizer.fromFile(imagePath, config);

      // Optionally upscale by creating new canvas with increased scale
      let finalCanvas = pixelCanvas;
      if (upscale > 1 && upscale <= 8) {
        const scaledCanvas = new PixelCanvas(pixelCanvas.width, pixelCanvas.height, upscale);
        // Copy pixels to upscaled canvas (Canvas library handles rendering at new scale)
        for (let y = 0; y < pixelCanvas.height; y++) {
          for (let x = 0; x < pixelCanvas.width; x++) {
            const pixel = pixelCanvas.getPixel(x, y);
            scaledCanvas.setPixel(x, y, pixel.r, pixel.g, pixel.b, pixel.a);
          }
        }
        finalCanvas = scaledCanvas;
      }

      return {
        id: `asset_${uuidv4().split('-')[0]}`,
        type: 'photo-pixelized',
        imagePath,
        pixelDensity: config.pixelDensity,
        style: typeof style === 'string' ? style : 'custom',
        enableEdgeDetection: config.enableEdgeDetection,
        palette: config.palette,
        upscale,
        canvas: finalCanvas,
        generationTimeMs: Date.now() - start,
      };
    } catch (error) {
      throw new Error(`Failed to generate from photo: ${error.message}`);
    }
  }
}

module.exports = AssetGenerator;
