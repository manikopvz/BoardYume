import assert from 'node:assert/strict';
import test from 'node:test';

import { getBuilding } from '../src/data/buildings.js';
import { createInitialState } from '../src/game/state.js';
import { canPlaceBuilding, demolishBuilding, moveBuilding, placeBuilding, updateConstruction } from '../src/systems/building.js';
import { startCrafting, updateCrafting } from '../src/systems/crafting.js';
import { countItem } from '../src/systems/inventory.js';

test('xây dựng kiểm tra va chạm, trừ chi phí và hoàn tất theo thời gian', () => {
  const state = createInitialState({ now: 1 });
  state.progression.unlockedBuildings.push('sawmill');
  const definition = getBuilding('sawmill');
  const startingWood = countItem(state.inventory, 'wood');
  const startingStone = countItem(state.inventory, 'stone');

  assert.deepEqual(canPlaceBuilding(state, 'sawmill', 8, 7), {
    ok: false,
    reason: 'building_overlap',
    cells: [
      { x: 8, y: 7 }, { x: 9, y: 7 }, { x: 10, y: 7 },
      { x: 8, y: 8 }, { x: 9, y: 8 }, { x: 10, y: 8 },
    ],
  });

  const result = placeBuilding(state, 'sawmill', 5, 5);
  assert.equal(result.ok, true);
  assert.equal(result.building.complete, false);
  assert.equal(countItem(state.inventory, 'wood'), startingWood - definition.cost.wood);
  assert.equal(countItem(state.inventory, 'stone'), startingStone - definition.cost.stone);
  assert.deepEqual(updateConstruction(state, definition.buildMinutes - 1), []);
  assert.equal(result.building.complete, false);
  assert.deepEqual(updateConstruction(state, 1), [result.building.id]);
  assert.equal(result.building.complete, true);
});

test('hàng đợi chế tạo tiêu thụ nguyên liệu và chỉ trả sản phẩm sau đủ thời gian', () => {
  const state = createInitialState();
  state.progression.unlockedBuildings.push('sawmill');
  const placed = placeBuilding(state, 'sawmill', 5, 5, 0, { instant: true });
  assert.equal(placed.ok, true);
  const before = countItem(state.inventory, 'wood');

  const crafting = startCrafting(state, placed.building.id, 'plank', 2);
  assert.equal(crafting.ok, true);
  assert.equal(countItem(state.inventory, 'wood'), before - 6);
  assert.deepEqual(updateCrafting(state, 5), []);
  assert.equal(countItem(state.inventory, 'plank'), 0);
  const completed = updateCrafting(state, 1);
  assert.equal(completed.length, 1);
  assert.equal(completed[0].recipeId, 'plank');
  assert.equal(countItem(state.inventory, 'plank'), 2);
});

test('công trình có thể di chuyển và phá dỡ nhưng nhà chính được bảo vệ', () => {
  const state = createInitialState();
  const fence = placeBuilding(state, 'fence', 6, 6, 0, { instant: true });
  assert.equal(fence.ok, true);
  assert.equal(moveBuilding(state, fence.building.id, 7, 6).ok, true);
  const demolition = demolishBuilding(state, fence.building.id, { refundRate: 1 });
  assert.equal(demolition.ok, true);
  assert.equal(demolition.refund.wood, 2);
  assert.deepEqual(demolishBuilding(state, 'building-1'), { ok: false, reason: 'cannot_demolish_home' });
});
