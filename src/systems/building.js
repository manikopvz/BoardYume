import { getBuilding, getFootprint } from '../data/buildings.js';
import { addItems, getUsedSlots, hasItems, removeItems } from './inventory.js';
import { allocateEntityId, isInsideUnlockedWorld, markStateChanged } from '../game/state.js';
import { recordQuestEvent } from '../data/quests.js';
import { getTile } from './farming.js';

export function getBuildingCells(definition, x, y, rotation = 0) {
  const footprint = getFootprint(definition, rotation);
  const cells = [];
  for (let offsetY = 0; offsetY < footprint.height; offsetY += 1) {
    for (let offsetX = 0; offsetX < footprint.width; offsetX += 1) {
      cells.push({ x: x + offsetX, y: y + offsetY });
    }
  }
  return cells;
}

export function getPlacedBuildingAt(state, x, y, ignoredBuildingId = null) {
  return Object.values(state.world.buildings).find((placed) => {
    if (placed.id === ignoredBuildingId) return false;
    const definition = getBuilding(placed.typeId);
    return definition && getBuildingCells(definition, placed.x, placed.y, placed.rotation)
      .some((cell) => cell.x === x && cell.y === y);
  }) ?? null;
}

export function canPlaceBuilding(state, typeId, x, y, rotation = 0, options = {}) {
  const definition = getBuilding(typeId);
  if (!definition) return { ok: false, reason: 'unknown_building', cells: [] };
  if (!options.ignoreUnlock && !state.progression.unlockedBuildings.includes(typeId) && definition.unlockLevel > state.progression.level) {
    return { ok: false, reason: 'building_locked', cells: [] };
  }
  if (!Number.isInteger(x) || !Number.isInteger(y)) return { ok: false, reason: 'invalid_position', cells: [] };
  if (definition.category === 'home' && Object.values(state.world.buildings).some((building) => building.id !== options.ignoreBuildingId && getBuilding(building.typeId)?.category === 'home')) {
    return { ok: false, reason: 'home_already_exists', cells: [] };
  }
  const normalizedRotation = definition.rotatable ? ((rotation % 360) + 360) % 360 : 0;
  const cells = getBuildingCells(definition, x, y, normalizedRotation);
  for (const cell of cells) {
    if (!isInsideUnlockedWorld(state, cell.x, cell.y)) return { ok: false, reason: 'outside_unlocked_land', cells };
    const tile = getTile(state, cell.x, cell.y);
    if (tile?.crop || tile?.terrain === 'tilled') return { ok: false, reason: 'farmland_blocked', cells };
    if (tile?.terrain === 'water' && typeId !== 'bridge') return { ok: false, reason: 'water_blocked', cells };
    if (tile?.terrain !== 'water' && typeId === 'bridge') return { ok: false, reason: 'bridge_requires_water', cells };
    if (Object.values(state.world.nodes).some((node) => node.active && node.x === cell.x && node.y === cell.y)) {
      return { ok: false, reason: 'resource_node_blocked', cells };
    }
    if (getPlacedBuildingAt(state, cell.x, cell.y, options.ignoreBuildingId)) {
      return { ok: false, reason: 'building_overlap', cells };
    }
    const playerX = Math.floor(state.player.x);
    const playerY = Math.floor(state.player.y);
    if (!options.ignorePlayer && cell.x === playerX && cell.y === playerY) {
      return { ok: false, reason: 'player_blocked', cells };
    }
  }
  return { ok: true, reason: null, cells, rotation: normalizedRotation };
}

