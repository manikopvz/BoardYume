import { getCrop, getCropStage } from '../data/crops.js';
import { getFootprint, getBuilding } from '../data/buildings.js';
import { addItem, canAddItems, countItem, removeItem } from './inventory.js';
import { isInsideUnlockedWorld, markStateChanged } from '../game/state.js';
import { recordQuestEvent } from '../data/quests.js';

export const tileKey = (x, y) => `${x},${y}`;

export function getTile(state, x, y) {
  return state.world.tiles[tileKey(x, y)] ?? null;
}

function cellHasObstacle(state, x, y) {
  const nodeBlocks = Object.values(state.world.nodes).some((node) => node.active && node.x === x && node.y === y);
  if (nodeBlocks) return true;
  return Object.values(state.world.buildings).some((placed) => {
    const definition = getBuilding(placed.typeId);
    if (!definition) return false;
    const footprint = getFootprint(definition, placed.rotation);
    return x >= placed.x && x < placed.x + footprint.width && y >= placed.y && y < placed.y + footprint.height;
  });
}

export function tillTile(state, x, y) {
  if (!isInsideUnlockedWorld(state, x, y)) return { ok: false, reason: 'outside_unlocked_land' };
  if (cellHasObstacle(state, x, y)) return { ok: false, reason: 'tile_blocked' };
  if (countItem(state.inventory, 'hoe') < 1) return { ok: false, reason: 'tool_required' };
  const key = tileKey(x, y);
  const current = state.world.tiles[key];
  if (current?.crop) return { ok: false, reason: 'crop_present' };
  if (current?.terrain === 'tilled') return { ok: false, reason: 'already_tilled' };
  if (current && current.terrain !== 'grass') return { ok: false, reason: `${current.terrain}_blocked` };
  state.world.tiles[key] = { x, y, terrain: 'tilled', watered: false, crop: null };
  recordQuestEvent(state, 'tile_tilled');
  markStateChanged(state);
  return { ok: true, tile: state.world.tiles[key] };
}

export function plantCrop(state, x, y, cropId) {
  const crop = getCrop(cropId);
  if (!crop) return { ok: false, reason: 'unknown_crop' };
  if (!state.progression.unlockedCrops.includes(cropId) && crop.unlockLevel > state.progression.level) {
    return { ok: false, reason: 'crop_locked' };
  }
  const tile = getTile(state, x, y);
  if (!tile || tile.terrain !== 'tilled') return { ok: false, reason: 'soil_not_tilled' };
  if (tile.crop) return { ok: false, reason: 'tile_occupied' };
  if (countItem(state.inventory, crop.seedItemId) < 1) return { ok: false, reason: 'seed_required' };
  removeItem(state.inventory, crop.seedItemId, 1);
  tile.crop = {
    cropId,
    stage: 0,
    stageProgress: 0,
    totalGrowth: 0,
    harvestable: false,
    plantedAt: state.time.totalMinutes,
  };
  tile.watered = false;
  recordQuestEvent(state, 'crop_planted', cropId);
  markStateChanged(state);
  return { ok: true, tile, crop: tile.crop };
}

export function waterTile(state, x, y, options = {}) {
  const tile = getTile(state, x, y);
  if (!tile || tile.terrain !== 'tilled') return { ok: false, reason: 'soil_not_tilled' };
  if (tile.watered) return { ok: false, reason: 'already_watered' };
  if (countItem(state.inventory, 'watering_can') < 1) return { ok: false, reason: 'tool_required' };
  if (!options.free && countItem(state.inventory, 'water') < 1) return { ok: false, reason: 'water_required' };
  if (!options.free) removeItem(state.inventory, 'water', 1);
  tile.watered = true;
  tile.wateredAt = state.time.totalMinutes;
  if (tile.crop) recordQuestEvent(state, 'crop_watered', tile.crop.cropId);
  markStateChanged(state);
  return { ok: true, tile };
}

export function updateCrops(state, elapsedGameMinutes) {
  const elapsed = Math.max(0, Number(elapsedGameMinutes) || 0);
  const changed = [];
  if (elapsed === 0) return changed;
  for (const [key, tile] of Object.entries(state.world.tiles)) {
    if (!tile.crop || tile.crop.harvestable || !tile.watered) continue;
    const definition = getCrop(tile.crop.cropId);
    if (!definition) continue;
    const minutesPerStage = definition.growthMinutes / (definition.stageCount - 1);
    const needed = minutesPerStage - tile.crop.stageProgress;
    const consumed = Math.min(elapsed, needed);
    tile.crop.stageProgress += consumed;
    tile.crop.totalGrowth += consumed;
    if (tile.crop.stageProgress + Number.EPSILON >= minutesPerStage) {
      tile.crop.stage = Math.min(definition.stageCount - 1, tile.crop.stage + 1);
      tile.crop.stageProgress = 0;
      tile.watered = false;
      tile.crop.harvestable = tile.crop.stage === definition.stageCount - 1;
      changed.push(key);
    } else {
      const computedStage = getCropStage(definition, tile.crop.totalGrowth);
      tile.crop.stage = Math.max(tile.crop.stage, computedStage);
    }
  }
  return changed;
}

export function harvestCrop(state, x, y, rng = Math.random) {
  const tile = getTile(state, x, y);
  if (!tile?.crop) return { ok: false, reason: 'no_crop' };
  if (!tile.crop.harvestable) return { ok: false, reason: 'not_ready' };
  const definition = getCrop(tile.crop.cropId);
  if (!definition) return { ok: false, reason: 'unknown_crop' };
  const roll = Math.min(0.999999, Math.max(0, Number(rng()) || 0));
  const amount = definition.yield.min + Math.floor(roll * (definition.yield.max - definition.yield.min + 1));
  if (!canAddItems(state.inventory, { [definition.produceItemId]: amount })) return { ok: false, reason: 'inventory_full' };
  const addResult = addItem(state.inventory, definition.produceItemId, amount);
  if (definition.regrows) {
    tile.crop.stage = Math.max(1, definition.stageCount - 2);
    tile.crop.stageProgress = 0;
    tile.crop.totalGrowth = definition.growthMinutes - definition.regrowMinutes;
    tile.crop.harvestable = false;
    tile.watered = false;
  } else {
    tile.crop = null;
    tile.watered = false;
  }
  recordQuestEvent(state, 'crop_harvested', definition.id, addResult.added);
  markStateChanged(state);
  return { ok: true, itemId: definition.produceItemId, amount: addResult.added, overflow: 0 };
}

export function clearCrop(state, x, y) {
  const tile = getTile(state, x, y);
  if (!tile?.crop) return { ok: false, reason: 'no_crop' };
  tile.crop = null;
  tile.watered = false;
  markStateChanged(state);
  return { ok: true };
}
