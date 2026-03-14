const PALETTES = {
  gameboy: {
    name: 'Game Boy',
    colors: [
      { r: 15, g: 56, b: 15 },
      { r: 48, g: 98, b: 48 },
      { r: 139, g: 172, b: 15 },
      { r: 155, g: 188, b: 15 },
    ],
  },
  pico8: {
    name: 'PICO-8',
    colors: [
      { r: 0, g: 0, b: 0 },
      { r: 29, g: 43, b: 83 },
      { r: 126, g: 37, b: 83 },
      { r: 0, g: 135, b: 81 },
      { r: 171, g: 82, b: 54 },
      { r: 95, g: 87, b: 79 },
      { r: 194, g: 195, b: 199 },
      { r: 255, g: 241, b: 232 },
      { r: 255, g: 0, b: 77 },
      { r: 255, g: 163, b: 0 },
      { r: 255, g: 236, b: 39 },
      { r: 0, g: 228, b: 54 },
      { r: 41, g: 173, b: 255 },
      { r: 131, g: 118, b: 156 },
      { r: 255, g: 119, b: 168 },
      { r: 255, g: 204, b: 170 },
    ],
  },
  nes: {
    name: 'NES',
    colors: [
      { r: 124, g: 124, b: 124 }, { r: 0, g: 0, b: 252 },
      { r: 0, g: 0, b: 188 },   { r: 68, g: 40, b: 188 },
      { r: 148, g: 0, b: 132 }, { r: 168, g: 0, b: 32 },
      { r: 168, g: 16, b: 0 },  { r: 136, g: 20, b: 0 },
      { r: 80, g: 48, b: 0 },   { r: 0, g: 120, b: 0 },
      { r: 0, g: 104, b: 0 },   { r: 0, g: 88, b: 0 },
      { r: 0, g: 64, b: 88 },   { r: 0, g: 0, b: 0 },
      { r: 188, g: 188, b: 188 }, { r: 0, g: 120, b: 248 },
      { r: 0, g: 88, b: 248 },  { r: 104, g: 68, b: 252 },
      { r: 216, g: 0, b: 204 }, { r: 228, g: 0, b: 88 },
      { r: 248, g: 56, b: 0 },  { r: 228, g: 92, b: 16 },
      { r: 172, g: 124, b: 0 }, { r: 0, g: 184, b: 0 },
      { r: 0, g: 168, b: 0 },   { r: 0, g: 168, b: 68 },
      { r: 0, g: 136, b: 136 }, { r: 248, g: 248, b: 248 },
      { r: 60, g: 188, b: 252 }, { r: 104, g: 136, b: 252 },
      { r: 152, g: 120, b: 248 }, { r: 248, g: 120, b: 248 },
      { r: 248, g: 88, b: 152 }, { r: 248, g: 120, b: 88 },
      { r: 252, g: 160, b: 68 }, { r: 248, g: 184, b: 0 },
      { r: 184, g: 248, b: 24 }, { r: 88, g: 216, b: 84 },
      { r: 88, g: 248, b: 152 }, { r: 0, g: 232, b: 216 },
      { r: 120, g: 120, b: 120 }, { r: 252, g: 252, b: 252 },
      { r: 164, g: 228, b: 252 }, { r: 184, g: 184, b: 248 },
      { r: 216, g: 184, b: 248 }, { r: 248, g: 184, b: 248 },
      { r: 248, g: 164, b: 192 }, { r: 240, g: 208, b: 176 },
      { r: 252, g: 224, b: 168 }, { r: 248, g: 216, b: 120 },
      { r: 216, g: 248, b: 120 }, { r: 184, g: 248, b: 184 },
      { r: 184, g: 248, b: 216 }, { r: 0, g: 252, b: 252 },
      { r: 216, g: 216, b: 216 },
    ],
  },
  endesga32: {
    name: 'ENDESGA-32',
    colors: [
      { r: 190, g: 74, b: 47 },  { r: 215, g: 118, b: 67 },
      { r: 234, g: 212, b: 170 }, { r: 228, g: 166, b: 114 },
      { r: 184, g: 111, b: 80 }, { r: 115, g: 62, b: 57 },
      { r: 62, g: 39, b: 49 },   { r: 162, g: 38, b: 51 },
      { r: 228, g: 59, b: 68 },  { r: 247, g: 118, b: 34 },
      { r: 254, g: 174, b: 52 }, { r: 254, g: 231, b: 97 },
      { r: 99, g: 199, b: 77 },  { r: 62, g: 137, b: 72 },
      { r: 38, g: 92, b: 66 },   { r: 25, g: 60, b: 62 },
      { r: 18, g: 78, b: 137 },  { r: 0, g: 153, b: 219 },
      { r: 44, g: 232, b: 245 }, { r: 192, g: 203, b: 220 },
      { r: 139, g: 155, b: 180 }, { r: 90, g: 105, b: 136 },
      { r: 58, g: 68, b: 102 },  { r: 38, g: 43, b: 68 },
      { r: 24, g: 20, b: 37 },   { r: 255, g: 255, b: 255 },
      { r: 44, g: 44, b: 44 },   { r: 117, g: 113, b: 97 },
      { r: 169, g: 161, b: 131 }, { r: 89, g: 86, b: 82 },
      { r: 55, g: 53, b: 49 },   { r: 34, g: 32, b: 32 },
    ],
  },
};

