const { createCanvas } = require('canvas');
const { PNG } = require('pngjs');

class PixelCanvas {
  /**
   * @param {number} width - Logical width in pixels
   * @param {number} height - Logical height in pixels
   * @param {number} scale - Upscale factor for crisp output
   */
  constructor(width, height, scale = 1) {
    this.width = width;
    this.height = height;
    this.scale = scale;
    this.pixels = new Uint8ClampedArray(width * height * 4);
  }

  _index(x, y) {
    return (y * this.width + x) * 4;
  }

  setPixel(x, y, r, g, b, a = 255) {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return;
    const i = this._index(x, y);
    this.pixels[i] = r;
    this.pixels[i + 1] = g;
    this.pixels[i + 2] = b;
    this.pixels[i + 3] = a;
  }

  getPixel(x, y) {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
      return { r: 0, g: 0, b: 0, a: 0 };
    }
    const i = this._index(x, y);
    return {
      r: this.pixels[i],
      g: this.pixels[i + 1],
      b: this.pixels[i + 2],
      a: this.pixels[i + 3],
    };
  }

  fill(r, g, b, a = 255) {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        this.setPixel(x, y, r, g, b, a);
      }
    }
  }

  clear() {
    this.pixels.fill(0);
  }

  drawSprite(sprite, offsetX, offsetY) {
    for (let y = 0; y < sprite.height; y++) {
      for (let x = 0; x < sprite.width; x++) {
        const p = sprite.getPixel(x, y);
        if (p.a > 0) {
          this.setPixel(offsetX + x, offsetY + y, p.r, p.g, p.b, p.a);
        }
      }
    }
  }

  applyPalette(palette) {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const p = this.getPixel(x, y);
        if (p.a === 0) continue;
        const nearest = palette.findNearest(p.r, p.g, p.b);
        this.setPixel(x, y, nearest.r, nearest.g, nearest.b, p.a);
      }
    }
  }

  addOutline(r, g, b, thickness = 1) {
    const outline = [];
    const dirs = [
      [-1, 0], [1, 0], [0, -1], [0, 1],
      [-1, -1], [1, -1], [-1, 1], [1, 1],
    ];

    for (let t = 0; t < thickness; t++) {
      for (let y = 0; y < this.height; y++) {
        for (let x = 0; x < this.width; x++) {
          const p = this.getPixel(x, y);
          if (p.a > 0) continue;
          for (const [dx, dy] of dirs) {
            const nx = x + dx;
            const ny = y + dy;
            const np = this.getPixel(nx, ny);
            if (np.a > 0) {
              outline.push({ x, y });
              break;
            }
          }
        }
      }
    }

    for (const { x, y } of outline) {
      this.setPixel(x, y, r, g, b, 255);
    }
  }

  addShadow(direction = 'bottom', offset = 1, r = 0, g = 0, b = 0, shadowAlpha = 128) {
    const dx = direction === 'right' ? offset : direction === 'left' ? -offset : 0;
    const dy = direction === 'bottom' ? offset : direction === 'top' ? -offset : 0;

    const shadow = [];
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const p = this.getPixel(x, y);
        if (p.a > 0) {
          const sx = x + dx;
          const sy = y + dy;
          const sp = this.getPixel(sx, sy);
          if (sp.a === 0) {
            shadow.push({ x: sx, y: sy });
          }
        }
      }
    }

    for (const { x, y } of shadow) {
      this.setPixel(x, y, r, g, b, shadowAlpha);
    }
  }

  clone() {
    const copy = new PixelCanvas(this.width, this.height, this.scale);
    copy.pixels.set(this.pixels);
    return copy;
  }

  toBuffer() {
    const outW = this.width * this.scale;
    const outH = this.height * this.scale;
    const png = new PNG({ width: outW, height: outH });

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

  toDataURL() {
    const buf = this.toBuffer();
    return `data:image/png;base64,${buf.toString('base64')}`;
  }
}

module.exports = PixelCanvas;
