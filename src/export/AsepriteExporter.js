/**
 * AsepriteExporter.js — Write Aseprite (.aseprite / .ase) binary files
 *
 * Implements the Aseprite file format spec v1.3:
 *   https://github.com/aseprite/aseprite/blob/main/docs/ase-file-specs.md
 *
 * Produces a valid .aseprite file with RGBA color mode, one layer ("Animation"),
 * one frame per PixelCanvas, compressed with zlib (standard deflate).
 *
 * Usage:
 *   const AsepriteExporter = require('./src/export/AsepriteExporter');
 *   AsepriteExporter.export(frames, outputPath, { fps: 10 });
 *
 * @param {PixelCanvas[]} frames   Array of upscaled PixelCanvas objects (all same size)
 * @param {string}        outPath  Destination .aseprite file path
 * @param {object}        opts     { fps }
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const zlib = require('zlib');

// Aseprite magic number
const ASE_MAGIC = 0xA5E0;
const FRAME_MAGIC = 0xF1FA;

// Chunk types
const CHUNK_LAYER       = 0x2004;
const CHUNK_CEL         = 0x2005;
const CHUNK_PALETTE     = 0x2019;

// Color mode
const COLOR_RGBA = 32; // 32 bits per pixel

class AsepriteExporter {

  /**
   * Export an array of PixelCanvas frames as an Aseprite file.
   * Each frame becomes a separate animation frame in the file.
   */
  static export(frames, outPath, opts = {}) {
    if (!frames || frames.length === 0) throw new Error('No frames to export');

    const fps = opts.fps || 10;
    const frameDuration = Math.round(1000 / fps);

    // All frames must be the same physical size (scaled)
    const w = frames[0].width * frames[0].scale;
    const h = frames[0].height * frames[0].scale;

    // Collect unique colors for the palette
    const palette = this._buildPalette(frames);

    // Build frame data
    const frameBuffers = [];
    for (let i = 0; i < frames.length; i++) {
      const isFirst = (i === 0);
      const fb = this._buildFrame(frames[i], w, h, frameDuration, palette, isFirst);
      frameBuffers.push(fb);
    }

    // Build file header
    const header = this._buildHeader(w, h, frames.length, palette.length);

    // Assemble file
    const totalSize = header.length + frameBuffers.reduce((s, b) => s + b.length, 0);
    const file = Buffer.alloc(totalSize);
    let offset = 0;
    header.copy(file, offset); offset += header.length;
    for (const fb of frameBuffers) {
      fb.copy(file, offset); offset += fb.length;
    }

    // Patch total file size in first 4 bytes
    file.writeUInt32LE(totalSize, 0);

    const dir = path.dirname(outPath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(outPath, file);

    return outPath;
  }

  // ── File header (128 bytes) ───────────────────────────────────────────

  static _buildHeader(w, h, numFrames, numColors) {
    const buf = Buffer.alloc(128, 0);
    let o = 0;

    buf.writeUInt32LE(0, o);        o += 4;  // file size (patched later)
    buf.writeUInt16LE(ASE_MAGIC, o); o += 2;  // magic
    buf.writeUInt16LE(numFrames, o); o += 2;  // frames
    buf.writeUInt16LE(w, o);         o += 2;  // width
    buf.writeUInt16LE(h, o);         o += 2;  // height
    buf.writeUInt16LE(COLOR_RGBA, o); o += 2; // color depth (32 = RGBA)
    buf.writeUInt32LE(1, o);         o += 4;  // flags (layer opacity valid)
    buf.writeUInt16LE(100, o);       o += 2;  // speed (ms, deprecated but set)
    buf.writeUInt32LE(0, o);         o += 4;  // 0
    buf.writeUInt32LE(0, o);         o += 4;  // 0
    buf[o] = 0;                      o += 1;  // transparent color index
    // 3 bytes ignored
    o += 3;
    buf.writeUInt16LE(Math.min(numColors, 256), o); o += 2; // number of colors
    buf[o] = 1;                      o += 1;  // pixel width (1:1 ratio)
    buf[o] = 1;                      o += 1;  // pixel height
    buf.writeInt16LE(0, o);          o += 2;  // x grid position
    buf.writeInt16LE(0, o);          o += 2;  // y grid position
    buf.writeUInt16LE(16, o);        o += 2;  // grid width
    buf.writeUInt16LE(16, o);        o += 2;  // grid height
    // rest is zero-padded (already zeroed)

    return buf;
  }

  // ── Frame ─────────────────────────────────────────────────────────────

  static _buildFrame(canvas, w, h, durationMs, palette, includeLayerAndPalette) {
    const chunks = [];

    // First frame includes layer chunk and palette chunk
    if (includeLayerAndPalette) {
      chunks.push(this._buildLayerChunk());
      chunks.push(this._buildPaletteChunk(palette));
    }

    // Cel chunk (the actual pixel data)
    chunks.push(this._buildCelChunk(canvas, w, h));

    // Frame header (16 bytes) + chunks
    const chunksSize = chunks.reduce((s, c) => s + c.length, 0);
    const frameSize = 16 + chunksSize;

    const header = Buffer.alloc(16, 0);
    let o = 0;
    header.writeUInt32LE(frameSize, o);          o += 4;  // frame size
    header.writeUInt16LE(FRAME_MAGIC, o);        o += 2;  // magic
    // Old chunk count (if < 0xFFFF use it, otherwise 0xFFFF)
    const numChunks = chunks.length;
    header.writeUInt16LE(numChunks < 0xFFFF ? numChunks : 0xFFFF, o); o += 2;
    header.writeUInt16LE(durationMs, o);         o += 2;  // duration ms
    // 2 bytes reserved
    o += 2;
    header.writeUInt32LE(numChunks, o);          o += 4;  // new chunk count

    return Buffer.concat([header, ...chunks]);
  }

  // ── Layer chunk ───────────────────────────────────────────────────────

  static _buildLayerChunk() {
    const name = 'Animation';
    const nameBytes = Buffer.from(name, 'utf8');

    // Chunk data (excluding chunk header)
    const dataSize = 2 + 2 + 2 + 2 + 2 + 1 + 2 + nameBytes.length;
    const data = Buffer.alloc(dataSize, 0);
    let o = 0;

    data.writeUInt16LE(1, o);           o += 2;  // flags (visible)
    data.writeUInt16LE(0, o);           o += 2;  // layer type (normal)
    data.writeUInt16LE(0, o);           o += 2;  // child level
    data.writeUInt16LE(0, o);           o += 2;  // default width (ignored)
    data.writeUInt16LE(0, o);           o += 2;  // default height (ignored)
    data.writeUInt16LE(0, o);           o += 2;  // blend mode (normal)
    data[o] = 255;                      o += 1;  // opacity
    // 3 bytes reserved
    o += 3;
    data.writeUInt16LE(nameBytes.length, o); o += 2;
    nameBytes.copy(data, o);

    // Wrap in chunk envelope
    return this._wrapChunk(CHUNK_LAYER, data);
  }

  // ── Palette chunk ─────────────────────────────────────────────────────

  static _buildPaletteChunk(palette) {
    const count = Math.min(palette.length, 256);

    // 4 (size) + 4 (first) + 4 (last) + 8 (reserved) + entries
    const entrySize = 2 + 1 + 1 + 1 + 1; // flags(2) + r + g + b + a = 6
    const dataSize = 4 + 4 + 4 + 8 + count * entrySize;
    const data = Buffer.alloc(dataSize, 0);
    let o = 0;

    data.writeUInt32LE(count, o);       o += 4;  // palette size
    data.writeUInt32LE(0, o);           o += 4;  // first color index
    data.writeUInt32LE(count - 1, o);   o += 4;  // last color index
    o += 8; // reserved

    for (let i = 0; i < count; i++) {
      const c = palette[i];
      data.writeUInt16LE(0, o);         o += 2;  // entry flags
      data[o++] = c.r;
      data[o++] = c.g;
      data[o++] = c.b;
      data[o++] = c.a !== undefined ? c.a : 255;
    }

    return this._wrapChunk(CHUNK_PALETTE, data);
  }

  // ── Cel chunk (compressed RGBA pixels) ────────────────────────────────

  static _buildCelChunk(canvas, w, h) {
    const scale = canvas.scale;

    // Build raw RGBA pixel buffer at output resolution
    const rawPixels = Buffer.alloc(w * h * 4);
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const p = canvas.getPixel(x, y);
        for (let sy = 0; sy < scale; sy++) {
          for (let sx = 0; sx < scale; sx++) {
            const outX = x * scale + sx;
            const outY = y * scale + sy;
            const idx = (outY * w + outX) * 4;
            rawPixels[idx]     = p.r;
            rawPixels[idx + 1] = p.g;
            rawPixels[idx + 2] = p.b;
            rawPixels[idx + 3] = p.a;
          }
        }
      }
    }

    // Compress with zlib deflate
    const compressed = zlib.deflateSync(rawPixels, { level: 6 });

    // Cel header: layerIndex(2) + x(2) + y(2) + opacity(1) + celType(2) + zIndex(2) + reserved(5) = 16
    // Then for compressed cel: width(2) + height(2) + compressed data
    const celHeaderSize = 16 + 2 + 2;
    const dataSize = celHeaderSize + compressed.length;
    const data = Buffer.alloc(dataSize);
    let o = 0;

    data.writeUInt16LE(0, o);           o += 2;  // layer index
    data.writeInt16LE(0, o);            o += 2;  // x position
    data.writeInt16LE(0, o);            o += 2;  // y position
    data[o++] = 255;                              // opacity
    data.writeUInt16LE(2, o);           o += 2;  // cel type: 2 = compressed image
    data.writeInt16LE(0, o);            o += 2;  // z-index
    o += 5; // reserved

    data.writeUInt16LE(w, o);           o += 2;  // pixel width
    data.writeUInt16LE(h, o);           o += 2;  // pixel height
    compressed.copy(data, o);

    return this._wrapChunk(CHUNK_CEL, data);
  }

  // ── Chunk envelope ────────────────────────────────────────────────────

  static _wrapChunk(type, data) {
    const chunkSize = 6 + data.length; // 4 (size) + 2 (type) + data
    const buf = Buffer.alloc(chunkSize);
    buf.writeUInt32LE(chunkSize, 0);
    buf.writeUInt16LE(type, 4);
    data.copy(buf, 6);
    return buf;
  }

  // ── Palette extraction ────────────────────────────────────────────────

  static _buildPalette(frames) {
    const colorSet = new Map();

    // Sample all frames to collect unique colors (cap at 256)
    for (const frame of frames) {
      for (let y = 0; y < frame.height; y++) {
        for (let x = 0; x < frame.width; x++) {
          const p = frame.getPixel(x, y);
          if (p.a === 0) continue;
          const key = (p.r << 16) | (p.g << 8) | p.b;
          if (!colorSet.has(key)) {
            colorSet.set(key, { r: p.r, g: p.g, b: p.b, a: 255 });
          }
          if (colorSet.size >= 255) break;
        }
        if (colorSet.size >= 255) break;
      }
      if (colorSet.size >= 255) break;
    }

    // Ensure slot 0 is transparent
    const palette = [{ r: 0, g: 0, b: 0, a: 0 }];
    for (const color of colorSet.values()) {
      palette.push(color);
      if (palette.length >= 256) break;
    }

    return palette;
  }
}

module.exports = AsepriteExporter;