function hexToRgb(hex) {
  const clean = hex.replace(/^#/, '');
  return {
    r: parseInt(clean.substring(0, 2), 16),
    g: parseInt(clean.substring(2, 4), 16),
    b: parseInt(clean.substring(4, 6), 16),
  };
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('');
}

function colorDistance(c1, c2) {
  const dr = c1.r - c2.r;
  const dg = c1.g - c2.g;
  const db = c1.b - c2.b;
  return dr * dr + dg * dg + db * db;
}

class Palette {
  constructor(colors) {
    this.colors = colors; // Array of { r, g, b }
  }

  findNearest(r, g, b) {
    let best = this.colors[0];
    let bestDist = Infinity;
    for (const c of this.colors) {
      const d = colorDistance({ r, g, b }, c);
      if (d < bestDist) {
        bestDist = d;
        best = c;
      }
    }
    return best;
  }

  getColor(index) {
    return this.colors[index % this.colors.length];
  }

  get count() {
    return this.colors.length;
  }

  lighten(color, amount = 40) {
    return {
      r: Math.min(255, color.r + amount),
      g: Math.min(255, color.g + amount),
      b: Math.min(255, color.b + amount),
    };
  }

  darken(color, amount = 40) {
    return {
      r: Math.max(0, color.r - amount),
      g: Math.max(0, color.g - amount),
      b: Math.max(0, color.b - amount),
    };
  }
}

class PaletteManager {
  constructor() {
    this.palettes = new Map();
    for (const [id, data] of Object.entries(PALETTES)) {
      this.palettes.set(id, new Palette(data.colors));
    }
  }

  get(id) {
    return this.palettes.get(id);
  }

  list() {
    const result = [];
    for (const [id, data] of Object.entries(PALETTES)) {
      result.push({ id, name: data.name, count: data.colors.length });
    }
    for (const [id, palette] of this.palettes) {
      if (!PALETTES[id]) {
        result.push({ id, name: id, count: palette.count });
      }
    }
    return result;
  }

  createCustom(id, hexColors) {
    const colors = hexColors.map(hexToRgb);
    const palette = new Palette(colors);
    this.palettes.set(id, palette);
    return palette;
  }

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
        case 'analogous':
        default:
          h = (hsl.h - 30 + (i * 60) / (count - 1)) % 360;
          if (h < 0) h += 360;
          break;
      }
      const s = Math.max(20, Math.min(100, hsl.s + (i % 2 === 0 ? -10 : 10)));
      const l = Math.max(15, Math.min(85, 20 + (i * 60) / (count - 1)));
      const rgb = hslToRgb(h, s, l);
      colors.push(rgb);
    }

    return new Palette(colors);
  }

  swapPalette(canvas, fromPalette, toPalette) {
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const p = canvas.getPixel(x, y);
        if (p.a === 0) continue;
        const nearestFrom = fromPalette.findNearest(p.r, p.g, p.b);
        const fromIndex = fromPalette.colors.findIndex(
          c => c.r === nearestFrom.r && c.g === nearestFrom.g && c.b === nearestFrom.b
        );
        if (fromIndex >= 0) {
          const toColor = toPalette.getColor(fromIndex);
          canvas.setPixel(x, y, toColor.r, toColor.g, toColor.b, p.a);
        }
      }
    }
  }
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;

  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}

function hslToRgb(h, s, l) {
  h /= 360; s /= 100; l /= 100;
  let r, g, b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }
  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255),
  };
}

module.exports = { PaletteManager, Palette, hexToRgb, rgbToHex, PALETTES };
