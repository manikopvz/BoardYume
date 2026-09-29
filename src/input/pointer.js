const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export class PointerInput {
  constructor(viewport, options = {}) {
    this.viewport = viewport;
    this.options = options;
    this.points = new Map();
    this.dragging = false;
    this.moved = false;
    this.start = { x: 0, y: 0 };
    this.last = { x: 0, y: 0 };
    this.lastPinchDistance = 0;
    this.enabled = true;

    this.onPointerDown = this.onPointerDown.bind(this);
    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerUp = this.onPointerUp.bind(this);
    this.onWheel = this.onWheel.bind(this);
    this.onContextMenu = (event) => event.preventDefault();

    viewport.addEventListener('pointerdown', this.onPointerDown);
    viewport.addEventListener('pointermove', this.onPointerMove);
    viewport.addEventListener('pointerup', this.onPointerUp);
    viewport.addEventListener('pointercancel', this.onPointerUp);
    viewport.addEventListener('wheel', this.onWheel, { passive: false });
    viewport.addEventListener('contextmenu', this.onContextMenu);
  }

  localPoint(event) {
    const rect = this.viewport.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  onPointerDown(event) {
    if (!this.enabled || event.button > 1) return;
    this.viewport.setPointerCapture?.(event.pointerId);
    const point = this.localPoint(event);
    this.points.set(event.pointerId, point);
    this.start = point;
    this.last = point;
    this.moved = false;
    this.dragging = this.points.size === 1;
    if (this.points.size === 2) this.lastPinchDistance = this.pinchDistance();
    this.options.onInteract?.();
  }

  pinchDistance() {
    const [a, b] = [...this.points.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }

  onPointerMove(event) {
    if (!this.enabled) return;
    const point = this.localPoint(event);
    this.options.onHover?.(point, event);
    if (!this.points.has(event.pointerId)) return;
    this.points.set(event.pointerId, point);

    if (this.points.size >= 2) {
      const nextDistance = this.pinchDistance();
      if (this.lastPinchDistance > 0 && nextDistance > 0) {
        const ratio = clamp(nextDistance / this.lastPinchDistance, 0.85, 1.15);
        const points = [...this.points.values()];
        const center = {
          x: (points[0].x + points[1].x) / 2,
          y: (points[0].y + points[1].y) / 2,
        };
        this.options.onZoom?.(ratio, center, event);
      }
      this.lastPinchDistance = nextDistance;
      this.moved = true;
      this.dragging = false;
      return;
    }

    if (!this.dragging) return;
    const dx = point.x - this.last.x;
    const dy = point.y - this.last.y;
    if (Math.hypot(point.x - this.start.x, point.y - this.start.y) > 5) this.moved = true;
    if (this.moved) this.options.onPan?.(dx, dy, event);
    this.last = point;
  }

  onPointerUp(event) {
    if (!this.enabled) return;
    const point = this.localPoint(event);
    const wasTap = this.points.size === 1 && !this.moved && Math.hypot(point.x - this.start.x, point.y - this.start.y) < 8;
    this.points.delete(event.pointerId);
    if (wasTap) this.options.onTap?.(point, event);
    if (this.points.size === 0) {
      this.dragging = false;
      this.moved = false;
      this.lastPinchDistance = 0;
    }
  }

  onWheel(event) {
    if (!this.enabled) return;
    event.preventDefault();
    const factor = Math.exp(-event.deltaY * 0.0012);
    this.options.onZoom?.(clamp(factor, 0.8, 1.2), this.localPoint(event), event);
    this.options.onInteract?.();
  }

  destroy() {
    this.viewport.removeEventListener('pointerdown', this.onPointerDown);
    this.viewport.removeEventListener('pointermove', this.onPointerMove);
    this.viewport.removeEventListener('pointerup', this.onPointerUp);
    this.viewport.removeEventListener('pointercancel', this.onPointerUp);
    this.viewport.removeEventListener('wheel', this.onWheel);
    this.viewport.removeEventListener('contextmenu', this.onContextMenu);
    this.points.clear();
  }
}

export function createPointerInput(viewport, options) {
  return new PointerInput(viewport, options);
}
