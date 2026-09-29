import { getRecipe } from '../data/recipes.js';
import { getBuilding } from '../data/buildings.js';
import { getItem, ITEM_CATEGORIES } from '../data/items.js';
import { addItems, hasItems, removeItems } from './inventory.js';
import { allocateEntityId, markStateChanged } from '../game/state.js';
import { recordQuestEvent } from '../data/quests.js';

const multiplyEntries = (entries, multiplier) => Object.fromEntries(
  Object.entries(entries).map(([itemId, amount]) => [itemId, amount * multiplier]),
);

export function startCrafting(state, buildingId, recipeId, batches = 1) {
  const placed = state.world.buildings[buildingId];
  if (!placed) return { ok: false, reason: 'building_not_found' };
  if (!placed.complete) return { ok: false, reason: 'construction_in_progress' };
  const definition = getBuilding(placed.typeId);
  const recipe = getRecipe(recipeId);
  if (!recipe) return { ok: false, reason: 'unknown_recipe' };
  if (recipe.station !== placed.typeId || !definition.recipeIds?.includes(recipeId)) return { ok: false, reason: 'wrong_station' };
  if (recipe.unlockLevel > state.progression.level && !state.progression.unlockedRecipes.includes(recipeId)) {
    return { ok: false, reason: 'recipe_locked' };
  }
  const normalizedBatches = Math.max(1, Math.min(99, Math.floor(Number(batches) || 1)));
  const inputs = multiplyEntries(recipe.inputs, normalizedBatches);
  if (!hasItems(state.inventory, inputs)) return { ok: false, reason: 'insufficient_items' };
  removeItems(state.inventory, inputs);
  placed.production ??= { queue: [], pendingOutput: {} };
  placed.production.queue ??= [];
  const job = {
    id: allocateEntityId(state, 'craft'),
    recipeId,
    batches: normalizedBatches,
    duration: recipe.durationMinutes * normalizedBatches,
    remaining: recipe.durationMinutes * normalizedBatches,
    startedAt: state.time.totalMinutes,
  };
  placed.production.queue.push(job);
  markStateChanged(state);
  return { ok: true, job };
}

function finishJob(state, placed, job) {
  const recipe = getRecipe(job.recipeId);
  if (!recipe) return { outputs: {}, overflow: {} };
  const outputs = multiplyEntries(recipe.outputs, job.batches);
  const result = addItems(state.inventory, outputs, { atomic: false });
  placed.production.pendingOutput ??= {};
  for (const [itemId, amount] of Object.entries(result.overflow)) {
    placed.production.pendingOutput[itemId] = (placed.production.pendingOutput[itemId] ?? 0) + amount;
  }
  for (const [itemId, amount] of Object.entries(outputs)) {
    recordQuestEvent(state, 'item_crafted', itemId, amount);
    if (getItem(itemId)?.category === ITEM_CATEGORIES.PRODUCT) recordQuestEvent(state, 'item_crafted', 'product', amount);
  }
  return { outputs: result.added, overflow: result.overflow };
}

export function updateCrafting(state, elapsedGameMinutes) {
  const elapsed = Math.max(0, Number(elapsedGameMinutes) || 0);
  const completed = [];
  if (elapsed === 0) return completed;
  for (const placed of Object.values(state.world.buildings)) {
    if (!placed.complete || !placed.production?.queue?.length) continue;
    let available = elapsed;
    while (available > 0 && placed.production.queue.length) {
      const job = placed.production.queue[0];
      const consumed = Math.min(available, job.remaining);
      job.remaining -= consumed;
      available -= consumed;
      if (job.remaining <= Number.EPSILON) {
        placed.production.queue.shift();
        const result = finishJob(state, placed, job);
        completed.push({ buildingId: placed.id, jobId: job.id, recipeId: job.recipeId, ...result });
      }
    }
  }
  return completed;
}

export function claimCrafting(state, buildingId) {
  const placed = state.world.buildings[buildingId];
  if (!placed) return { ok: false, reason: 'building_not_found' };
  const pending = placed.production?.pendingOutput ?? {};
  if (Object.keys(pending).length === 0) return { ok: false, reason: 'nothing_to_claim' };
  const result = addItems(state.inventory, pending, { atomic: false });
  placed.production.pendingOutput = result.overflow;
  markStateChanged(state);
  return { ok: Object.keys(result.added).length > 0, reason: Object.keys(result.added).length ? null : 'inventory_full', claimed: result.added, remaining: result.overflow };
}

export function cancelCrafting(state, buildingId, jobId) {
  const placed = state.world.buildings[buildingId];
  const index = placed?.production?.queue?.findIndex((job) => job.id === jobId) ?? -1;
  if (index < 0) return { ok: false, reason: 'job_not_found' };
  const [job] = placed.production.queue.splice(index, 1);
  const recipe = getRecipe(job.recipeId);
  const unprocessedRatio = job.duration > 0 ? job.remaining / job.duration : 0;
  const refund = Object.fromEntries(Object.entries(multiplyEntries(recipe.inputs, job.batches))
    .map(([itemId, amount]) => [itemId, Math.floor(amount * unprocessedRatio)])
    .filter(([, amount]) => amount > 0));
  const returned = addItems(state.inventory, refund, { atomic: false });
  markStateChanged(state);
  return { ok: true, refund: returned.added, overflow: returned.overflow };
}
