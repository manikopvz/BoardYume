const stages = (id) => Object.freeze([
  `${id}-sown`,
  `${id}-sprout`,
  `${id}-young`,
  `${id}-mature`,
  `${id}-harvest`,
]);

const defineCrop = (id, name, growthMinutes, yieldRange, unlockLevel, extra = {}) => Object.freeze({
  id,
  name,
  seedItemId: `${id}_seed`,
  produceItemId: id,
  growthMinutes,
  stageCount: 5,
  stageSpriteKeys: stages(id),
  yield: Object.freeze({ min: yieldRange[0], max: yieldRange[1] }),
  waterRequiredPerStage: true,
  unlockLevel,
  regrows: false,
  regrowMinutes: 0,
  xp: 5 + unlockLevel * 2,
  ...extra,
});

export const CROPS = Object.freeze({
  carrot: defineCrop('carrot', 'Cà rốt', 9, [1, 2], 1),
  wheat: defineCrop('wheat', 'Lúa mì', 8, [2, 3], 1),
  potato: defineCrop('potato', 'Khoai tây', 12, [2, 4], 1),
  tomato: defineCrop('tomato', 'Cà chua', 15, [2, 3], 2, { regrows: true, regrowMinutes: 7 }),
  cabbage: defineCrop('cabbage', 'Bắp cải', 17, [1, 2], 2),
  corn: defineCrop('corn', 'Ngô', 20, [2, 4], 3, { regrows: true, regrowMinutes: 9 }),
  strawberry: defineCrop('strawberry', 'Dâu tây', 22, [2, 4], 3, { regrows: true, regrowMinutes: 8 }),
  eggplant: defineCrop('eggplant', 'Cà tím', 24, [2, 3], 4, { regrows: true, regrowMinutes: 9 }),
  sunflower: defineCrop('sunflower', 'Hướng dương', 26, [2, 3], 4),
  blueberry: defineCrop('blueberry', 'Việt quất', 30, [3, 5], 5, { regrows: true, regrowMinutes: 10 }),
  pumpkin: defineCrop('pumpkin', 'Bí ngô', 34, [1, 2], 5),
  watermelon: defineCrop('watermelon', 'Dưa hấu', 38, [1, 2], 6),
});

export const CROP_LIST = Object.freeze(Object.values(CROPS));

export function getCrop(cropId) {
  return CROPS[cropId] ?? null;
}

export function getUnlockedCrops(level, explicitlyUnlocked = []) {
  const explicit = new Set(explicitlyUnlocked);
  return CROP_LIST.filter((crop) => crop.unlockLevel <= level || explicit.has(crop.id));
}

export function getCropStage(crop, wateredGrowthMinutes) {
  if (!crop) return 0;
  const progress = Math.max(0, Math.min(1, wateredGrowthMinutes / crop.growthMinutes));
  return Math.min(crop.stageCount - 1, Math.floor(progress * crop.stageCount));
}
