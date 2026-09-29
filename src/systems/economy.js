import { CROP_LIST, getCrop } from '../data/crops.js';
import { BUILDING_LIST, getBuilding } from '../data/buildings.js';
import { RECIPE_LIST } from '../data/recipes.js';
import { getItem, ITEM_CATEGORIES } from '../data/items.js';
import { getQuest, recordQuestEvent } from '../data/quests.js';
import { addItems, canAddItems, countItem, hasItems, removeItem, removeItems } from './inventory.js';
import { markStateChanged } from '../game/state.js';
import { canPlaceBuilding } from './building.js';

const addUnique = (array, values) => {
  for (const value of values) if (!array.includes(value)) array.push(value);
};

export function gainExperience(state, amount) {
  let gained = Math.max(0, Math.floor(Number(amount) || 0));
  const levels = [];
  state.progression.xp += gained;
  while (state.progression.xp >= state.progression.xpToNext) {
    state.progression.xp -= state.progression.xpToNext;
    state.progression.level += 1;
    state.progression.xpToNext = Math.round(state.progression.xpToNext * 1.35);
    levels.push(state.progression.level);
  }
  if (levels.length) syncProgressionUnlocks(state);
  return { gained, levels, level: state.progression.level, xp: state.progression.xp };
}

export function syncProgressionUnlocks(state) {
  const level = state.progression.level;
  addUnique(state.progression.unlockedCrops, CROP_LIST.filter((crop) => crop.unlockLevel <= level).map((crop) => crop.id));
  addUnique(state.progression.unlockedBuildings, BUILDING_LIST.filter((building) => building.unlockLevel <= level).map((building) => building.id));
  addUnique(state.progression.unlockedRecipes, RECIPE_LIST.filter((recipe) => recipe.unlockLevel <= level).map((recipe) => recipe.id));
  return state.progression;
}

export function getSellMultiplier(state) {
  const marketMultipliers = Object.values(state.world.buildings)
    .filter((placed) => placed.complete)
    .map((placed) => getBuilding(placed.typeId)?.sellMultiplier ?? 1);
  return Math.max(1, ...marketMultipliers);
}

export function buyItem(state, itemId, quantity = 1) {
  const item = getItem(itemId);
  const amount = Math.max(1, Math.floor(Number(quantity) || 1));
  if (!item || item.buyPrice <= 0) return { ok: false, reason: 'not_for_sale' };
  if (item.category === ITEM_CATEGORIES.SEED && !state.progression.unlockedCrops.includes(item.cropId)) {
    return { ok: false, reason: 'crop_locked' };
  }
  const additions = { [itemId]: amount };
  if (!canAddItems(state.inventory, additions)) return { ok: false, reason: 'inventory_full' };
  const total = item.buyPrice * amount;
  if (state.money < total) return { ok: false, reason: 'insufficient_money', total };
  state.money -= total;
  addItems(state.inventory, additions);
  markStateChanged(state);
  return { ok: true, itemId, quantity: amount, total, money: state.money };
}

export function sellItem(state, itemId, quantity = 1) {
  const item = getItem(itemId);
  const amount = Math.max(1, Math.floor(Number(quantity) || 1));
  if (!item || item.sellPrice <= 0 || item.category === ITEM_CATEGORIES.TOOL) return { ok: false, reason: 'not_sellable' };
  if (countItem(state.inventory, itemId) < amount) return { ok: false, reason: 'insufficient_items' };
  const total = Math.max(1, Math.floor(item.sellPrice * amount * getSellMultiplier(state)));
  removeItem(state.inventory, itemId, amount);
  state.money += total;
  recordQuestEvent(state, 'money_earned', 'sale', total);
  markStateChanged(state);
  return { ok: true, itemId, quantity: amount, total, money: state.money };
}

export function unlockCrop(state, cropId, options = {}) {
  const crop = getCrop(cropId);
  if (!crop) return { ok: false, reason: 'unknown_crop' };
  if (state.progression.unlockedCrops.includes(cropId)) return { ok: false, reason: 'already_unlocked' };
  const price = options.price ?? crop.unlockLevel * 90;
  if (!options.free && state.money < price) return { ok: false, reason: 'insufficient_money', price };
  if (!options.free) state.money -= price;
  state.progression.unlockedCrops.push(cropId);
  markStateChanged(state);
  return { ok: true, cropId, price: options.free ? 0 : price };
}

