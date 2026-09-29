const DEFAULT_LAYER_ORDER = Object.freeze({
  background: 0,
  ground: 1000,
  shadow: 2000,
  object: 3000,
  actor: 4000,
  foreground: 5000,
  effect: 6000,
});

export function isoProject(x, y, elevation = 0, tileWidth = 128, tileHeight = 64) {
  return {
    x: (Number(x) - Number(y)) * (tileWidth / 2),
    y: (Number(x) + Number(y)) * (tileHeight / 2) - Number(elevation || 0),
  };
}

export function isoUnproject(screenX, screenY, tileWidth = 128, tileHeight = 64) {
  const halfWidth = tileWidth / 2;
  const halfHeight = tileHeight / 2;
  return {
    x: (screenX / halfWidth + screenY / halfHeight) / 2,
    y: (screenY / halfHeight - screenX / halfWidth) / 2,
  };
}

export function depthFor(entity, layer = 'object') {
  const layerBase = DEFAULT_LAYER_ORDER[layer] ?? DEFAULT_LAYER_ORDER.object;
  const x = Number(entity?.x ?? entity?.tileX ?? 0);
  const y = Number(entity?.y ?? entity?.tileY ?? 0);
  const footprint = Math.max(0, Number(entity?.footprintDepth ?? entity?.height ?? 0));
  const explicitBias = Number(entity?.depthBias ?? 0);
  return Math.round(layerBase + (x + y) * 10 + footprint + explicitBias);
}

export function compareDepth(a, b) {
  const aDepth = depthFor(a, a?.renderLayer);
  const bDepth = depthFor(b, b?.renderLayer);
  if (aDepth !== bDepth) return aDepth - bDepth;
  return String(a?.id ?? '').localeCompare(String(b?.id ?? ''));
}

export function sortByDepth(entities) {
  return [...entities].sort(compareDepth);
}

export function applyDepth(element, entity, layer) {
  if (!element) return;
  element.style.zIndex = String(depthFor(entity, layer));
}

export const LAYER_ORDER = DEFAULT_LAYER_ORDER;
