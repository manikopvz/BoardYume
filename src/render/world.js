import { EntityPool } from './entityPool.js';
import { isoProject, isoUnproject } from './depthSort.js';

const TILE_ASSETS = Object.freeze({
  grass: 'tile.grass_01',
  bare: 'tile.soil_bare',
  dirt: 'tile.soil_bare',
  tilled: 'tile.soil_tilled',
  wet: 'tile.soil_wet',
  path_dirt: 'tile.path_dirt',
  path_stone: 'tile.path_stone',
  water: 'tile.water',
});

const CROP_ASSET_ALIASES = Object.freeze({ cabbage: 'lettuce', lavender: 'sunflower', pepper: 'eggplant' });
const CROP_STAGE_NAMES = Object.freeze(['sown', 'sprout', 'young', 'mature', 'harvest']);
const BUILDING_ASSET_ALIASES = Object.freeze({
  cottage: 'house_1', homestead: 'house_2', garden_manor: 'house_3', masonry: 'stoneworks',
  smelter: 'stoneworks', garden_lamp: 'lantern', fence: 'nature.fence', gate: 'nature.gate',
  flower_arch: 'nature.flower_box',
});

function readNested(source, path) {
  return path.split('.').reduce((value, key) => value?.[key], source);
}

function runtimeBaseUrl() {
  // Vite exposes BASE_URL in dev/build. GitHub Pages' legacy branch publisher
  // serves the repository directly, where public/ remains part of the URL.
  const configured = import.meta.env?.BASE_URL || './public/';
  return configured.endsWith('/') ? configured : `${configured}/`;
}