export function placeBuilding(state, typeId, x, y, rotation = 0, options = {}) {
  const definition = getBuilding(typeId);
  const placement = canPlaceBuilding(state, typeId, x, y, rotation, options);
  if (!placement.ok) return placement;
  if (!options.free && !hasItems(state.inventory, definition.cost)) return { ok: false, reason: 'insufficient_items', cells: placement.cells };
  if (!options.free) removeItems(state.inventory, definition.cost);
  const id = allocateEntityId(state, 'building');
  const complete = options.instant === true || definition.buildMinutes <= 0;
  const placed = {
    id,
    typeId,
    x,
    y,
    rotation: placement.rotation,
    complete,
    buildRemaining: complete ? 0 : definition.buildMinutes,
    production: { queue: [], pendingOutput: {} },
  };
  state.world.buildings[id] = placed;
  if (complete) completeBuilding(state, placed);
  markStateChanged(state);
  return { ok: true, building: placed, cells: placement.cells };
}

function completeBuilding(state, placed) {
  const definition = getBuilding(placed.typeId);
  if (!definition || placed.completionApplied) return;
  placed.complete = true;
  placed.buildRemaining = 0;
  placed.completionApplied = true;
  if (definition.storageBonus) state.inventory.capacity += definition.storageBonus;
  recordQuestEvent(state, 'building_completed', placed.typeId);
}

export function updateConstruction(state, elapsedGameMinutes) {
  let remainingElapsed = Math.max(0, Number(elapsedGameMinutes) || 0);
  const completed = [];
  if (remainingElapsed === 0) return completed;
  for (const placed of Object.values(state.world.buildings)) {
    if (placed.complete) continue;
    placed.buildRemaining = Math.max(0, placed.buildRemaining - remainingElapsed);
    if (placed.buildRemaining === 0) {
      completeBuilding(state, placed);
      completed.push(placed.id);
    }
  }
  return completed;
}

export function moveBuilding(state, buildingId, x, y, rotation = null) {
  const placed = state.world.buildings[buildingId];
  if (!placed) return { ok: false, reason: 'building_not_found' };
  const definition = getBuilding(placed.typeId);
  if (!definition.movable) return { ok: false, reason: 'building_immovable' };
  if (!placed.complete) return { ok: false, reason: 'construction_in_progress' };
  const nextRotation = rotation === null ? placed.rotation : rotation;
  const placement = canPlaceBuilding(state, placed.typeId, x, y, nextRotation, { ignoreBuildingId: buildingId });
  if (!placement.ok) return placement;
  placed.x = x;
  placed.y = y;
  placed.rotation = placement.rotation;
  markStateChanged(state);
  return { ok: true, building: placed, cells: placement.cells };
}

export function rotateBuilding(state, buildingId) {
  const placed = state.world.buildings[buildingId];
  if (!placed) return { ok: false, reason: 'building_not_found' };
  return moveBuilding(state, buildingId, placed.x, placed.y, placed.rotation + 90);
}

export function demolishBuilding(state, buildingId, options = {}) {
  const placed = state.world.buildings[buildingId];
  if (!placed) return { ok: false, reason: 'building_not_found' };
  const definition = getBuilding(placed.typeId);
  if (definition.category === 'home') return { ok: false, reason: 'cannot_demolish_home' };
  const refundRate = options.refundRate ?? definition.demolishRefundRate;
  const refund = Object.fromEntries(Object.entries(definition.cost)
    .map(([itemId, amount]) => [itemId, Math.floor(amount * refundRate)])
    .filter(([, amount]) => amount > 0));
  const returned = addItems(state.inventory, refund, { atomic: false });
  if (placed.complete && placed.completionApplied && definition.storageBonus) {
    state.inventory.capacity = Math.max(getUsedSlots(state.inventory), state.inventory.capacity - definition.storageBonus);
  }
  delete state.world.buildings[buildingId];
  markStateChanged(state);
  return { ok: true, refund: returned.added, overflow: returned.overflow };
}

export function cancelConstruction(state, buildingId) {
  const placed = state.world.buildings[buildingId];
  if (!placed) return { ok: false, reason: 'building_not_found' };
  if (placed.complete) return { ok: false, reason: 'already_complete' };
  const definition = getBuilding(placed.typeId);
  const refund = addItems(state.inventory, definition.cost, { atomic: false });
  delete state.world.buildings[buildingId];
  markStateChanged(state);
  return { ok: true, refund: refund.added, overflow: refund.overflow };
}
