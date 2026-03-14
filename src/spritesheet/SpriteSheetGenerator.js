const PixelCanvas = require('../canvas/PixelCanvas');

class SpriteSheetGenerator {
  /**
   * Pack an array of PixelCanvas frames into a sprite sheet.
   * @param {PixelCanvas[]} frames - Array of frame canvases (all same dimensions)
   * @param {object} options
   * @param {number} options.columns - Number of columns (auto-calculated if omitted)
   * @param {string} options.prefix - Frame name prefix
   * @param {string} options.imageName - Output image filename
   * @param {import('../animation/AnimationSystem').AnimationClip[]} options.animations - Animation clips
   * @returns {{ canvas: PixelCanvas, metadata: object }}
   */
  static pack(frames, options = {}) {
    if (frames.length === 0) {
      throw new Error('No frames to pack');
    }

    const frameW = frames[0].width;
    const frameH = frames[0].height;
    const scale = frames[0].scale;
    const columns = options.columns || Math.ceil(Math.sqrt(frames.length));
    const rows = Math.ceil(frames.length / columns);
    const prefix = options.prefix || 'frame';
    const imageName = options.imageName || 'spritesheet.png';

    const sheetCanvas = new PixelCanvas(frameW * columns, frameH * rows, scale);

    const framesMeta = {};
    for (let i = 0; i < frames.length; i++) {
      const col = i % columns;
      const row = Math.floor(i / columns);
      const offsetX = col * frameW;
      const offsetY = row * frameH;

      sheetCanvas.drawSprite(frames[i], offsetX, offsetY);

      const frameName = `${prefix}_${i}`;
      framesMeta[frameName] = {
        frame: {
          x: offsetX * scale,
          y: offsetY * scale,
          w: frameW * scale,
          h: frameH * scale,
        },
        duration: 100,
      };
    }

    // Assign durations from animation clips
    if (options.animations) {
      for (const clip of options.animations) {
        const frameDuration = clip.frameDuration;
        for (const frameIdx of clip.frames) {
          const frameName = `${prefix}_${frameIdx}`;
          if (framesMeta[frameName]) {
            framesMeta[frameName].duration = frameDuration;
          }
        }
      }
    }

    const metadata = {
      frames: framesMeta,
      animations: options.animations ? options.animations.map(c => c.toJSON()) : [],
      meta: {
        image: imageName,
        size: { w: frameW * columns * scale, h: frameH * rows * scale },
        scale: String(scale),
        frameSize: { w: frameW * scale, h: frameH * scale },
        totalFrames: frames.length,
        columns,
        rows,
      },
    };

    return { canvas: sheetCanvas, metadata };
  }

  /**
   * Pack frames grouped by animation name for easier metadata.
   * @param {Map<string, PixelCanvas[]>} animationFrames - Map of animation name to frame array
   * @param {object} options
   * @returns {{ canvas: PixelCanvas, metadata: object }}
   */
  static packByAnimation(animationFrames, options = {}) {
    const allFrames = [];
    const animMeta = [];
    const prefix = options.prefix || 'sprite';

    for (const [animName, frames] of animationFrames) {
      const startIndex = allFrames.length;
      allFrames.push(...frames);
      animMeta.push({
        name: animName,
        startFrame: startIndex,
        frameCount: frames.length,
      });
    }

    const result = SpriteSheetGenerator.pack(allFrames, { ...options, prefix });

    // Enrich metadata with per-animation info
    result.metadata.animationRanges = animMeta;

    return result;
  }
}

module.exports = SpriteSheetGenerator;
