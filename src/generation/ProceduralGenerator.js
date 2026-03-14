const PixelCanvas = require('../canvas/PixelCanvas');
const { SeededNoise, mulberry32 } = require('./noise');
const { PaletteManager } = require('../palette/PaletteManager');

const BAYER_4X4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

const paletteManager = new PaletteManager();

class ProceduralGenerator {
  constructor(seed = Date.now()) {
    this.seed = seed;
    this.noise = new SeededNoise(seed);
    this.rng = mulberry32(seed);
  }

  generateCharacter(width, height, options = {}) {
    const {
      paletteId = 'pico8',
      symmetry = 'horizontal',
      outline = true,
      outlineColor = { r: 0, g: 0, b: 0 },
      shading = 'directional',
      dithering = null,
    } = options;

    const canvas = new PixelCanvas(width, height, options.scale || 1);
    const palette = paletteManager.get(paletteId) || paletteManager.get('pico8');

    // Step 1: Generate body mask with symmetric noise
    const mask = this._generateSymmetricMask(width, height, symmetry);

    // Step 2: Color regions
    this._colorRegions(canvas, mask, width, height, palette);

    // Step 3: Shading pass
    if (shading === 'directional') {
      this._applyDirectionalShading(canvas, mask, width, height, palette);
    }

    // Step 4: Dithering
    if (dithering === 'bayer') {
      this._applyBayerDithering(canvas, width, height);
    }

    // Step 5: Outline
    if (outline) {
      canvas.addOutline(outlineColor.r, outlineColor.g, outlineColor.b);
    }

    return canvas;
  }

  generateTileset(tileSize, options = {}) {
    const {
      biome = 'dungeon',
      paletteId = 'endesga32',
      variants = ['base'],
    } = options;

    const palette = paletteManager.get(paletteId) || paletteManager.get('endesga32');
    const tiles = [];

    const biomeColors = this._getBiomeColors(biome, palette);

    for (const variant of variants) {
      switch (variant) {
        case 'base':
          tiles.push({ name: `${biome}_base`, canvas: this._generateBaseTile(tileSize, biomeColors, options) });
          break;
        case 'edge':
          for (const dir of ['n', 'e', 's', 'w']) {
            tiles.push({ name: `${biome}_edge_${dir}`, canvas: this._generateEdgeTile(tileSize, biomeColors, dir, options) });
          }
          break;
        case 'corner':
          for (const dir of ['ne', 'se', 'sw', 'nw']) {
            tiles.push({ name: `${biome}_corner_${dir}`, canvas: this._generateCornerTile(tileSize, biomeColors, dir, options) });
          }
          break;
        case 'inner_corner':
          for (const dir of ['ne', 'se', 'sw', 'nw']) {
            tiles.push({ name: `${biome}_inner_${dir}`, canvas: this._generateInnerCornerTile(tileSize, biomeColors, dir, options) });
          }
          break;
        case 'decoration':
          for (let i = 0; i < 4; i++) {
            tiles.push({ name: `${biome}_deco_${i}`, canvas: this._generateDecoTile(tileSize, biomeColors, i, options) });
          }
          break;
      }
    }

    return tiles;
  }

  generateEffect(effectType, width, height, frameCount, options = {}) {
    const { colors = [], paletteId = 'pico8' } = options;
    const palette = colors.length > 0
      ? { colors: colors.map(c => typeof c === 'string' ? require('../palette/PaletteManager').hexToRgb(c) : c) }
      : paletteManager.get(paletteId);

    const effectColors = palette.colors || palette.colors;
    const frames = [];

    for (let f = 0; f < frameCount; f++) {
      const canvas = new PixelCanvas(width, height, options.scale || 1);
      const t = f / frameCount;

      switch (effectType) {
        case 'fire':
          this._drawFireFrame(canvas, width, height, t, effectColors, f);
          break;
        case 'water':
          this._drawWaterFrame(canvas, width, height, t, effectColors, f);
          break;
        case 'magic':
          this._drawMagicFrame(canvas, width, height, t, effectColors, f);
          break;
        case 'explosion':
          this._drawExplosionFrame(canvas, width, height, t, effectColors, f);
          break;
        default:
          this._drawFireFrame(canvas, width, height, t, effectColors, f);
      }

      frames.push(canvas);
    }

    return frames;
  }

