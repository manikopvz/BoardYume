const cost = (entries) => Object.freeze(entries);

const defineBuilding = (id, name, category, width, height, buildCost, unlockLevel, extra = {}) => Object.freeze({
  id,
  name,
  category,
  footprint: Object.freeze({ width, height }),
  cost: cost(buildCost),
  unlockLevel,
  buildMinutes: Math.max(1, width * height * 2),
  rotatable: true,
  movable: true,
  demolishRefundRate: 0.5,
  spriteKey: `building-${id}`,
  constructionSpriteKey: `building-${id}-construction`,
  shadowSpriteKey: `building-${id}-shadow`,
  ...extra,
});

export const BUILDINGS = Object.freeze({
  cottage: defineBuilding('cottage', 'Nhà vườn', 'home', 3, 3, { wood: 20, stone: 10 }, 1, {
    rotatable: false,
    movable: false,
    storageBonus: 24,
    upgradeTo: 'homestead',
  }),
  homestead: defineBuilding('homestead', 'Nhà ấm áp', 'home', 4, 3, { plank: 18, stone_block: 8, metal_ingot: 3 }, 4, {
    rotatable: false,
    movable: false,
    storageBonus: 40,
    upgradeFrom: 'cottage',
    upgradeTo: 'garden_manor',
  }),
  garden_manor: defineBuilding('garden_manor', 'Trang viên vườn', 'home', 4, 4, { plank: 28, stone_block: 18, glass: 10 }, 7, {
    rotatable: false,
    movable: false,
    storageBonus: 64,
    upgradeFrom: 'homestead',
  }),
  storage: defineBuilding('storage', 'Nhà kho', 'utility', 2, 2, { wood: 14, stone: 6 }, 1, { storageBonus: 36 }),
  sawmill: defineBuilding('sawmill', 'Xưởng gỗ', 'production', 3, 2, { wood: 20, stone: 8 }, 2, { recipeIds: ['plank', 'rope'] }),
  masonry: defineBuilding('masonry', 'Xưởng đá', 'production', 3, 2, { wood: 12, stone: 24 }, 2, { recipeIds: ['stone_block'] }),
  well: defineBuilding('well', 'Giếng nước', 'utility', 2, 2, { stone: 18, wood: 6 }, 2, { waterPerDay: 12 }),
  windmill: defineBuilding('windmill', 'Cối xay', 'production', 3, 3, { plank: 18, stone_block: 10 }, 3, { recipeIds: ['flour'] }),
  greenhouse: defineBuilding('greenhouse', 'Nhà kính', 'farming', 4, 3, { plank: 20, glass: 14, metal_ingot: 4 }, 5, { growthMultiplier: 1.25 }),
  coop: defineBuilding('coop', 'Chuồng nhỏ', 'farming', 3, 2, { plank: 15, fiber: 12, stone: 8 }, 3, { dailyProduct: { itemId: 'fiber', quantity: 3 } }),
  kitchen: defineBuilding('kitchen', 'Bếp chế biến', 'production', 3, 2, { plank: 14, stone_block: 8, metal_ingot: 2 }, 4, {
    recipeIds: ['bread', 'tomato_soup', 'vegetable_stew', 'berry_jam', 'apple_preserve', 'lavender_oil'],
  }),
  market: defineBuilding('market', 'Quầy chợ', 'commerce', 3, 2, { plank: 16, fiber: 10 }, 3, { sellMultiplier: 1.12 }),
  smelter: defineBuilding('smelter', 'Lò luyện', 'production', 3, 2, { stone_block: 12, ore: 10, coal: 6 }, 4, {
    recipeIds: ['metal_ingot', 'glass'],
  }),
  bridge: defineBuilding('bridge', 'Cầu gỗ', 'path', 2, 1, { plank: 8, rope: 2 }, 3, { buildMinutes: 4 }),
  fence: defineBuilding('fence', 'Hàng rào', 'decoration', 1, 1, { wood: 2 }, 1, { buildMinutes: 1 }),
  gate: defineBuilding('gate', 'Cổng vườn', 'decoration', 1, 1, { wood: 4, metal_ingot: 1 }, 2, { buildMinutes: 2 }),
  garden_lamp: defineBuilding('garden_lamp', 'Đèn vườn', 'decoration', 1, 1, { metal_ingot: 1, glass: 1 }, 4, { buildMinutes: 2 }),
  bench: defineBuilding('bench', 'Ghế gỗ', 'decoration', 2, 1, { plank: 3 }, 2, { buildMinutes: 2 }),
  signpost: defineBuilding('signpost', 'Biển chỉ dẫn', 'decoration', 1, 1, { wood: 3 }, 1, { buildMinutes: 1 }),
  flower_arch: defineBuilding('flower_arch', 'Cổng hoa', 'decoration', 2, 1, { plank: 4, fiber: 8, sunflower: 3 }, 4, { buildMinutes: 3 }),
});

export const BUILDING_LIST = Object.freeze(Object.values(BUILDINGS));

export function getBuilding(buildingId) {
  return BUILDINGS[buildingId] ?? null;
}

export function getUnlockedBuildings(level, explicitlyUnlocked = []) {
  const explicit = new Set(explicitlyUnlocked);
  return BUILDING_LIST.filter((building) => building.unlockLevel <= level || explicit.has(building.id));
}

export function getFootprint(building, rotation = 0) {
  const quarterTurns = ((Math.round(rotation / 90) % 4) + 4) % 4;
  return quarterTurns % 2 === 1
    ? { width: building.footprint.height, height: building.footprint.width }
    : { ...building.footprint };
}
