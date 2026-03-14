const ANIMATION_TEMPLATES = {
  idle: { frames: [0, 1, 0, 1], fps: 4, loop: true, pingPong: false, minFrames: 2, maxFrames: 4 },
  walk: { frames: [0, 1, 2, 3, 2, 1], fps: 8, loop: true, pingPong: false, minFrames: 4, maxFrames: 8 },
  run: { frames: [0, 1, 2, 3], fps: 10, loop: true, pingPong: false, minFrames: 4, maxFrames: 6 },
  jump: { frames: [0, 1, 2], fps: 6, loop: false, pingPong: false, minFrames: 3, maxFrames: 3 },
  attack_slash: { frames: [0, 1, 2, 3], fps: 12, loop: false, pingPong: false, minFrames: 4, maxFrames: 4 },
  attack_cast: { frames: [0, 1, 2, 3, 4, 5], fps: 8, loop: false, pingPong: false, minFrames: 6, maxFrames: 6 },
  death: { frames: [0, 1, 2, 3, 4], fps: 6, loop: false, pingPong: false, minFrames: 5, maxFrames: 5 },
  hurt: { frames: [0, 1], fps: 8, loop: false, pingPong: false, minFrames: 2, maxFrames: 2 },
};

class AnimationClip {
  constructor(name, frames, fps = 8, loop = true, pingPong = false) {
    this.name = name;
    this.frames = frames;          // Array of frame indices
    this.fps = fps;
    this.loop = loop;
    this.pingPong = pingPong;
  }

  get duration() {
    return this.frames.length / this.fps;
  }

  get frameDuration() {
    return Math.round(1000 / this.fps);
  }

  toJSON() {
    return {
      name: this.name,
      frames: this.frames,
      fps: this.fps,
      loop: this.loop,
      pingPong: this.pingPong,
    };
  }
}

class AnimationSystem {
  static getTemplate(name) {
    return ANIMATION_TEMPLATES[name] || null;
  }

  static listTemplates() {
    return Object.keys(ANIMATION_TEMPLATES);
  }

  static createClip(name, options = {}) {
    const template = ANIMATION_TEMPLATES[name];
    if (!template) {
      return new AnimationClip(name, options.frames || [0], options.fps || 8, options.loop ?? true, options.pingPong ?? false);
    }

    const fps = options.fps || template.fps;
    const loop = options.loop ?? template.loop;
    const pingPong = options.pingPong ?? template.pingPong;
    const frames = options.frames || template.frames;

    return new AnimationClip(name, frames, fps, loop, pingPong);
  }

  static generateClips(animationNames, frameOffset = 0) {
    const clips = [];
    let currentOffset = frameOffset;

    for (const name of animationNames) {
      const template = ANIMATION_TEMPLATES[name];
      if (!template) continue;

      const frameCount = template.frames.length;
      const frames = [];
      for (let i = 0; i < frameCount; i++) {
        frames.push(currentOffset + i);
      }

      clips.push(new AnimationClip(name, frames, template.fps, template.loop, template.pingPong));
      currentOffset += frameCount;
    }

    return clips;
  }
}

module.exports = { AnimationSystem, AnimationClip, ANIMATION_TEMPLATES };
