export const ITEM_CATEGORIES = Object.freeze({
  RESOURCE: 'resource',
  SEED: 'seed',
  CROP: 'crop',
  MATERIAL: 'material',
  PRODUCT: 'product',
  TOOL: 'tool',
});

const defineItem = (id, name, category, buyPrice, sellPrice, extra = {}) => Object.freeze({
  id,
  name,
  category,
  buyPrice,
  sellPrice,
  stackLimit: 99,
  iconKey: `item-${id}`,
  ...extra,
});

export const ITEMS = Object.freeze({
  wood: defineItem('wood', 'Gỗ', ITEM_CATEGORIES.RESOURCE, 8, 3),
  stone: defineItem('stone', 'Đá', ITEM_CATEGORIES.RESOURCE, 10, 4),
  fiber: defineItem('fiber', 'Sợi thực vật', ITEM_CATEGORIES.RESOURCE, 6, 2),
  clay: defineItem('clay', 'Đất sét', ITEM_CATEGORIES.RESOURCE, 12, 5),
  ore: defineItem('ore', 'Quặng thô', ITEM_CATEGORIES.RESOURCE, 18, 7),
  water: defineItem('water', 'Nước', ITEM_CATEGORIES.RESOURCE, 2, 0, { stackLimit: 50 }),
  hardwood: defineItem('hardwood', 'Gỗ cứng', ITEM_CATEGORIES.RESOURCE, 30, 12),
  coal: defineItem('coal', 'Than', ITEM_CATEGORIES.RESOURCE, 16, 6),

  carrot_seed: defineItem('carrot_seed', 'Hạt cà rốt', ITEM_CATEGORIES.SEED, 8, 2, { cropId: 'carrot' }),
  tomato_seed: defineItem('tomato_seed', 'Hạt cà chua', ITEM_CATEGORIES.SEED, 14, 4, { cropId: 'tomato' }),
  wheat_seed: defineItem('wheat_seed', 'Hạt lúa mì', ITEM_CATEGORIES.SEED, 6, 2, { cropId: 'wheat' }),
  strawberry_seed: defineItem('strawberry_seed', 'Hạt dâu tây', ITEM_CATEGORIES.SEED, 20, 6, { cropId: 'strawberry' }),
  pumpkin_seed: defineItem('pumpkin_seed', 'Hạt bí ngô', ITEM_CATEGORIES.SEED, 28, 8, { cropId: 'pumpkin' }),
  potato_seed: defineItem('potato_seed', 'Khoai tây giống', ITEM_CATEGORIES.SEED, 12, 3, { cropId: 'potato' }),
  corn_seed: defineItem('corn_seed', 'Hạt ngô', ITEM_CATEGORIES.SEED, 18, 5, { cropId: 'corn' }),
  cabbage_seed: defineItem('cabbage_seed', 'Hạt bắp cải', ITEM_CATEGORIES.SEED, 16, 4, { cropId: 'cabbage' }),
  sunflower_seed: defineItem('sunflower_seed', 'Hạt hướng dương', ITEM_CATEGORIES.SEED, 22, 7, { cropId: 'sunflower' }),
  blueberry_seed: defineItem('blueberry_seed', 'Hạt việt quất', ITEM_CATEGORIES.SEED, 26, 8, { cropId: 'blueberry' }),
  eggplant_seed: defineItem('eggplant_seed', 'Hạt cà tím', ITEM_CATEGORIES.SEED, 24, 7, { cropId: 'eggplant' }),
  watermelon_seed: defineItem('watermelon_seed', 'Hạt dưa hấu', ITEM_CATEGORIES.SEED, 34, 10, { cropId: 'watermelon' }),

  carrot: defineItem('carrot', 'Cà rốt', ITEM_CATEGORIES.CROP, 20, 12),
  tomato: defineItem('tomato', 'Cà chua', ITEM_CATEGORIES.CROP, 32, 18),
  wheat: defineItem('wheat', 'Lúa mì', ITEM_CATEGORIES.CROP, 18, 10),
  strawberry: defineItem('strawberry', 'Dâu tây', ITEM_CATEGORIES.CROP, 46, 27),
  pumpkin: defineItem('pumpkin', 'Bí ngô', ITEM_CATEGORIES.CROP, 70, 42),
  potato: defineItem('potato', 'Khoai tây', ITEM_CATEGORIES.CROP, 28, 16),
  corn: defineItem('corn', 'Ngô', ITEM_CATEGORIES.CROP, 38, 22),
  cabbage: defineItem('cabbage', 'Bắp cải', ITEM_CATEGORIES.CROP, 36, 21),
  sunflower: defineItem('sunflower', 'Hoa hướng dương', ITEM_CATEGORIES.CROP, 52, 30),
  blueberry: defineItem('blueberry', 'Việt quất', ITEM_CATEGORIES.CROP, 58, 34),
  eggplant: defineItem('eggplant', 'Cà tím', ITEM_CATEGORIES.CROP, 48, 28),
  watermelon: defineItem('watermelon', 'Dưa hấu', ITEM_CATEGORIES.CROP, 82, 50),
  apple: defineItem('apple', 'Táo', ITEM_CATEGORIES.CROP, 36, 21),

  plank: defineItem('plank', 'Ván gỗ', ITEM_CATEGORIES.MATERIAL, 30, 17),
  stone_block: defineItem('stone_block', 'Khối đá', ITEM_CATEGORIES.MATERIAL, 36, 20),
  metal_ingot: defineItem('metal_ingot', 'Thỏi kim loại', ITEM_CATEGORIES.MATERIAL, 58, 34),
  flour: defineItem('flour', 'Bột mì', ITEM_CATEGORIES.MATERIAL, 38, 22),
  glass: defineItem('glass', 'Kính', ITEM_CATEGORIES.MATERIAL, 66, 38),
  rope: defineItem('rope', 'Dây thừng', ITEM_CATEGORIES.MATERIAL, 24, 13),

  berry_jam: defineItem('berry_jam', 'Mứt quả mọng', ITEM_CATEGORIES.PRODUCT, 92, 58),
  tomato_soup: defineItem('tomato_soup', 'Súp cà chua', ITEM_CATEGORIES.PRODUCT, 76, 47),
  vegetable_stew: defineItem('vegetable_stew', 'Rau củ hầm', ITEM_CATEGORIES.PRODUCT, 110, 68),
  bread: defineItem('bread', 'Bánh mì', ITEM_CATEGORIES.PRODUCT, 72, 44),
  apple_preserve: defineItem('apple_preserve', 'Táo ngâm', ITEM_CATEGORIES.PRODUCT, 88, 54),
  lavender_oil: defineItem('lavender_oil', 'Dầu hướng dương', ITEM_CATEGORIES.PRODUCT, 120, 74),

  axe: defineItem('axe', 'Rìu', ITEM_CATEGORIES.TOOL, 0, 0, { stackLimit: 1 }),
  pickaxe: defineItem('pickaxe', 'Cuốc chim', ITEM_CATEGORIES.TOOL, 0, 0, { stackLimit: 1 }),
  hoe: defineItem('hoe', 'Cuốc đất', ITEM_CATEGORIES.TOOL, 0, 0, { stackLimit: 1 }),
  watering_can: defineItem('watering_can', 'Bình tưới', ITEM_CATEGORIES.TOOL, 0, 0, { stackLimit: 1 }),
});

export const ITEM_LIST = Object.freeze(Object.values(ITEMS));

export function getItem(itemId) {
  return ITEMS[itemId] ?? null;
}

export function isKnownItem(itemId) {
  return Object.hasOwn(ITEMS, itemId);
}

export function getItemsByCategory(category) {
  return ITEM_LIST.filter((item) => item.category === category);
}
