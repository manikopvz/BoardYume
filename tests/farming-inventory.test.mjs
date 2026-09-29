import assert from 'node:assert/strict';
import test from 'node:test';

import { getCrop } from '../src/data/crops.js';
import { createInitialState } from '../src/game/state.js';
import { getTile, harvestCrop, plantCrop, tillTile, updateCrops, waterTile } from '../src/systems/farming.js';
import { addItem, countItem, removeItem } from '../src/systems/inventory.js';

test('vòng lặp cuốc, gieo, tưới, phát triển và thu hoạch giữ đúng trạng thái', () => {
  const state = createInitialState({ now: 1_000 });
  const x = 6;
  const y = 6;
  const crop = getCrop('carrot');
  const startingSeeds = countItem(state.inventory, crop.seedItemId);
  const startingWater = countItem(state.inventory, 'water');

  assert.equal(tillTile(state, x, y).ok, true);
  assert.equal(plantCrop(state, x, y, crop.id).ok, true);
  assert.equal(countItem(state.inventory, crop.seedItemId), startingSeeds - 1);

  const stageMinutes = crop.growthMinutes / (crop.stageCount - 1);
  updateCrops(state, stageMinutes * 2);
  assert.equal(getTile(state, x, y).crop.stage, 0, 'cây không được lớn khi đất khô');

  for (let expectedStage = 1; expectedStage < crop.stageCount; expectedStage += 1) {
    assert.equal(waterTile(state, x, y).ok, true);
    updateCrops(state, stageMinutes);
    const tile = getTile(state, x, y);
    assert.equal(tile.crop.stage, expectedStage);
    assert.equal(tile.watered, false, 'mỗi giai đoạn yêu cầu tưới lại');
  }

  assert.equal(countItem(state.inventory, 'water'), startingWater - (crop.stageCount - 1));
  assert.equal(getTile(state, x, y).crop.harvestable, true);
  const harvest = harvestCrop(state, x, y, () => 0.999);
  assert.deepEqual(harvest, { ok: true, itemId: 'carrot', amount: crop.yield.max, overflow: 0 });
  assert.equal(countItem(state.inventory, 'carrot'), crop.yield.max);
  assert.equal(getTile(state, x, y).crop, null);
});

test('farming từ chối ô bị chặn, hạt thiếu và thao tác lặp', () => {
  const state = createInitialState();
  assert.deepEqual(tillTile(state, 8, 7), { ok: false, reason: 'tile_blocked' });
  assert.equal(tillTile(state, 6, 6).ok, true);
  assert.deepEqual(tillTile(state, 6, 6), { ok: false, reason: 'already_tilled' });
  delete state.inventory.stacks.carrot_seed;
  assert.deepEqual(plantCrop(state, 6, 6, 'carrot'), { ok: false, reason: 'seed_required' });
});

test('inventory tôn trọng stack, capacity và không làm mất vật phẩm khi thất bại', () => {
  const inventory = { capacity: 1, stacks: {} };
  assert.deepEqual(addItem(inventory, 'wood', 100), {
    ok: false,
    reason: 'inventory_full',
    added: 99,
    overflow: 1,
  });
  assert.equal(countItem(inventory, 'wood'), 99);
  assert.deepEqual(removeItem(inventory, 'wood', 100), { ok: false, reason: 'insufficient_items', removed: 0 });
  assert.equal(countItem(inventory, 'wood'), 99);
  assert.deepEqual(removeItem(inventory, 'wood', 99), { ok: true, reason: null, removed: 99 });
  assert.equal(countItem(inventory, 'wood'), 0);
});
