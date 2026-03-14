#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const AssetGenerator = require('./AssetGenerator');
const ExportService = require('./export/ExportService');
const ImagePixelizer = require('./generation/ImagePixelizer');

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    }
  }
  return args;
}

function printUsage() {
  console.log(`
Pixel Asset Generator CLI v0.6.0

Usage:
  pixel-gen --type <type> [options]

Types:
  character    Generate a character sprite sheet
  tileset      Generate a tileset
  effect       Generate a particle effect
  photo        Convert a photo to pixel art

Common Options:
  --type         Asset type: character | tileset | effect | photo
  --width        Pixel width (default: 16)
  --height       Pixel height (default: 16)
  --scale        Upscale factor (default: 4)
  --palette      Palette name: pico8 | endesga32 | nes | gameboy (default: pico8)
  --seed         Random seed (default: random)
  --output       Output directory (default: ./output)
  --format       Export format: png | gif | phaser | godot4 | unity (default: png)
  --animations   Comma-separated list: idle,walk,attack_slash (character only)

Tileset Options:
  --biome        Biome: dungeon | grass | snow | desert (default: dungeon)
  --tileSize     Tile size in pixels (default: 16)
  --variants     Comma-separated: base,edge,corner,decoration

Effect Options:
  --effect       Effect type: fire | water | magic | explosion
  --frames       Number of frames (default: 6)
  --colors       Comma-separated hex colors (for custom palette)

Photo-to-Pixel Options:
  --image        Path to image file (required for photo type)
  --style        Style preset: cartoon | highRes | lowRes | minimal (default: cartoon)
  --pixelDensity Pixel width (8-256, default: 32)
  --palette      Color palette (default: AUTO)
  --maxColors    Max colors (4-32, default: 16)
  --edges        Enable edge detection: true | false (default: true)
  --outlines     Enable outlines: true | false (default: true)
  --contrast     Contrast boost multiplier (1.0-2.0, default: 1.2)
  --posterize    Posterization levels (2-8, default: 4)
  --smooth       Smoothing intensity (0-2, default: 1)
  --upscale      Upscale factor after pixelization (1-8, default: 1)

Examples:
  pixel-gen --type character --width 16 --height 16 --palette pico8 --animations idle,walk
  pixel-gen --type tileset --biome dungeon --tileSize 16 --palette endesga32
  pixel-gen --type effect --effect fire --frames 8 --colors "#ff4400,#ff8800,#ffcc00"
  pixel-gen --type photo --image ./myface.jpg --style cartoon --pixelDensity 32 --palette PICO-8
`);
}

