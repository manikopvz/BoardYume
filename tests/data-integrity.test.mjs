import assert from 'node:assert/strict';
import test from 'node:test';

import { BUILDING_LIST, getBuilding, getFootprint } from '../src/data/buildings.js';
import { CROP_LIST, getCrop, getCropStage } from '../src/data/crops.js';
import { ITEMS, isKnownItem } from '../src/data/items.js';
import { createQuestState, QUEST_LIST, recordQuestEvent } from '../src/data/quests.js';
import { RECIPE_LIST } from '../src/data/recipes.js';

test('12 cây trồng có đủ hạt giống, nông sản và năm frame phát triển riêng', () => {
  assert.equal(CROP_LIST.length, 12);
  for (const crop of CROP_LIST) {
    assert.equal(crop.stageCount, 5, crop.id);
    assert.equal(new Set(crop.stageSpriteKeys).size, 5, crop.id);
    assert.ok(isKnownItem(crop.seedItemId), `${crop.id}: thiếu seed item`);
    assert.ok(isKnownItem(crop.produceItemId), `${crop.id}: thiếu produce item`);
    assert.equal(ITEMS[crop.seedItemId].cropId, crop.id);
    assert.ok(crop.growthMinutes > 0);
    assert.ok(crop.yield.min > 0 && crop.yield.max >= crop.yield.min);
  }
});

test('giai đoạn cây được chặn trong khoảng hợp lệ', () => {
  const crop = getCrop('carrot');
  assert.equal(getCropStage(crop, -100), 0);
  assert.equal(getCropStage(crop, 0), 0);
  assert.equal(getCropStage(crop, crop.growthMinutes / 2), 2);
  assert.equal(getCropStage(crop, crop.growthMinutes), 4);
  assert.equal(getCropStage(crop, crop.growthMinutes * 10), 4);
  assert.equal(getCropStage(null, 20), 0);
});

test('công thức chỉ tham chiếu vật phẩm và trạm sản xuất có thật', () => {
  const productionStations = new Set(BUILDING_LIST.filter((entry) => entry.recipeIds).map((entry) => entry.id));
  assert.ok(RECIPE_LIST.length >= 10);
  for (const recipe of RECIPE_LIST) {
    assert.ok(productionStations.has(recipe.station), `${recipe.id}: trạm ${recipe.station} không tồn tại`);
    for (const [itemId, quantity] of Object.entries({ ...recipe.inputs, ...recipe.outputs })) {
      assert.ok(isKnownItem(itemId), `${recipe.id}: vật phẩm ${itemId} không tồn tại`);
      assert.ok(Number.isInteger(quantity) && quantity > 0, `${recipe.id}: số lượng không hợp lệ`);
    }
    assert.ok(recipe.durationMinutes > 0);
  }
});

test('catalog công trình có footprint, chi phí và quy tắc xoay nhất quán', () => {
  assert.ok(BUILDING_LIST.length >= 15);
  for (const building of BUILDING_LIST) {
    assert.ok(building.footprint.width > 0 && building.footprint.height > 0, building.id);
    for (const [itemId, quantity] of Object.entries(building.cost)) {
      assert.ok(isKnownItem(itemId), `${building.id}: chi phí ${itemId} không tồn tại`);
      assert.ok(quantity > 0);
    }
  }
  const sawmill = getBuilding('sawmill');
  assert.deepEqual(getFootprint(sawmill, 0), { width: 3, height: 2 });
  assert.deepEqual(getFootprint(sawmill, 90), { width: 2, height: 3 });
  assert.deepEqual(getFootprint(sawmill, 270), { width: 2, height: 3 });
  assert.deepEqual(getFootprint(sawmill, 360), { width: 3, height: 2 });
});

test('chuỗi nhiệm vụ mở khóa tuần tự sau khi đạt đủ mục tiêu', () => {
  const state = { quests: createQuestState() };
  assert.equal(QUEST_LIST[0].id, 'first_steps');
  assert.deepEqual(recordQuestEvent(state, 'tile_tilled'), []);
  assert.deepEqual(recordQuestEvent(state, 'crop_planted'), []);
  assert.deepEqual(recordQuestEvent(state, 'crop_watered'), ['first_steps']);
  assert.ok(state.quests.completed.includes('first_steps'));
  assert.ok(state.quests.active.includes('first_harvest'));
});
