export class GameLoop {
  constructor({ update, render, step = 1000 / 30, maxDelta = 250 } = {}) {
    this.update = typeof update === 'function' ? update : () => {};
    this.render = typeof render === 'function' ? render : () => {};
    this.step = step;
    this.maxDelta = maxDelta;
    this.accumulator = 0;
    this.previous = 0;
    this.running = false;
    this.paused = false;
    this.frameHandle = 0;
    this.tick = this.tick.bind(this);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.previous = performance.now();
    this.frameHandle = requestAnimationFrame(this.tick);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.frameHandle);
  }

  setPaused(value) {
    this.paused = Boolean(value);
    this.accumulator = 0;
    this.previous = performance.now();
  }

  tick(now) {
    if (!this.running) return;
    const delta = Math.min(this.maxDelta, Math.max(0, now - this.previous));
    this.previous = now;

    if (!this.paused) {
      this.accumulator += delta;
      let guard = 0;
      while (this.accumulator >= this.step && guard < 8) {
        this.update(this.step, now);
        this.accumulator -= this.step;
        guard += 1;
      }
    }

    this.render(this.paused ? 0 : this.accumulator / this.step, now);
    this.frameHandle = requestAnimationFrame(this.tick);
  }
}

export function createGameLoop(options) {
  return new GameLoop(options);
}
