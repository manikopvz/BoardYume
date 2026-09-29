import { applyDepth } from './depthSort.js';

function setImageSource(image, source) {
  const next = typeof source === 'string' ? source.trim() : '';
  if (!next) {
    image.removeAttribute('src');
    image.hidden = true;
    return;
  }
  if (image.dataset.source !== next) {
    image.dataset.source = next;
    image.src = next;
  }
  image.hidden = false;
}

function makeImage(className, alt = '') {
  const image = document.createElement('img');
  image.className = className;
  image.alt = alt;
  image.draggable = false;
  image.decoding = 'async';
  return image;
}

export class EntityPool {
  constructor(layerRoot) {
    this.layerRoot = layerRoot;
    this.entries = new Map();
    this.active = new Set();
  }

  beginFrame() {
    this.active.clear();
  }

  acquire(id, type = 'entity') {
    const key = String(id);
    this.active.add(key);
    let entry = this.entries.get(key);
    if (entry) return entry;

    const element = document.createElement('div');
    element.className = `world-entity world-entity--${type}`;
    element.dataset.entityId = key;
    element.dataset.entityType = type;
    element.setAttribute('role', 'button');
    element.tabIndex = -1;

    const shadow = makeImage('world-entity__shadow', '');
    const clip = document.createElement('div');
    clip.className = 'world-entity__clip';
    const visual = makeImage('world-entity__visual', '');
    clip.append(visual);

    const label = document.createElement('span');
    label.className = 'world-entity__label';
    label.hidden = true;

    const progress = document.createElement('div');
    progress.className = 'world-entity__progress';
    progress.hidden = true;
    const progressFill = document.createElement('div');
    progressFill.className = 'world-entity__progress-fill';
    progress.append(progressFill);

    element.append(shadow, clip, label, progress);
    this.layerRoot.append(element);
    entry = { element, shadow, clip, visual, label, progress, progressFill, frame: -1 };
    this.entries.set(key, entry);
    return entry;
  }

  update(id, spec = {}) {
    const type = spec.type || 'entity';
    const entry = this.acquire(id, type);
    const { element, shadow, clip, visual, label, progress, progressFill } = entry;

    element.className = `world-entity world-entity--${type}${spec.selected ? ' is-selected' : ''}${spec.invalid ? ' is-invalid' : ''}${spec.active ? ' is-active' : ''}`;
    element.dataset.entityId = String(id);
    element.dataset.entityType = type;
    if (spec.tileX != null) element.dataset.tileX = String(spec.tileX);
    if (spec.tileY != null) element.dataset.tileY = String(spec.tileY);
    element.style.transform = `translate3d(${Math.round(spec.screenX || 0)}px, ${Math.round(spec.screenY || 0)}px, 0) scale(${Number(spec.scale || 1)})`;
    element.style.width = `${Math.max(1, Number(spec.width || 96))}px`;
    element.style.height = `${Math.max(1, Number(spec.height || 96))}px`;
    element.style.opacity = spec.opacity == null ? '1' : String(spec.opacity);
    applyDepth(element, { ...spec, x: spec.tileX, y: spec.tileY }, spec.layer || 'object');

    setImageSource(visual, spec.asset);
    visual.alt = spec.alt || '';
    setImageSource(shadow, spec.shadowAsset);

    const frame = Math.max(0, Number(spec.frame || 0));
    const columns = Math.max(1, Number(spec.columns || 1));
    const rows = Math.max(1, Number(spec.rows || 1));
    if (columns > 1 || rows > 1) {
      const frameWidth = Math.max(1, Number(spec.frameWidth || spec.width || 96));
      const frameHeight = Math.max(1, Number(spec.frameHeight || spec.height || 96));
      const column = frame % columns;
      const row = Math.floor(frame / columns) % rows;
      clip.style.width = `${frameWidth}px`;
      clip.style.height = `${frameHeight}px`;
      visual.style.width = `${frameWidth * columns}px`;
      visual.style.height = `${frameHeight * rows}px`;
      visual.style.transform = `translate3d(${-column * frameWidth}px, ${-row * frameHeight}px, 0)`;
      entry.frame = frame;
    } else {
      clip.style.width = '100%';
      clip.style.height = '100%';
      visual.style.width = '100%';
      visual.style.height = '100%';
      visual.style.transform = spec.flipX ? 'scaleX(-1)' : '';
    }

    if (spec.label) {
      label.textContent = spec.label;
      label.hidden = false;
    } else {
      label.hidden = true;
    }

    if (Number.isFinite(spec.progress)) {
      const value = Math.min(1, Math.max(0, Number(spec.progress)));
      progress.hidden = false;
      progressFill.style.width = `${Math.round(value * 100)}%`;
      progress.setAttribute('aria-label', `${Math.round(value * 100)}%`);
    } else {
      progress.hidden = true;
    }
    return entry;
  }

  endFrame() {
    for (const [key, entry] of this.entries) {
      const visible = this.active.has(key);
      entry.element.hidden = !visible;
      entry.element.setAttribute('aria-hidden', visible ? 'false' : 'true');
    }
  }

  remove(id) {
    const key = String(id);
    const entry = this.entries.get(key);
    if (!entry) return;
    entry.element.remove();
    this.entries.delete(key);
    this.active.delete(key);
  }

  clear() {
    for (const entry of this.entries.values()) entry.element.remove();
    this.entries.clear();
    this.active.clear();
  }
}