export function withBaseUrl(path) {
  if (!path || typeof path !== 'string') return '';
  if (/^(?:https?:|data:|blob:)/i.test(path)) return '';
  const clean = path.replace(/^\.?\//, '').replace(/^assets\//, '');
  const relative = `${runtimeBaseUrl()}assets/${clean}`;
  return typeof document !== 'undefined' && document.baseURI
    ? new URL(relative, document.baseURI).href
    : relative;
}

function normalizeAssetPath(value) {
  const source = typeof value === 'string' ? value : value?.src || value?.path || value?.file || value?.url;
  if (!source || typeof source !== 'string') return '';
  return withBaseUrl(source);
}

export function assetEntry(manifest, key) {
  if (!manifest || !key) return null;
  return manifest[key]
    ?? manifest.assets?.[key]
    ?? readNested(manifest, key)
    ?? readNested(manifest.assets, key)
    ?? null;
}

export function resolveAsset(manifest, key, fallback = '') {
  return normalizeAssetPath(assetEntry(manifest, key)) || normalizeAssetPath(fallback);
}

export async function loadAssetManifest(url = withBaseUrl('assets/manifest.json')) {
  try {
    const response = await fetch(url, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`Asset manifest ${response.status}`);
    const manifest = await response.json();
    return manifest && typeof manifest === 'object' ? manifest : {};
  } catch (error) {
    console.warn('[BoardYume] Không thể tải asset manifest.', error);
    return {};
  }
}

export function listRasterAssetUrls(manifest) {
  const entries = Object.values(manifest?.assets || {});
  return [...new Set(entries
    .map((entry) => normalizeAssetPath(entry))
    .filter((url) => /\.(?:avif|jpe?g|png|webp)(?:[?#].*)?$/i.test(url)))];
}

function loadRaster(url, ImageCtor) {
  return new Promise((resolve, reject) => {
    const image = new ImageCtor();
    let settled = false;
    const finish = (error = null) => {
      if (settled) return;
      settled = true;
      image.onload = null;
      image.onerror = null;
      if (error) reject(error);
      else resolve(url);
    };
    image.decoding = 'async';
    image.onload = async () => {
      try { await image.decode?.(); } catch { /* onload already proves the raster is usable */ }
      finish();
    };
    image.onerror = () => finish(new Error(`Không tải được raster asset: ${url}`));
    image.src = url;
    if (image.complete && image.naturalWidth > 0) queueMicrotask(() => finish());
  });
}

export async function preloadRasterAssets(manifest, options = {}) {
  const urls = listRasterAssetUrls(manifest);
  const ImageCtor = options.ImageCtor ?? globalThis.Image;
  const concurrency = Math.max(1, Math.min(16, Number(options.concurrency || 10)));
  if (typeof ImageCtor !== 'function' || urls.length === 0) {
    options.onProgress?.({ completed: urls.length, loaded: urls.length, failed: 0, total: urls.length, url: '' });
    return { total: urls.length, loaded: urls.length, failures: [] };
  }

  let cursor = 0;
  let completed = 0;
  let loaded = 0;
  const failures = [];
  const worker = async () => {
    while (cursor < urls.length) {
      const url = urls[cursor];
      cursor += 1;
      try {
        await loadRaster(url, ImageCtor);
        loaded += 1;
      } catch {
        failures.push(url);
      }
      completed += 1;
      options.onProgress?.({ completed, loaded, failed: failures.length, total: urls.length, url });
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, urls.length) }, worker));

  if (failures.length && options.retry !== false) {
    let retryCursor = 0;
    let retryLoaded = 0;
    const finalFailures = [];
    const retryWorker = async () => {
      while (retryCursor < failures.length) {
        const url = failures[retryCursor];
        retryCursor += 1;
        try {
          await loadRaster(url, ImageCtor);
          retryLoaded += 1;
        } catch {
          finalFailures.push(url);
        }
        options.onProgress?.({ completed: urls.length, loaded: loaded + retryLoaded, failed: finalFailures.length, total: urls.length, url, retrying: true });
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, failures.length) }, retryWorker));
    return {
      total: urls.length,
      loaded: loaded + retryLoaded,
      failures: finalFailures,
    };
  }
  return { total: urls.length, loaded, failures };
}

function valuesOf(source) {
  if (Array.isArray(source)) return source;
  return source && typeof source === 'object' ? Object.values(source) : [];
}

function parseTileKey(key, tile) {
  if (Number.isFinite(tile?.x) && Number.isFinite(tile?.y)) return { x: tile.x, y: tile.y };
  const [x, y] = String(key).split(',').map(Number);
  return { x: Number.isFinite(x) ? x : 0, y: Number.isFinite(y) ? y : 0 };
}

function cropFromTile(tile) {
  return tile?.crop && typeof tile.crop === 'object' ? tile.crop : null;
}

function stateTileKind(tile) {
  if (tile?.watered || tile?.moisture > 0) return 'wet';
  if (tile?.tilled || tile?.hoed) return 'tilled';
  return tile?.type || tile?.terrain || 'grass';
}

function getAssetKey(definition, prefix, id, suffix = '') {
  return definition?.assetKey || definition?.spriteKey || `${prefix}.${id}${suffix}`;
}

function cropStage(crop, definition) {
  if (Number.isFinite(crop?.stage)) return Math.max(0, Math.floor(crop.stage));
  const stages = definition?.stages || definition?.growthStages || [];
  if (!stages.length || !Number.isFinite(crop?.progress)) return 0;
  return Math.min(stages.length - 1, Math.floor(crop.progress * stages.length));
}

function spriteMetadata(manifest, key, definition = {}) {
  const entry = assetEntry(manifest, key);
  const metadata = entry && typeof entry === 'object' ? entry : {};
  const tags = Array.isArray(metadata.tags) ? metadata.tags : [];
  const spriteSheet = tags.includes('sprite-sheet') || Boolean(metadata.frameWidth && metadata.width > metadata.frameWidth);
  const derivedColumns = spriteSheet && metadata.frameWidth ? Math.max(1, Math.round(metadata.width / metadata.frameWidth)) : 1;
  return {
    columns: Number(spriteSheet ? metadata.columns || derivedColumns : definition.columns || 1),
    rows: Number(spriteSheet ? metadata.rows || 1 : definition.rows || 1),
    frameWidth: Number(metadata.frameWidth || definition.frameWidth || definition.renderWidth || definition.width || 96),
    frameHeight: Number(metadata.frameHeight || definition.frameHeight || definition.renderHeight || definition.height || 96),
    fps: Number(metadata.fps || (metadata.durationMs ? 1000 / metadata.durationMs : 0) || definition.fps || 8),
  };
}

function nodeAssetKey(node) {
  const variant = Math.max(1, Math.min(3, Number(node.variant || 1)));
  if (node.type === 'tree') return `nature.tree.oak.${variant}`;
  if (node.type === 'pine') return `nature.tree.pine.${variant}`;
  if (node.type === 'fruit_tree') return 'nature.tree.fruit.apple';
  if (node.type === 'rock') return `nature.rock.${variant}`;
  if (node.type === 'ore_rock') return 'nature.rock.3';
  if (node.type === 'clay_mound') return 'nature.rock.2';
  if (node.type === 'weed') return `nature.grass.${variant}`;
  return `nature.${node.type}.${variant}`;
}

function buildingAssetKey(id) {
  const alias = BUILDING_ASSET_ALIASES[id] || id;
  return alias.startsWith('nature.') ? alias : `building.${alias}`;
}

function createLayer(className, parent) {
  const layer = document.createElement('div');
  layer.className = `world-layer ${className}`;
  parent.append(layer);
  return layer;
}

export class WorldRenderer {
  constructor(viewport, options = {}) {
    this.viewport = viewport;
    this.manifest = options.manifest || {};
    this.catalogs = options.catalogs || {};
    this.tileWidth = Number(options.tileWidth || this.manifest.meta?.tileWidth || 128);
    this.tileHeight = Number(options.tileHeight || this.manifest.meta?.tileHeight || 64);
    this.camera = { x: 0, y: 0, zoom: 1 };
    this.viewState = { selectedTile: null, placement: null };
    this.animationTime = 0;

    this.stage = document.createElement('div');
    this.stage.className = 'camera-stage';
    this.layers = {
      background: createLayer('world-layer--background', this.stage),
      ground: createLayer('world-layer--ground', this.stage),
      shadow: createLayer('world-layer--shadow', this.stage),
      objects: createLayer('world-layer--objects', this.stage),
      actors: createLayer('world-layer--actors', this.stage),
      foreground: createLayer('world-layer--foreground', this.stage),
      effects: createLayer('world-layer--effects', this.stage),
    };
    viewport.append(this.stage);

    this.pools = {
      ground: new EntityPool(this.layers.ground),
      objects: new EntityPool(this.layers.objects),
      actors: new EntityPool(this.layers.actors),
      effects: new EntityPool(this.layers.effects),
    };
    this.resetCamera();
  }

  setManifest(manifest) {
    this.manifest = manifest || {};
  }

  setCatalogs(catalogs) {
    this.catalogs = catalogs || {};
  }

  resetCamera() {
    const rect = this.viewport.getBoundingClientRect();
    this.camera.x = rect.width / 2;
    this.camera.y = Math.max(120, rect.height * 0.28);
    this.camera.zoom = Math.min(1, Math.max(0.72, rect.width / 1100));
    this.applyCamera();
  }

  applyCamera() {
    this.stage.style.transform = `translate3d(${Math.round(this.camera.x)}px, ${Math.round(this.camera.y)}px, 0) scale(${this.camera.zoom})`;
  }

  pan(dx, dy) {
    this.camera.x += dx;
    this.camera.y += dy;
    this.applyCamera();
  }

  zoomBy(factor, anchor = null) {
    const previous = this.camera.zoom;
    const next = Math.min(1.45, Math.max(0.55, previous * factor));
    if (next === previous) return;
    if (anchor) {
      const worldX = (anchor.x - this.camera.x) / previous;
      const worldY = (anchor.y - this.camera.y) / previous;
      this.camera.x = anchor.x - worldX * next;
      this.camera.y = anchor.y - worldY * next;
    }
    this.camera.zoom = next;
    this.applyCamera();
  }

  screenToTile(point) {
    const stageX = (point.x - this.camera.x) / this.camera.zoom;
    const stageY = (point.y - this.camera.y) / this.camera.zoom;
    const tile = isoUnproject(stageX, stageY, this.tileWidth, this.tileHeight);
    return { x: Math.round(tile.x), y: Math.round(tile.y) };
  }

  isVisible(projected, padding = 260) {
    const width = this.viewport.clientWidth;
    const height = this.viewport.clientHeight;
    const x = projected.x * this.camera.zoom + this.camera.x;
    const y = projected.y * this.camera.zoom + this.camera.y;
    return x >= -padding && x <= width + padding && y >= -padding && y <= height + padding;
  }

  render(state, viewState = this.viewState, now = performance.now()) {
    this.viewState = viewState || {};
    this.animationTime = now;
    for (const pool of Object.values(this.pools)) pool.beginFrame();
    this.renderTiles(state?.world || {});
    this.renderCrops(state?.world || {});
    this.renderNodes(state?.world || {});
    this.renderBuildings(state?.world || {});
    this.renderDrops(state?.world || {});
    this.renderPlayer(state?.player || {});
    this.renderPlacement();
    for (const pool of Object.values(this.pools)) pool.endFrame();
  }

  renderTiles(world) {
    const width = Math.max(1, Number(world.width || world.size?.width || 18));
    const height = Math.max(1, Number(world.height || world.size?.height || 18));
    const explicit = world.tiles && typeof world.tiles === 'object' ? world.tiles : {};
    const hasDenseTiles = Object.keys(explicit).length >= width * height * 0.45;
    const entries = hasDenseTiles
      ? Object.entries(explicit)
      : Array.from({ length: width * height }, (_, index) => {
          const x = index % width;
          const y = Math.floor(index / width);
          return [`${x},${y}`, explicit[`${x},${y}`] || { x, y, type: 'grass' }];
        });

    for (const [key, tile] of entries) {
      const { x, y } = parseTileKey(key, tile);
      const projected = isoProject(x, y, 0, this.tileWidth, this.tileHeight);
      if (!this.isVisible(projected, 180)) continue;
      const kind = stateTileKind(tile);
      const selected = this.viewState.selectedTile?.x === x && this.viewState.selectedTile?.y === y;
      this.pools.ground.update(`tile:${x},${y}`, {
        type: 'tile',
        layer: 'ground',
        tileX: x,
        tileY: y,
        screenX: projected.x,
        screenY: projected.y,
        width: this.tileWidth,
        height: this.tileHeight,
        asset: resolveAsset(this.manifest, tile.assetKey || TILE_ASSETS[kind] || TILE_ASSETS.grass),
        alt: '',
        selected,
      });
    }
  }

  renderCrops(world) {
    for (const [key, tile] of Object.entries(world.tiles || {})) {
      const crop = cropFromTile(tile);
      if (!crop) continue;
      const { x, y } = parseTileKey(key, tile);
      const projected = isoProject(x, y, Number(crop.elevation || 2), this.tileWidth, this.tileHeight);
      if (!this.isVisible(projected)) continue;
      const cropId = crop.cropId || crop.type || crop.id;
      const definition = this.catalogs.crops?.[cropId] || {};
      const stage = cropStage(crop, definition);
      const animatedKey = tile.watered
        ? `crop.${cropId}.watered`
        : crop.harvestable ? `crop.${cropId}.wind` : null;
      const candidates = [
        animatedKey,
        crop.assetKey,
        definition.stageAssetKeys?.[stage],
        definition.stageSpriteKeys?.[stage],
        `crop.${CROP_ASSET_ALIASES[cropId] || cropId}.${CROP_STAGE_NAMES[stage] || 'sown'}`,
      ].filter(Boolean);
      const asset = candidates.map((candidate) => resolveAsset(this.manifest, candidate)).find(Boolean) || normalizeAssetPath(definition.stages?.[stage]?.asset);
      this.pools.objects.update(`crop:${x},${y}`, {
        type: 'crop',
        layer: 'object',
        tileX: x,
        tileY: y,
        screenX: projected.x,
        screenY: projected.y + this.tileHeight * 0.25,
        width: Number(definition.renderWidth || 76),
        height: Number(definition.renderHeight || 96),
        asset,
        alt: definition.name || cropId || 'Cây trồng',
        active: Boolean(tile.watered || crop.watered),
      });
    }
  }

  renderNodes(world) {
    for (const node of valuesOf(world.nodes || world.resources)) {
      if (!node || node.active === false || node.depleted || node.quantity === 0) continue;
      const x = Number(node.x ?? node.tileX ?? 0);
      const y = Number(node.y ?? node.tileY ?? 0);
      const projected = isoProject(x, y, Number(node.elevation || 0), this.tileWidth, this.tileHeight);
      if (!this.isVisible(projected)) continue;
      const id = node.nodeId || node.id || `${node.type}:${x},${y}`;
      const definition = this.catalogs.nodes?.[node.type] || this.catalogs.items?.[node.itemId] || {};
      const assetKey = node.assetKey && assetEntry(this.manifest, node.assetKey)
        ? node.assetKey
        : definition.worldAssetKey && assetEntry(this.manifest, definition.worldAssetKey)
          ? definition.worldAssetKey
          : nodeAssetKey(node);
      const meta = spriteMetadata(this.manifest, assetKey, definition);
      const frame = meta.columns * meta.rows > 1 ? Math.floor(this.animationTime / (1000 / meta.fps)) % (meta.columns * meta.rows) : 0;
      this.pools.objects.update(`node:${id}`, {
        type: 'resource',
        layer: 'object',
        tileX: x,
        tileY: y,
        screenX: projected.x,
        screenY: projected.y + this.tileHeight * 0.25,
        width: Number(definition.renderWidth || node.renderWidth || 104),
        height: Number(definition.renderHeight || node.renderHeight || 128),
        frameWidth: meta.frameWidth,
        frameHeight: meta.frameHeight,
        columns: meta.columns,
        rows: meta.rows,
        frame,
        asset: resolveAsset(this.manifest, assetKey, node.asset || definition.worldAsset),
        shadowAsset: resolveAsset(this.manifest, node.shadowAssetKey || definition.shadowAssetKey),
        alt: definition.name || node.name || node.type || 'Tài nguyên',
        active: Boolean(node.hitAt && Date.now() - node.hitAt < 280),
      });
    }
  }

  renderBuildings(world) {
    for (const building of valuesOf(world.buildings)) {
      if (!building) continue;
      const x = Number(building.x ?? building.tileX ?? 0);
      const y = Number(building.y ?? building.tileY ?? 0);
      const projected = isoProject(x, y, Number(building.elevation || 0), this.tileWidth, this.tileHeight);
      if (!this.isVisible(projected, 360)) continue;
      const id = building.typeId || building.buildingId || building.type || building.definitionId || building.id;
      const instanceId = building.instanceId || building.uid || building.id || `${id}:${x},${y}`;
      const definition = this.catalogs.buildings?.[id] || {};
      const constructing = building.status === 'building' || building.complete === false;
      const baseAssetKey = buildingAssetKey(id);
      const definitionConstructionKey = definition.constructionSpriteKey && assetEntry(this.manifest, definition.constructionSpriteKey)
        ? definition.constructionSpriteKey
        : `${baseAssetKey}.construction`;
      const active = Boolean(building.production?.queue?.length || building.active || building.status === 'processing');
      const assetKey = constructing
        ? building.constructionAssetKey || definitionConstructionKey
        : active && assetEntry(this.manifest, `${baseAssetKey}.active`) ? `${baseAssetKey}.active` : baseAssetKey;
      const meta = spriteMetadata(this.manifest, assetKey, definition);
      const frame = building.active && meta.columns * meta.rows > 1
        ? Math.floor(this.animationTime / (1000 / meta.fps)) % (meta.columns * meta.rows)
        : 0;
      const end = Number(building.completesAt || building.finishAt || 0);
      const start = Number(building.startedAt || 0);
      const constructionTotal = Number(definition.buildMinutes || 0);
      const progress = constructing && constructionTotal > 0
        ? 1 - Math.min(1, Math.max(0, Number(building.buildRemaining || 0) / constructionTotal))
        : end > start ? Math.min(1, Math.max(0, (Date.now() - start) / (end - start))) : undefined;
      this.pools.objects.update(`building:${instanceId}`, {
        type: 'building',
        layer: 'object',
        tileX: x,
        tileY: y,
        screenX: projected.x,
        screenY: projected.y + this.tileHeight * 0.35,
        width: Number(definition.renderWidth || building.renderWidth || 168),
        height: Number(definition.renderHeight || building.renderHeight || 190),
        frameWidth: meta.frameWidth,
        frameHeight: meta.frameHeight,
        columns: meta.columns,
        rows: meta.rows,
        frame,
        asset: resolveAsset(this.manifest, assetKey, constructing ? definition.constructionAsset : definition.asset),
        shadowAsset: resolveAsset(this.manifest, `${baseAssetKey}.shadow`),
        alt: definition.name || building.name || id || 'Công trình',
        active,
        progress,
      });
    }
  }

  renderDrops(world) {
    for (const drop of valuesOf(world.drops || world.pickups)) {
      if (!drop) continue;
      const x = Number(drop.x ?? 0);
      const y = Number(drop.y ?? 0);
      const projected = isoProject(x, y, Number(drop.elevation || 8), this.tileWidth, this.tileHeight);
      if (!this.isVisible(projected)) continue;
      const definition = this.catalogs.items?.[drop.itemId || drop.type] || {};
      const id = drop.id || `${drop.itemId}:${x},${y}`;
      this.pools.effects.update(`drop:${id}`, {
        type: 'drop',
        layer: 'effect',
        tileX: x,
        tileY: y,
        screenX: projected.x,
        screenY: projected.y,
        width: 46,
        height: 46,
        asset: resolveAsset(this.manifest, drop.assetKey || `item.${drop.itemId || drop.type}`, drop.asset || definition.icon),
        alt: definition.name || 'Vật phẩm',
        active: true,
      });
    }
  }

  playerAssetKey(player) {
    const actionAliases = { plant: 'sow', planting: 'sow', watering: 'water', walking: 'walk' };
    const rawAction = player.action || (player.moving ? 'walk' : 'idle');
    const action = actionAliases[rawAction] || rawAction;
    const rawFacing = player.facing || player.direction || 'south';
    const direction = ({ south: 'down', north: 'up', east: 'right', west: 'left', s: 'down', n: 'up', e: 'right', w: 'left' })[rawFacing] || rawFacing;
    return `character.player.${action}.${direction}`;
  }

  renderPlayer(player) {
    const x = Number(player.x ?? player.tileX ?? 4);
    const y = Number(player.y ?? player.tileY ?? 4);
    const projected = isoProject(x, y, Number(player.elevation || 0), this.tileWidth, this.tileHeight);
    const assetKey = player.assetKey || this.playerAssetKey(player);
    const meta = spriteMetadata(this.manifest, assetKey, player);
    const frameCount = meta.columns * meta.rows;
    const frame = frameCount > 1 ? Math.floor(this.animationTime / (1000 / meta.fps)) % frameCount : 0;
    this.pools.actors.update('player', {
      type: 'player',
      layer: 'actor',
      tileX: x,
      tileY: y,
      screenX: projected.x,
      screenY: projected.y + this.tileHeight * 0.3,
      width: Number(player.renderWidth || meta.frameWidth || 92),
      height: Number(player.renderHeight || meta.frameHeight || 126),
      frameWidth: meta.frameWidth,
      frameHeight: meta.frameHeight,
      columns: meta.columns,
      rows: meta.rows,
      frame,
      asset: resolveAsset(this.manifest, assetKey, player.asset),
      shadowAsset: resolveAsset(this.manifest, 'effect.shadow_actor'),
      alt: player.name || 'Người làm vườn',
      active: Boolean(player.action && player.action !== 'idle'),
    });
  }

  renderPlacement() {
    const placement = this.viewState.placement;
    if (!placement || !Number.isFinite(placement.x) || !Number.isFinite(placement.y)) return;
    const definition = this.catalogs.buildings?.[placement.buildingId] || {};
    const projected = isoProject(placement.x, placement.y, 0, this.tileWidth, this.tileHeight);
    this.pools.effects.update('placement-preview', {
      type: 'placement',
      layer: 'effect',
      tileX: placement.x,
      tileY: placement.y,
      screenX: projected.x,
      screenY: projected.y + this.tileHeight * 0.35,
      width: Number(definition.renderWidth || 168),
      height: Number(definition.renderHeight || 190),
      asset: resolveAsset(this.manifest, buildingAssetKey(placement.buildingId), definition.asset),
      opacity: 0.68,
      invalid: !placement.valid,
      selected: placement.valid,
      alt: placement.valid ? 'Vị trí xây dựng hợp lệ' : 'Vị trí xây dựng không hợp lệ',
    });

    const marker = placement.valid ? 'ui.placement_valid' : 'ui.placement_invalid';
    this.pools.effects.update('placement-marker', {
      type: 'marker',
      layer: 'effect',
      tileX: placement.x,
      tileY: placement.y,
      screenX: projected.x,
      screenY: projected.y + 10,
      width: this.tileWidth,
      height: this.tileHeight,
      asset: resolveAsset(this.manifest, marker),
      alt: '',
    });
  }

  destroy() {
    for (const pool of Object.values(this.pools)) pool.clear();
    this.stage.remove();
  }
}

export function createWorldRenderer(viewport, options) {
  return new WorldRenderer(viewport, options);
}
