import { GAME_STATE_VERSION, createInitialState } from '../game/state.js';
import { normalizeInventory } from '../systems/inventory.js';

export const SAVE_VERSION = GAME_STATE_VERSION;
export const DEFAULT_SAVE_KEY = 'board-yume-save';

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function mergeKnownShape(base, saved) {
  if (Array.isArray(base)) return Array.isArray(saved) ? [...saved] : [...base];
  if (!isRecord(base)) return saved === undefined ? base : saved;
  const output = { ...base };
  if (!isRecord(saved)) return output;
  for (const key of Object.keys(base)) {
    if (saved[key] === undefined) continue;
    output[key] = mergeKnownShape(base[key], saved[key]);
  }
  return output;
}

function migrateV0ToV1(data) {
  const migrated = { ...data, version: 1 };
  if (!migrated.inventory) migrated.inventory = { capacity: 24, stacks: { ...(migrated.resources ?? {}) } };
  delete migrated.resources;
  return migrated;
}

function migrateV1ToV2(data) {
  const migrated = { ...data, version: 2, world: { ...(data.world ?? {}) } };
  if (Array.isArray(migrated.world.crops)) {
    migrated.world.tiles = { ...(migrated.world.tiles ?? {}) };
    for (const crop of migrated.world.crops) {
      if (!Number.isInteger(crop.x) || !Number.isInteger(crop.y)) continue;
      migrated.world.tiles[`${crop.x},${crop.y}`] = {
        x: crop.x,
        y: crop.y,
        terrain: 'tilled',
        watered: Boolean(crop.watered),
        crop: {
          cropId: crop.cropId ?? crop.type,
          stage: crop.stage ?? 0,
          stageProgress: crop.stageProgress ?? 0,
          totalGrowth: crop.totalGrowth ?? 0,
          harvestable: Boolean(crop.harvestable),
          plantedAt: crop.plantedAt ?? 0,
        },
      };
    }
    delete migrated.world.crops;
  }
  return migrated;
}

function migrateV2ToV3(data) {
  const migrated = { ...data, version: 3 };
  migrated.world = { ...(migrated.world ?? {}), buildings: { ...(migrated.world?.buildings ?? {}) } };
  for (const building of Object.values(migrated.world.buildings)) {
    building.production ??= { queue: [], pendingOutput: {} };
  }
  return migrated;
}

export function migrateSaveData(input) {
  if (!isRecord(input)) throw new TypeError('Save data must be an object');
  let data = typeof structuredClone === 'function' ? structuredClone(input) : JSON.parse(JSON.stringify(input));
  let version = Number.isInteger(data.version) ? data.version : 0;
  if (version > SAVE_VERSION) throw new Error('Save data is from a newer game version');
  if (version < 1) { data = migrateV0ToV1(data); version = 1; }
  if (version < 2) { data = migrateV1ToV2(data); version = 2; }
  if (version < 3) { data = migrateV2ToV3(data); version = 3; }
  return data;
}

export function hydrateGameState(saved, options = {}) {
  const migrated = migrateSaveData(saved);
  const base = createInitialState({ now: options.now ?? Date.now() });
  const state = mergeKnownShape(base, migrated);
  if (isRecord(migrated.inventory?.stacks)) state.inventory.stacks = { ...migrated.inventory.stacks };
  if (isRecord(migrated.world?.tiles)) state.world.tiles = { ...migrated.world.tiles };
  if (isRecord(migrated.world?.nodes)) state.world.nodes = { ...migrated.world.nodes };
  if (isRecord(migrated.world?.buildings)) state.world.buildings = { ...migrated.world.buildings };
  if (isRecord(migrated.quests?.progress)) state.quests.progress = { ...migrated.quests.progress };
  state.version = SAVE_VERSION;
  normalizeInventory(state.inventory);
  state.meta.updatedAt = options.now ?? Date.now();
  state.meta.nextEntityId = Math.max(1, Number(state.meta.nextEntityId) || 1);
  state.money = Math.max(0, Number(state.money) || 0);
  return state;
}

export function serializeGameState(state) {
  return JSON.stringify({ ...state, version: SAVE_VERSION });
}

export function deserializeGameState(serialized, options = {}) {
  if (typeof serialized !== 'string' || serialized.length === 0) throw new TypeError('Serialized save must be a non-empty string');
  return hydrateGameState(JSON.parse(serialized), options);
}

export function getDefaultStorage() {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function saveGame(state, storage = getDefaultStorage(), key = DEFAULT_SAVE_KEY) {
  if (!storage?.setItem) return { ok: false, reason: 'storage_unavailable' };
  try {
    state.meta.updatedAt = Date.now();
    storage.setItem(key, serializeGameState(state));
    return { ok: true, key, savedAt: state.meta.updatedAt };
  } catch (error) {
    return { ok: false, reason: 'storage_write_failed', error };
  }
}

export function loadGame(storage = getDefaultStorage(), key = DEFAULT_SAVE_KEY, options = {}) {
  if (!storage?.getItem) return { ok: false, reason: 'storage_unavailable', state: null };
  try {
    const serialized = storage.getItem(key);
    if (!serialized) return { ok: false, reason: 'save_not_found', state: null };
    return { ok: true, reason: null, state: deserializeGameState(serialized, options) };
  } catch (error) {
    return { ok: false, reason: 'save_corrupt', state: null, error };
  }
}

export function deleteSave(storage = getDefaultStorage(), key = DEFAULT_SAVE_KEY) {
  if (!storage?.removeItem) return { ok: false, reason: 'storage_unavailable' };
  try {
    storage.removeItem(key);
    return { ok: true, key };
  } catch (error) {
    return { ok: false, reason: 'storage_delete_failed', error };
  }
}

export function loadOrCreateGame(storage = getDefaultStorage(), key = DEFAULT_SAVE_KEY, options = {}) {
  const loaded = loadGame(storage, key, options);
  return loaded.ok ? loaded : { ok: true, reason: 'new_game', state: createInitialState(options) };
}

export function createAutosaveController(getState, options = {}) {
  const storage = options.storage ?? getDefaultStorage();
  const key = options.key ?? DEFAULT_SAVE_KEY;
  const intervalMs = Math.max(5000, options.intervalMs ?? 30000);
  let timer = null;
  return {
    start() {
      if (timer !== null || typeof setInterval !== 'function') return;
      timer = setInterval(() => saveGame(getState(), storage, key), intervalMs);
    },
    stop() {
      if (timer !== null && typeof clearInterval === 'function') clearInterval(timer);
      timer = null;
    },
    saveNow() {
      return saveGame(getState(), storage, key);
    },
    get running() {
      return timer !== null;
    },
  };
}