  _generateSymmetricMask(width, height, symmetry) {
    const mask = Array.from({ length: height }, () => new Array(width).fill(false));
    const freq = 0.25;
    const halfW = Math.ceil(width / 2);

    // Vertical gradient: encourage humanoid silhouette
    for (let y = 0; y < height; y++) {
      const yNorm = y / height;
      // Narrower at top (head), wider in middle (torso), narrower at bottom (legs)
      let widthMod;
      if (yNorm < 0.25) widthMod = 0.55; // head
      else if (yNorm < 0.55) widthMod = 0.75; // torso
      else widthMod = 0.5; // legs

      for (let x = 0; x < halfW; x++) {
        const xNorm = x / halfW;
        const threshold = widthMod - xNorm * 0.5;
        const n = (this.noise.noise2D(x * freq, y * freq + this.seed) + 1) / 2;

        if (n > (1 - threshold)) {
          mask[y][x] = true;
          if (symmetry === 'horizontal' || symmetry === '4-way') {
            mask[y][width - 1 - x] = true;
          }
        }
      }
    }

    if (symmetry === 'vertical' || symmetry === '4-way') {
      const halfH = Math.ceil(height / 2);
      for (let y = 0; y < halfH; y++) {
        for (let x = 0; x < width; x++) {
          if (mask[y][x]) {
            mask[height - 1 - y][x] = true;
          }
        }
      }
    }

    return mask;
  }

  _colorRegions(canvas, mask, width, height, palette) {
    const headColor = palette.getColor(Math.floor(this.rng() * palette.count));
    const bodyColor = palette.getColor(Math.floor(this.rng() * palette.count));
    const legColor = palette.getColor(Math.floor(this.rng() * palette.count));
    const eyeColor = palette.getColor(Math.floor(this.rng() * palette.count));

    for (let y = 0; y < height; y++) {
      const yNorm = y / height;
      for (let x = 0; x < width; x++) {
        if (!mask[y][x]) continue;

        let color;
        if (yNorm < 0.25) color = headColor;
        else if (yNorm < 0.55) color = bodyColor;
        else color = legColor;

        canvas.setPixel(x, y, color.r, color.g, color.b);
      }
    }

    // Add eyes in head region
    const headHeight = Math.floor(height * 0.25);
    const eyeY = Math.floor(headHeight * 0.5);
    const centerX = Math.floor(width / 2);
    if (eyeY < height && eyeY >= 0) {
      const eyeOffX = Math.max(1, Math.floor(width * 0.15));
      if (mask[eyeY] && mask[eyeY][centerX - eyeOffX]) {
        canvas.setPixel(centerX - eyeOffX, eyeY, eyeColor.r, eyeColor.g, eyeColor.b);
      }
      if (mask[eyeY] && mask[eyeY][centerX + eyeOffX - 1]) {
        canvas.setPixel(centerX + eyeOffX - 1, eyeY, eyeColor.r, eyeColor.g, eyeColor.b);
      }
    }
  }

  _applyDirectionalShading(canvas, mask, width, height, palette) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (!mask[y][x]) continue;
        const p = canvas.getPixel(x, y);
        if (p.a === 0) continue;

