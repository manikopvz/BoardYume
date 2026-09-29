const defineRecipe = (id, name, station, inputs, outputs, durationMinutes, unlockLevel) => Object.freeze({
  id,
  name,
  station,
  inputs: Object.freeze(inputs),
  outputs: Object.freeze(outputs),
  durationMinutes,
  unlockLevel,
});

export const RECIPES = Object.freeze({
  plank: defineRecipe('plank', 'Xẻ ván gỗ', 'sawmill', { wood: 3 }, { plank: 1 }, 3, 1),
  rope: defineRecipe('rope', 'Bện dây thừng', 'sawmill', { fiber: 4 }, { rope: 1 }, 2, 1),
  stone_block: defineRecipe('stone_block', 'Đẽo khối đá', 'masonry', { stone: 4 }, { stone_block: 1 }, 4, 2),
  metal_ingot: defineRecipe('metal_ingot', 'Luyện thỏi kim loại', 'smelter', { ore: 3, coal: 1 }, { metal_ingot: 1 }, 6, 4),
  flour: defineRecipe('flour', 'Xay bột mì', 'windmill', { wheat: 3 }, { flour: 2 }, 3, 3),
  glass: defineRecipe('glass', 'Nấu kính', 'smelter', { stone: 2, coal: 2 }, { glass: 1 }, 7, 4),
  bread: defineRecipe('bread', 'Nướng bánh mì', 'kitchen', { flour: 2 }, { bread: 1 }, 5, 4),
  berry_jam: defineRecipe('berry_jam', 'Nấu mứt quả mọng', 'kitchen', { strawberry: 2, blueberry: 2 }, { berry_jam: 1 }, 6, 5),
  tomato_soup: defineRecipe('tomato_soup', 'Nấu súp cà chua', 'kitchen', { tomato: 3, water: 1 }, { tomato_soup: 1 }, 4, 4),
  vegetable_stew: defineRecipe('vegetable_stew', 'Nấu rau củ hầm', 'kitchen', { carrot: 2, potato: 2, cabbage: 1 }, { vegetable_stew: 1 }, 7, 4),
  apple_preserve: defineRecipe('apple_preserve', 'Làm táo ngâm', 'kitchen', { apple: 3 }, { apple_preserve: 1 }, 5, 5),
  lavender_oil: defineRecipe('lavender_oil', 'Ép dầu hướng dương', 'kitchen', { sunflower: 4 }, { lavender_oil: 1 }, 8, 5),
});

export const RECIPE_LIST = Object.freeze(Object.values(RECIPES));

export function getRecipe(recipeId) {
  return RECIPES[recipeId] ?? null;
}

export function getRecipesForStation(stationId, level = Number.POSITIVE_INFINITY) {
  return RECIPE_LIST.filter((recipe) => recipe.station === stationId && recipe.unlockLevel <= level);
}