async function main() {
  const args = parseArgs(process.argv);

  if (args.help || !args.type) {
    printUsage();
    process.exit(args.help ? 0 : 1);
  }

  const outputDir = args.output || './output';
  const format = args.format || 'png';
  const seed = args.seed ? parseInt(args.seed, 10) : Date.now();

  let result;

  switch (args.type) {
    case 'character': {
      const animations = args.animations ? args.animations.split(',') : ['idle'];
      result = AssetGenerator.generateSprite({
        type: 'character',
        width: parseInt(args.width, 10) || 16,
        height: parseInt(args.height, 10) || 16,
        scale: parseInt(args.scale, 10) || 4,
        palette: args.palette || 'pico8',
        symmetry: args.symmetry || 'horizontal',
        animations,
        seed,
        options: {
          outline: args.outline !== 'false',
          shading: args.shading || 'directional',
          dithering: args.dithering || null,
        },
      });
      break;
    }
    case 'tileset': {
      const variants = args.variants ? args.variants.split(',') : ['base'];
      result = AssetGenerator.generateTileset({
        biome: args.biome || 'dungeon',
        tileSize: parseInt(args.tileSize, 10) || 16,
        scale: parseInt(args.scale, 10) || 2,
        palette: args.palette || 'endesga32',
        variants,
        seed,
      });
      break;
    }
    case 'effect': {
      const colors = args.colors ? args.colors.split(',').map(c => c.trim()) : undefined;
      result = AssetGenerator.generateEffect({
        effect: args.effect || 'fire',
        width: parseInt(args.width, 10) || 16,
        height: parseInt(args.height, 10) || 16,
        frames: parseInt(args.frames, 10) || 6,
        scale: parseInt(args.scale, 10) || 4,
        palette: colors ? 'custom' : (args.palette || 'pico8'),
        colors,
        seed,
      });
      break;
    }
    case 'photo': {
      if (!args.image) {
        console.error('Error: --image path is required for photo type');
        process.exit(1);
      }

      if (!fs.existsSync(args.image)) {
        console.error(`Error: Image file not found: ${args.image}`);
        process.exit(1);
      }

      result = await AssetGenerator.generateFromPhoto({
        imagePath: args.image,
        pixelDensity: parseInt(args.pixelDensity) || 32,
        palette: args.palette || 'AUTO',
        style: args.style || 'cartoon',
        enableEdgeDetection: args.edges !== 'false',
        edgeThreshold: parseInt(args.edgeThreshold) || 30,
        contrastBoost: parseFloat(args.contrast) || 1.2,
        posterization: parseInt(args.posterize) || 4,
        enableOutlines: args.outlines !== 'false',
        outlineColor: args.outlineColor || 'black',
        maxColors: parseInt(args.maxColors) || 16,
        smoothing: parseInt(args.smooth) || 1,
        upscale: parseInt(args.upscale) || 1,
      });
      break;
    }
    default:
      console.error(`Unknown type: ${args.type}`);
      printUsage();
      process.exit(1);
  }

  console.log(`Generated ${result.type} (${result.generationTimeMs}ms)`);
  console.log(`  ID: ${result.id}`);
  
  if (result.type === 'photo-pixelized') {
    // Special handling for photo-to-pixel (single image, no sprite sheet)
    console.log(`  Style: ${result.style}`);
    console.log(`  Pixel Density: ${result.pixelDensity}px`);
    console.log(`  Upscale: ${result.upscale}x`);

    // Create output directory
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const baseName = `photo_${result.id.split('_')[1]}`;

    // Always export as PNG for photos
    const pngPath = path.join(outputDir, `${baseName}.png`);
    const pngBuffer = result.canvas.toBuffer();
    fs.writeFileSync(pngPath, pngBuffer);
    console.log(`  Exported PNG: ${pngPath}`);

    // Optionally export as GIF if requested
    if (format === 'gif') {
      const gifPath = path.join(outputDir, `${baseName}.gif`);
      await ExportService.exportGIF([result.canvas], gifPath, { fps: 8 });
      console.log(`  Exported GIF: ${gifPath}`);
    }
  } else {
    // Existing sprite sheet handling
    console.log(`  Frames: ${result.frames.length}`);

    // Export
    const baseName = `${result.type}_${result.id.split('_')[1]}`;

    switch (format) {
      case 'png': {
        const paths = ExportService.exportPhaserAtlas(result.canvas, result.metadata, outputDir, baseName);
        console.log(`  Exported PNG: ${paths.pngPath}`);
        console.log(`  Exported JSON: ${paths.jsonPath}`);
        break;
      }
      case 'gif': {
        const gifPath = path.join(outputDir, `${baseName}.gif`);
        await ExportService.exportGIF(result.frames, gifPath, { fps: 8 });
        console.log(`  Exported GIF: ${gifPath}`);
        break;
      }
      case 'phaser': {
        const paths = ExportService.exportPhaserAtlas(result.canvas, result.metadata, outputDir, baseName);
        console.log(`  Exported Phaser atlas: ${paths.pngPath}, ${paths.jsonPath}`);
        break;
      }
      case 'godot4': {
        const paths = ExportService.exportGodot4(result.frames, result.metadata, outputDir, baseName);
        console.log(`  Exported Godot 4: ${paths.tresPath}`);
        break;
      }
      case 'unity': {
        const paths = ExportService.exportFramePNGs(result.frames, outputDir, baseName);
        console.log(`  Exported ${paths.length} frame PNGs to ${outputDir}`);
        break;
      }
      default:
        console.error(`Unknown format: ${format}`);
    }
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
