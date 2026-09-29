import { getItem, isKnownItem } from '../data/items.js';

export function countItem(inventory, itemId) {
  return Math.max(0, Number(inventory?.stacks?.[itemId]) || 0);
}

export function getUsedSlots(inventory) {
  return Object.entries(inventory?.stacks ?? {}).reduce((slots, [itemId, amount]) => {
    const item = getItem(itemId);
    if (!item || amount <= 0) return slots;
    return slots + Math.ceil(amount / item.stackLimit);
  }, 0);
}

export function getFreeSlots(inventory) {
  return Math.max(0, (inventory?.capacity ?? 0) - getUsedSlots(inventory));
}

export function hasItems(inventory, requirements) {
  return Object.entries(requirements ?? {}).every(([itemId, amount]) => countItem(inventory, itemId) >= amount);
}

export function maxAddable(inventory, itemId) {
  const item = getItem(itemId);
  if (!item) return 0;
  const current = countItem(inventory, itemId);
  const partialSpace = current % item.stackLimit === 0 ? 0 : item.stackLimit - (current % item.stackLimit);
  return partialSpace + getFreeSlots(inventory) * item.stackLimit;
}

export function canAddItems(inventory, additions) {
  const simulated = { capacity: inventory.capacity, stacks: { ...inventory.stacks } };
  return Object.entries(additions ?? {}).every(([itemId, amount]) => addItem(simulated, itemId, amount).overflow === 0);
}

export function addItem(inventory, itemId, amount = 1) {
  if (!isKnownItem(itemId)) return { ok: false, reason: 'unknown_item', added: 0, overflow: amount };
  const requested = Math.max(0, Math.floor(Number(amount) || 0));
  const added = Math.min(requested, maxAddable(inventory, itemId));
  if (added > 0) inventory.stacks[itemId] = countItem(inventory, itemId) + added;
  return {
    ok: added === requested,
    reason: added === requested ? null : 'inventory_full',
    added,
    overflow: requested - added,
  };
}

export function addItems(inventory, additions, options = {}) {
  if (options.atomic !== false && !canAddItems(inventory, additions)) {
    return { ok: false, reason: 'inventory_full', added: {}, overflow: { ...additions } };
  }
  const added = {};
  const overflow = {};
  for (const [itemId, amount] of Object.entries(additions ?? {})) {
    const result = addItem(inventory, itemId, amount);
    if (result.added) added[itemId] = result.added;
    if (result.overflow) overflow[itemId] = result.overflow;
    if (result.reason === 'unknown_item') return { ok: false, reason: result.reason, added, overflow };
  }
  return { ok: Object.keys(overflow).length === 0, reason: Object.keys(overflow).length ? 'inventory_full' : null, added, overflow };
}

export function removeItem(inventory, itemId, amount = 1) {
  const requested = Math.max(0, Math.floor(Number(amount) || 0));
  if (countItem(inventory, itemId) < requested) {
    return { ok: false, reason: 'insufficient_items', removed: 0 };
  }
  const remaining = countItem(inventory, itemId) - requested;
  if (remaining > 0) inventory.stacks[itemId] = remaining;
  else delete inventory.stacks[itemId];
  return { ok: true, reason: null, removed: requested };
}

export function removeItems(inventory, requirements) {
  if (!hasItems(inventory, requirements)) return { ok: false, reason: 'insufficient_items', removed: {} };
  const removed = {};
  for (const [itemId, amount] of Object.entries(requirements ?? {})) {
    removeItem(inventory, itemId, amount);
    removed[itemId] = amount;
  }
  return { ok: true, reason: null, removed };
}

export function transferItems(fromInventory, toInventory, entries) {
  if (!hasItems(fromInventory, entries)) return { ok: false, reason: 'insufficient_items' };
  if (!canAddItems(toInventory, entries)) return { ok: false, reason: 'inventory_full' };
  removeItems(fromInventory, entries);
  addItems(toInventory, entries);
  return { ok: true, reason: null };
}

export function normalizeInventory(inventory) {
  inventory.capacity = Math.max(1, Math.floor(Number(inventory.capacity) || 1));
  inventory.stacks ??= {};
  for (const [itemId, amount] of Object.entries(inventory.stacks)) {
    const normalized = Math.max(0, Math.floor(Number(amount) || 0));
    if (!isKnownItem(itemId) || normalized === 0) delete inventory.stacks[itemId];
    else inventory.stacks[itemId] = normalized;
  }
  return inventory;
}
