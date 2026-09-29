import assert from 'node:assert/strict';
import test from 'node:test';

import { createInitialState } from '../src/game/state.js';
import {
  deserializeGameState,
  loadGame,
  migrateSaveData,
  saveGame,
  SAVE_VERSION,
  serializeGameState,
} from '../src/save/save.js';
import { placeBuilding } from '../src/systems/building.js';
import { buyItem, getSellMultiplier, sellItem } from '../src/systems/economy.js';
import { plantCrop, tillTile, waterTile } from '../src/systems/farming.js';
import { countItem } from '../src/systems/inventory.js';

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

test('mua và bán là giao dịch nguyên tử, giữ đúng tiền cùng inventory', () => {
  const state = createInitialState({ startingMoney: 100 });
  const seedsBefore = countItem(state.inventory, 'carrot_seed');
  const purchase = buyItem(state, 'carrot_seed', 2);
  assert.equal(purchase.ok, true);
  assert.equal(purchase.total, 16);
  assert.equal(state.money, 84);
  assert.equal(countItem(state.inventory, 'carrot_seed'), seedsBefore + 2);

  const rejected = buyItem(state, 'carrot_seed', 100);
  assert.equal(rejected.ok, false);
  assert.equal(state.money, 84, 'không trừ tiền khi giao dịch thất bại');

  const sale = sellItem(state, 'wood', 3);
  assert.equal(sale.ok, true);
  assert.equal(sale.total, 9);
  assert.equal(state.money, 93);
});

test('quầy chợ hoàn chỉnh áp dụng hệ số bán hàng', () => {
  const state = createInitialState();
  state.progression.unlockedBuildings.push('market');
  const market = placeBuilding(state, 'market', 5, 5, 0, { free: true, instant: true });
  assert.equal(market.ok, true);
  assert.equal(getSellMultiplier(state), 1.12);
  const result = sellItem(state, 'wood', 5);
  assert.equal(result.total, 16); // floor(3 × 5 × 1.12)
});

test('serialize/deserialize giữ nguyên tiến độ gameplay và tạo bản sao độc lập', () => {
  const state = createInitialState({ now: 100, startingMoney: 432 });
  assert.equal(tillTile(state, 6, 6).ok, true);
  assert.equal(plantCrop(state, 6, 6, 'carrot').ok, true);
  assert.equal(waterTile(state, 6, 6).ok, true);
  state.progression.unlockedBuildings.push('sawmill');
  const construction = placeBuilding(state, 'sawmill', 5, 8);
  assert.equal(construction.ok, true);

  const restored = deserializeGameState(serializeGameState(state), { now: 999 });
  assert.equal(restored.version, SAVE_VERSION);
  assert.equal(restored.money, 432);
  assert.deepEqual(restored.world.tiles['6,6'], state.world.tiles['6,6']);
  assert.deepEqual(restored.world.buildings[construction.building.id], construction.building);
  restored.world.tiles['6,6'].watered = false;
  assert.equal(state.world.tiles['6,6'].watered, true, 'state đã tải không dùng chung tham chiếu với state cũ');
});

test('save/load qua storage được tiêm và báo save hỏng an toàn', () => {
  const storage = createMemoryStorage();
  const state = createInitialState({ startingMoney: 777 });
  const saved = saveGame(state, storage, 'slot-a');
  assert.equal(saved.ok, true);
  const loaded = loadGame(storage, 'slot-a', { now: 500 });
  assert.equal(loaded.ok, true);
  assert.equal(loaded.state.money, 777);

  storage.setItem('slot-b', '{not-json');
  const corrupt = loadGame(storage, 'slot-b');
  assert.equal(corrupt.ok, false);
  assert.equal(corrupt.reason, 'save_corrupt');
  assert.equal(corrupt.state, null);
});

test('save cũ được migrate lên version hiện tại và chuẩn hóa dữ liệu', () => {
  const legacy = {
    resources: { wood: 7, unknown_resource: 99 },
    world: {
      crops: [{ x: 4, y: 5, type: 'wheat', stage: 2, watered: true }],
      buildings: { old: { id: 'old', typeId: 'storage', x: 2, y: 2, complete: true } },
    },
  };
  const migrated = migrateSaveData(legacy);
  assert.equal(migrated.version, SAVE_VERSION);
  assert.equal(migrated.world.tiles['4,5'].crop.cropId, 'wheat');
  assert.deepEqual(migrated.world.buildings.old.production, { queue: [], pendingOutput: {} });
  const hydrated = deserializeGameState(JSON.stringify(legacy), { now: 123 });
  assert.equal(hydrated.inventory.stacks.wood, 7);
  assert.equal(hydrated.inventory.stacks.unknown_resource, undefined);
});
