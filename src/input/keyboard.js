const DIRECTION_KEYS = Object.freeze({
  ArrowUp: { x: 0, y: -1 },
  KeyW: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  KeyS: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  KeyA: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  KeyD: { x: 1, y: 0 },
});

const SHORTCUTS = Object.freeze({
  KeyB: 'build',
  KeyI: 'inventory',
  KeyC: 'craft',
  KeyQ: 'quests',
  KeyM: 'shop',
  KeyP: 'pause',
  Escape: 'escape',
  Space: 'interact',
});

function isTypingTarget(target) {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target?.isContentEditable;
}

export class KeyboardInput {
  constructor(options = {}) {
    this.options = options;
    this.pressed = new Set();
    this.enabled = true;
    this.onKeyDown = this.onKeyDown.bind(this);
    this.onKeyUp = this.onKeyUp.bind(this);
    this.onBlur = () => this.pressed.clear();
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
  }

  onKeyDown(event) {
    if (!this.enabled || isTypingTarget(event.target)) return;
    const code = event.code;
    if (DIRECTION_KEYS[code]) {
      event.preventDefault();
      this.pressed.add(code);
      this.options.onInteract?.();
      return;
    }
    if (/^Digit[1-9]$/.test(code)) {
      event.preventDefault();
      this.options.onTool?.(Number(code.slice(-1)) - 1);
      this.options.onInteract?.();
      return;
    }
    const shortcut = SHORTCUTS[code];
    if (shortcut && !event.repeat) {
      event.preventDefault();
      this.options.onShortcut?.(shortcut, event);
      this.options.onInteract?.();
    }
  }

  onKeyUp(event) {
    this.pressed.delete(event.code);
  }

  getMovement() {
    let x = 0;
    let y = 0;
    for (const code of this.pressed) {
      const vector = DIRECTION_KEYS[code];
      if (!vector) continue;
      x += vector.x;
      y += vector.y;
    }
    if (x && y) {
      x *= Math.SQRT1_2;
      y *= Math.SQRT1_2;
    }
    return { x, y, moving: x !== 0 || y !== 0 };
  }

  destroy() {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.pressed.clear();
  }
}

export function createKeyboardInput(options) {
  return new KeyboardInput(options);
}