        // Count filled neighbors above
        let neighborsAbove = 0;
        if (y > 0) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            if (nx >= 0 && nx < width && mask[y - 1][nx]) neighborsAbove++;
          }
        }

        let shade;
        if (neighborsAbove === 0) {
          shade = 40; // highlight
        } else if (y < height * 0.33) {
          shade = 20; // mid-light
        } else if (y < height * 0.66) {
          shade = 0; // base
        } else {
          shade = -30; // shadow
        }

        canvas.setPixel(
          x, y,
          Math.min(255, Math.max(0, p.r + shade)),
          Math.min(255, Math.max(0, p.g + shade)),
          Math.min(255, Math.max(0, p.b + shade)),
          p.a
        );
      }
    }
  }

  _applyBayerDithering(canvas, width, height) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const p = canvas.getPixel(x, y);
        if (p.a === 0) continue;

        const gray = (p.r + p.g + p.b) / (3 * 255);
        const threshold = BAYER_4X4[y % 4][x % 4] / 16;
        const factor = gray > threshold ? 1.15 : 0.85;

        canvas.setPixel(
          x, y,
          Math.min(255, Math.round(p.r * factor)),
          Math.min(255, Math.round(p.g * factor)),
          Math.min(255, Math.round(p.b * factor)),
          p.a
        );
      }
    }
  }

  _getBiomeColors(biome, palette) {
    const colorSets = {
      dungeon: { base: [6, 22, 23], accent: [20, 28], detail: [27, 30] },
      grass: { base: [12, 13, 14], accent: [11, 10], detail: [13, 3] },
      snow: { base: [25, 19, 20], accent: [17, 18], detail: [20, 21] },
      desert: { base: [3, 4, 1], accent: [9, 10], detail: [5, 28] },
    };
    const set = colorSets[biome] || colorSets.dungeon;
    return {
      base: set.base.map(i => palette.getColor(i)),
      accent: set.accent.map(i => palette.getColor(i)),
      detail: set.detail.map(i => palette.getColor(i)),
    };
  }

  _generateBaseTile(size, colors, options) {
    const canvas = new PixelCanvas(size, size, options.scale || 1);
    const baseColor = colors.base[0];

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const n = (this.noise.noise2D(x * 0.3, y * 0.3 + this.seed * 100) + 1) / 2;
        let color;
        if (n < 0.4) color = colors.base[0];
        else if (n < 0.7) color = colors.base[1] || colors.base[0];
        else color = colors.base[2] || colors.base[0];

        // Add random detail specks
        if (this.rng() > 0.92) {
          color = colors.detail[Math.floor(this.rng() * colors.detail.length)];
        }
        canvas.setPixel(x, y, color.r, color.g, color.b);
      }
    }
    return canvas;
  }

  _generateEdgeTile(size, colors, dir, options) {
    const canvas = this._generateBaseTile(size, colors, options);
    const edgeColor = colors.accent[0];
    const edgeWidth = Math.max(2, Math.floor(size * 0.2));

    for (let i = 0; i < edgeWidth; i++) {
      for (let j = 0; j < size; j++) {
        const fade = 1 - i / edgeWidth;
        if (this.rng() < fade) {
          let x, y;
          switch (dir) {
            case 'n': x = j; y = i; break;
            case 's': x = j; y = size - 1 - i; break;
            case 'w': x = i; y = j; break;
            case 'e': x = size - 1 - i; y = j; break;
          }
          canvas.setPixel(x, y, edgeColor.r, edgeColor.g, edgeColor.b);
        }
      }
    }
    return canvas;
  }

  _generateCornerTile(size, colors, dir, options) {
    const canvas = this._generateBaseTile(size, colors, options);
    const edgeColor = colors.accent[0];
    const edgeWidth = Math.max(2, Math.floor(size * 0.2));

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        let dx, dy;
        switch (dir) {
          case 'nw': dx = x; dy = y; break;
          case 'ne': dx = size - 1 - x; dy = y; break;
          case 'sw': dx = x; dy = size - 1 - y; break;
          case 'se': dx = size - 1 - x; dy = size - 1 - y; break;
        }
        if (dx < edgeWidth && dy < edgeWidth && this.rng() < 0.7) {
          canvas.setPixel(x, y, edgeColor.r, edgeColor.g, edgeColor.b);
        }
      }
    }
    return canvas;
  }

  _generateInnerCornerTile(size, colors, dir, options) {
    const canvas = this._generateBaseTile(size, colors, options);
    const edgeColor = colors.accent[1] || colors.accent[0];
    const radius = Math.floor(size * 0.35);

    let cx, cy;
    switch (dir) {
      case 'nw': cx = 0; cy = 0; break;
      case 'ne': cx = size - 1; cy = 0; break;
      case 'sw': cx = 0; cy = size - 1; break;
      case 'se': cx = size - 1; cy = size - 1; break;
    }

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
        if (dist < radius && this.rng() < 0.6) {
          canvas.setPixel(x, y, edgeColor.r, edgeColor.g, edgeColor.b);
        }
      }
    }
    return canvas;
  }

  _generateDecoTile(size, colors, index, options) {
    const canvas = this._generateBaseTile(size, colors, options);
    const decoColor = colors.detail[index % colors.detail.length];
    const numDetails = 2 + Math.floor(this.rng() * 4);

    for (let i = 0; i < numDetails; i++) {
      const x = Math.floor(this.rng() * (size - 2)) + 1;
      const y = Math.floor(this.rng() * (size - 2)) + 1;
      canvas.setPixel(x, y, decoColor.r, decoColor.g, decoColor.b);
      if (this.rng() > 0.5) canvas.setPixel(x + 1, y, decoColor.r, decoColor.g, decoColor.b);
      if (this.rng() > 0.5) canvas.setPixel(x, y + 1, decoColor.r, decoColor.g, decoColor.b);
    }
    return canvas;
  }

  _drawFireFrame(canvas, width, height, t, colors, frameIndex) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const yNorm = y / height;
        const xCenter = Math.abs(x - width / 2) / (width / 2);
        const n = (this.noise.noise2D(x * 0.4, y * 0.4 + frameIndex * 2 + this.seed) + 1) / 2;

        const intensity = (1 - yNorm) * (1 - xCenter * 0.7) * n;
        if (intensity > 0.2) {
          const ci = Math.min(colors.length - 1, Math.floor(intensity * colors.length));
          const c = colors[ci];
          canvas.setPixel(x, y, c.r, c.g, c.b);
        }
      }
    }
  }

  _drawWaterFrame(canvas, width, height, t, colors, frameIndex) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const n = (this.noise.noise2D(x * 0.3 + frameIndex * 0.5, y * 0.3 + this.seed) + 1) / 2;
        const ci = Math.min(colors.length - 1, Math.floor(n * colors.length));
        const c = colors[ci];
        if (n > 0.3) {
          canvas.setPixel(x, y, c.r, c.g, c.b);
        }
      }
    }
  }

  _drawMagicFrame(canvas, width, height, t, colors, frameIndex) {
    const cx = width / 2;
    const cy = height / 2;
    const maxR = Math.min(width, height) / 2;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const dx = x - cx;
        const dy = y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx) + frameIndex * 0.8;
        const n = (this.noise.noise2D(angle * 2, dist * 0.3 + this.seed) + 1) / 2;

        if (dist < maxR * (0.5 + n * 0.5)) {
          const ci = Math.min(colors.length - 1, Math.floor(n * colors.length));
          const c = colors[ci];
          canvas.setPixel(x, y, c.r, c.g, c.b);
        }
      }
    }
  }

  _drawExplosionFrame(canvas, width, height, t, colors, frameIndex) {
    const cx = width / 2;
    const cy = height / 2;
    const maxR = Math.min(width, height) / 2;
    const radius = maxR * t;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
        if (dist < radius + 2 && dist > radius - 3) {
          const n = (this.noise.noise2D(x * 0.5 + this.seed, y * 0.5) + 1) / 2;
          const ci = Math.min(colors.length - 1, Math.floor(n * colors.length));
          const c = colors[ci];
          canvas.setPixel(x, y, c.r, c.g, c.b);
        } else if (dist < radius * 0.6) {
          const n = (this.noise.noise2D(x * 0.3, y * 0.3 + this.seed) + 1) / 2;
          if (n > 0.4 + t * 0.4) {
            const ci = Math.min(colors.length - 1, Math.floor(n * colors.length));
            const c = colors[ci];
            canvas.setPixel(x, y, c.r, c.g, c.b);
          }
        }
      }
    }
  }

  generateAnimationFrames(baseCanvas, animationType, frameCount, options = {}) {
    const frames = [];

    switch (animationType) {
      case 'idle':
        frames.push(...this._generateIdleFrames(baseCanvas, frameCount));
        break;
      case 'walk':
        frames.push(...this._generateWalkFrames(baseCanvas, frameCount));
        break;
      case 'run':
        frames.push(...this._generateRunFrames(baseCanvas, frameCount));
        break;
      case 'jump':
        frames.push(...this._generateJumpFrames(baseCanvas, frameCount));
        break;
      case 'attack_slash':
        frames.push(...this._generateAttackFrames(baseCanvas, frameCount));
        break;
      case 'hurt':
        frames.push(...this._generateHurtFrames(baseCanvas, frameCount));
        break;
      case 'death':
        frames.push(...this._generateDeathFrames(baseCanvas, frameCount));
        break;
      default:
        for (let i = 0; i < frameCount; i++) frames.push(baseCanvas.clone());
    }

    return frames;
  }

  _generateIdleFrames(base, count) {
    const frames = [];
    const fc = Math.max(2, count);
    for (let i = 0; i < fc; i++) {
      const frame = base.clone();
      // Subtle vertical shift for breathing
      const shift = i % 2 === 0 ? 0 : 1;
      if (shift > 0) {
        const temp = new PixelCanvas(base.width, base.height, base.scale);
        for (let y = 0; y < base.height; y++) {
          for (let x = 0; x < base.width; x++) {
            const py = y - shift;
            if (py >= 0 && py < base.height) {
              const p = base.getPixel(x, py);
              temp.setPixel(x, y, p.r, p.g, p.b, p.a);
            }
          }
        }
        frames.push(temp);
      } else {
        frames.push(frame);
      }
    }
    return frames;
  }

  _generateWalkFrames(base, count) {
    const frames = [];
    const fc = Math.max(4, count);
    for (let i = 0; i < fc; i++) {
      const frame = new PixelCanvas(base.width, base.height, base.scale);
      const phase = (i / fc) * Math.PI * 2;
      const legShift = Math.round(Math.sin(phase));
      const bounceY = Math.abs(Math.round(Math.sin(phase) * 0.5));

      for (let y = 0; y < base.height; y++) {
        for (let x = 0; x < base.width; x++) {
          const yNorm = y / base.height;
          let srcX = x;
          let srcY = y - bounceY;

          // Leg animation: shift lower body horizontally
          if (yNorm > 0.6) {
            srcX = x - legShift;
          }

          if (srcX >= 0 && srcX < base.width && srcY >= 0 && srcY < base.height) {
            const p = base.getPixel(srcX, srcY);
            if (p.a > 0) frame.setPixel(x, y, p.r, p.g, p.b, p.a);
          }
        }
      }
      frames.push(frame);
    }
    return frames;
  }

  _generateRunFrames(base, count) {
    const frames = [];
    const fc = Math.max(4, count);
    for (let i = 0; i < fc; i++) {
      const frame = new PixelCanvas(base.width, base.height, base.scale);
      const phase = (i / fc) * Math.PI * 2;
      const lean = Math.round(Math.sin(phase) * 1.5);
      const bounceY = Math.abs(Math.round(Math.sin(phase)));

      for (let y = 0; y < base.height; y++) {
        for (let x = 0; x < base.width; x++) {
          const yNorm = y / base.height;
          let srcX = x;
          let srcY = y - bounceY;

          if (yNorm > 0.5) {
            srcX = x - lean;
          }

          if (srcX >= 0 && srcX < base.width && srcY >= 0 && srcY < base.height) {
            const p = base.getPixel(srcX, srcY);
            if (p.a > 0) frame.setPixel(x, y, p.r, p.g, p.b, p.a);
          }
        }
      }
      frames.push(frame);
    }
    return frames;
  }

  _generateJumpFrames(base, count) {
    const fc = Math.max(3, count);
    const frames = [];
    const jumpPhases = [0.3, 0.7, 0.3]; // rise, peak, fall offsets
    for (let i = 0; i < fc; i++) {
      const frame = new PixelCanvas(base.width, base.height, base.scale);
      const phaseIdx = Math.floor((i / fc) * 3);
      const yOffset = Math.round(jumpPhases[Math.min(phaseIdx, 2)] * -3);

      for (let y = 0; y < base.height; y++) {
        for (let x = 0; x < base.width; x++) {
          const srcY = y - yOffset;
          if (srcY >= 0 && srcY < base.height) {
            const p = base.getPixel(x, srcY);
            if (p.a > 0) frame.setPixel(x, y, p.r, p.g, p.b, p.a);
          }
        }
      }
      frames.push(frame);
    }
    return frames;
  }

  _generateAttackFrames(base, count) {
    const fc = Math.max(4, count);
    const frames = [];
    for (let i = 0; i < fc; i++) {
      const frame = base.clone();
      // Add a weapon swing effect
      const phase = (i / fc) * Math.PI;
      const swingX = Math.round(Math.cos(phase) * 3);
      const swingY = Math.round(Math.sin(phase) * 2);
      const p = frame.getPixel(Math.floor(base.width / 2), Math.floor(base.height * 0.4));
      if (p.a > 0) {
        const wx = Math.floor(base.width / 2) + swingX + 2;
        const wy = Math.floor(base.height * 0.4) + swingY;
        for (let l = 0; l < 3; l++) {
          frame.setPixel(wx + l, wy, 200, 200, 220);
        }
      }
      frames.push(frame);
    }
    return frames;
  }

  _generateHurtFrames(base, count) {
    const fc = Math.max(2, count);
    const frames = [];
    for (let i = 0; i < fc; i++) {
      const frame = base.clone();
      if (i % 2 === 1) {
        // Flash: brighten all pixels
        for (let y = 0; y < base.height; y++) {
          for (let x = 0; x < base.width; x++) {
            const p = frame.getPixel(x, y);
            if (p.a > 0) {
              frame.setPixel(x, y,
                Math.min(255, p.r + 100),
                Math.min(255, p.g + 100),
                Math.min(255, p.b + 100),
                p.a
              );
            }
          }
        }
      }
      // Recoil: shift slightly
      if (i === 1) {
        const shifted = new PixelCanvas(base.width, base.height, base.scale);
        for (let y = 0; y < base.height; y++) {
          for (let x = 0; x < base.width; x++) {
            const srcX = x - 1;
            if (srcX >= 0) {
              const p = frame.getPixel(srcX, y);
              if (p.a > 0) shifted.setPixel(x, y, p.r, p.g, p.b, p.a);
            }
          }
        }
        frames.push(shifted);
      } else {
        frames.push(frame);
      }
    }
    return frames;
  }

  _generateDeathFrames(base, count) {
    const fc = Math.max(5, count);
    const frames = [];
    for (let i = 0; i < fc; i++) {
      const frame = new PixelCanvas(base.width, base.height, base.scale);
      const fallProgress = i / (fc - 1);
      const alpha = Math.round(255 * (1 - fallProgress * 0.6));
      const yShift = Math.round(fallProgress * 3);

      for (let y = 0; y < base.height; y++) {
        for (let x = 0; x < base.width; x++) {
          const srcY = y - yShift;
          if (srcY >= 0 && srcY < base.height) {
            const p = base.getPixel(x, srcY);
            if (p.a > 0) {
              frame.setPixel(x, y, p.r, p.g, p.b, Math.min(p.a, alpha));
            }
          }
        }
      }
      frames.push(frame);
    }
    return frames;
  }
}

module.exports = ProceduralGenerator;