export function unlockBuilding(state, buildingId, options = {}) {
  const building = getBuilding(buildingId);
  if (!building) return { ok: false, reason: 'unknown_building' };
  if (state.progression.unlockedBuildings.includes(buildingId)) return { ok: false, reason: 'already_unlocked' };
  const price = options.price ?? building.unlockLevel * 140;
  if (!options.free && state.money < price) return { ok: false, reason: 'insufficient_money', price };
  if (!options.free) state.money -= price;
  state.progression.unlockedBuildings.push(buildingId);
  markStateChanged(state);
  return { ok: true, buildingId, price: options.free ? 0 : price };
}

export function buyExpansion(state, options = {}) {
  const current = state.progression.expansions ?? 0;
  const price = options.price ?? 300 * (current + 1);
  if (!options.free && state.money < price) return { ok: false, reason: 'insufficient_money', price };
  const bounds = state.world.unlockedBounds;
  if (bounds.minX === 0 && bounds.minY === 0 && bounds.maxX === state.world.width - 1 && bounds.maxY === state.world.height - 1) {
    return { ok: false, reason: 'land_fully_unlocked' };
  }
  if (!options.free) state.money -= price;
  bounds.minX = Math.max(0, bounds.minX - 2);
  bounds.minY = Math.max(0, bounds.minY - 2);
  bounds.maxX = Math.min(state.world.width - 1, bounds.maxX + 2);
  bounds.maxY = Math.min(state.world.height - 1, bounds.maxY + 2);
  state.progression.expansions = current + 1;
  recordQuestEvent(state, 'land_expanded');
  markStateChanged(state);
  return { ok: true, price: options.free ? 0 : price, bounds: { ...bounds } };
}

export function upgradeHouse(state, options = {}) {
  const home = Object.values(state.world.buildings).find((placed) => getBuilding(placed.typeId)?.category === 'home');
  if (!home) return { ok: false, reason: 'home_not_found' };
  if (!home.complete) return { ok: false, reason: 'construction_in_progress' };
  const current = getBuilding(home.typeId);
  if (!current.upgradeTo) return { ok: false, reason: 'max_upgrade' };
  const next = getBuilding(current.upgradeTo);
  if (!options.free && state.progression.level < next.unlockLevel) {
    return { ok: false, reason: 'house_upgrade_locked', requiredLevel: next.unlockLevel };
  }
  const placement = canPlaceBuilding(state, next.id, home.x, home.y, home.rotation, {
    ignoreBuildingId: home.id,
    ignorePlayer: true,
    ignoreUnlock: true,
  });
  if (!placement.ok) return { ok: false, reason: 'upgrade_space_blocked', placementReason: placement.reason };
  if (!options.free && !hasItems(state.inventory, next.cost)) return { ok: false, reason: 'insufficient_items', cost: next.cost };
  if (!options.free) removeItems(state.inventory, next.cost);
  if (current.storageBonus) state.inventory.capacity = Math.max(1, state.inventory.capacity - current.storageBonus);
  home.typeId = next.id;
  home.complete = options.instant === true;
  home.buildRemaining = home.complete ? 0 : next.buildMinutes;
  home.completionApplied = false;
  if (home.complete && next.storageBonus) {
    state.inventory.capacity += next.storageBonus;
    home.completionApplied = true;
  }
  state.progression.houseLevel += 1;
  addUnique(state.progression.unlockedBuildings, [next.id]);
  recordQuestEvent(state, 'house_upgraded', next.id);
  markStateChanged(state);
  return { ok: true, building: home, cost: options.free ? {} : next.cost };
}

export function claimQuestReward(state, questId) {
  const quest = getQuest(questId);
  if (!quest) return { ok: false, reason: 'quest_not_found' };
  if (!state.quests.completed.includes(questId)) return { ok: false, reason: 'quest_incomplete' };
  if (state.quests.claimed.includes(questId)) return { ok: false, reason: 'already_claimed' };
  const rewardItems = quest.rewards.items ?? {};
  if (!canAddItems(state.inventory, rewardItems)) return { ok: false, reason: 'inventory_full' };
  if (quest.rewards.money) state.money += quest.rewards.money;
  if (quest.rewards.xp) gainExperience(state, quest.rewards.xp);
  addItems(state.inventory, rewardItems);
  addUnique(state.progression.unlockedCrops, quest.rewards.unlockCrops ?? []);
  addUnique(state.progression.unlockedBuildings, quest.rewards.unlockBuildings ?? []);
  state.quests.claimed.push(questId);
  markStateChanged(state);
  return { ok: true, rewards: quest.rewards };
}
