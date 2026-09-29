import { createInitialState, isInsideUnlockedWorld } from './state.js';
import { createGameLoop } from './loop.js';
import { ITEMS } from '../data/items.js';
import { CROPS } from '../data/crops.js';
import { BUILDINGS, getBuilding, getFootprint } from '../data/buildings.js';
import { RECIPES } from '../data/recipes.js';
import { QUESTS } from '../data/quests.js';
import { createWorldRenderer, loadAssetManifest, preloadRasterAssets, resolveAsset } from '../render/world.js';
import { createKeyboardInput } from '../input/keyboard.js';
import { createPointerInput } from '../input/pointer.js';
import { createHud, TOOLBAR_TOOLS } from '../ui/hud.js';
import { createPanels } from '../ui/panels.js';
import { createTutorial } from '../ui/tutorial.js';
import { createNotifications } from '../ui/notifications.js';
import { tillTile, plantCrop, waterTile, harvestCrop, getTile } from '../systems/farming.js';
import { gatherNode } from '../systems/gathering.js';
import { canPlaceBuilding, placeBuilding, moveBuilding, rotateBuilding, demolishBuilding, getPlacedBuildingAt } from '../systems/building.js';
import { startCrafting } from '../systems/crafting.js';
import { buyItem, sellItem, buyExpansion, upgradeHouse, claimQuestReward, syncProgressionUnlocks } from '../systems/economy.js';
import { advanceTime, isNight, setPaused } from '../systems/time.js';
import { createAutosaveController, deleteSave, loadGame, loadOrCreateGame, saveGame } from '../save/save.js';
import { audioManager } from '../audio/audio.js';
import { registerOfflineService } from '../offline/register.js';

const ACTION_MS = 430;
const ERROR_MESSAGES = Object.freeze({
  outside_unlocked_land: 'Ô đất này chưa được mở rộng.', tile_blocked: 'Ô đất đang bị cây, đá hoặc công trình chiếm chỗ.',
  farmland_blocked: 'Không thể xây trên luống cây hoặc đất đã cuốc.', water_blocked: 'Chỉ cầu mới có thể đặt trên mặt nước.',
  bridge_requires_water: 'Cầu phải được đặt trên mặt nước.', resource_node_blocked: 'Hãy dọn tài nguyên trước khi xây.',
  building_overlap: 'Vị trí này chồng lên công trình khác.', player_blocked: 'Nhân vật đang đứng tại vị trí này.',
  insufficient_items: 'Bạn chưa đủ nguyên liệu.', insufficient_money: 'Bạn chưa đủ xu.', inventory_full: 'Túi đồ đã đầy.',
  crop_locked: 'Cây trồng này chưa được mở khóa.', building_locked: 'Công trình này chưa được mở khóa.', seed_required: 'Bạn không còn hạt giống đã chọn.',
  soil_not_tilled: 'Cần cuốc đất trước.', already_tilled: 'Ô đất này đã được cuốc.', already_watered: 'Ô đất này đã đủ ẩm.',
  water_required: 'Bình tưới đã hết nước.', no_crop: 'Không có cây trồng tại đây.', not_ready: 'Cây chưa sẵn sàng thu hoạch.',
  wrong_station: 'Cần đúng công trình sản xuất cho công thức này.', recipe_locked: 'Công thức này chưa được mở khóa.',
  construction_in_progress: 'Công trình vẫn đang được xây.', land_fully_unlocked: 'Toàn bộ khu vườn đã được mở rộng.',
  max_upgrade: 'Nhà chính đã đạt cấp cao nhất.', house_upgrade_locked: 'Cấp độ khu vườn chưa đủ để nâng nhà.',
  upgrade_space_blocked: 'Cần dọn thêm khoảng trống quanh nhà.', cannot_demolish_home: 'Không thể phá dỡ nhà chính.',
});

function resultMessage(result, success) {
  return result?.ok ? success : ERROR_MESSAGES[result?.reason] || 'Thao tác chưa thể thực hiện.';
}

function closestNode(state, x, y) {
  return Object.values(state.world.nodes).find((node) => node.active && node.x === x && node.y === y) || null;
}

function buildingBlocks(state, x, y) {
  return Object.values(state.world.buildings).some((placed) => {
    const definition = getBuilding(placed.typeId);
    if (!definition) return false;
    const footprint = getFootprint(definition, placed.rotation);
    return x >= placed.x && x < placed.x + footprint.width && y >= placed.y && y < placed.y + footprint.height;
  });
}

function canWalk(state, x, y) {
  const tileX = Math.floor(x);
  const tileY = Math.floor(y);
  return isInsideUnlockedWorld(state, tileX, tileY)
    && getTile(state, tileX, tileY)?.terrain !== 'water'
    && !closestNode(state, tileX, tileY)
    && !buildingBlocks(state, tileX, tileY);
}

function createRasterEffectLayer(shell, manifest) {
  const layer = document.createElement('div');
  layer.className = 'screen-effects';
  shell.append(layer);
  return {
    play(assetKey, point = null) {
      const source = resolveAsset(manifest, assetKey);
      if (!source) return;
      const effect = document.createElement('span');
      effect.className = 'screen-raster-effect';
      effect.style.left = `${point?.x ?? shell.clientWidth / 2}px`;
      effect.style.top = `${point?.y ?? shell.clientHeight / 2}px`;
      effect.style.backgroundImage = `url("${source}")`;
      layer.append(effect);
      window.setTimeout(() => effect.remove(), 720);
    },
  };
}

function createWeatherLayer(shell, manifest) {
  const root = document.createElement('div');
  root.className = 'weather-layer';
  const rain = document.createElement('div');
  rain.className = 'weather-rain';
  rain.style.backgroundImage = `url("${resolveAsset(manifest, 'effect.rain')}")`;
  const fireflies = document.createElement('span');
  fireflies.className = 'weather-fireflies';
  fireflies.style.backgroundImage = `url("${resolveAsset(manifest, 'effect.fireflies')}")`;
  root.append(rain, fireflies);
  shell.append(root);
  return { update(state) { root.classList.toggle('is-raining', state.time.weather === 'rain'); root.classList.toggle('is-night', isNight(state)); } };
}

function createConfirmDialog(shell) {
  const root = document.createElement('div');
  root.className = 'confirm-dialog';
  root.hidden = true;
  const card = document.createElement('section');
  card.className = 'confirm-card ui-raster-panel';
  const title = document.createElement('h2');
  const body = document.createElement('p');
  const actions = document.createElement('div');
  actions.className = 'confirm-card__actions';
  const cancel = document.createElement('button');
  cancel.type = 'button'; cancel.className = 'ui-raster-button'; cancel.textContent = 'Hủy';
  const accept = document.createElement('button');
  accept.type = 'button'; accept.className = 'ui-raster-button is-danger';
  actions.append(cancel, accept); card.append(title, body, actions); root.append(card); shell.append(root);
  let resolveCurrent = null;
  const finish = (value) => { root.hidden = true; resolveCurrent?.(value); resolveCurrent = null; };
  cancel.addEventListener('click', () => finish(false));
  accept.addEventListener('click', () => finish(true));
  return { ask(heading, message, acceptText = 'Xác nhận') {
    if (resolveCurrent) finish(false);
    title.textContent = heading; body.textContent = message; accept.textContent = acceptText; root.hidden = false;
    requestAnimationFrame(() => accept.focus());
    return new Promise((resolve) => { resolveCurrent = resolve; });
  } };
}

function createPauseMenu(shell, onAction) {
  const root = document.createElement('div');
  root.className = 'pause-curtain'; root.hidden = true;
  const card = document.createElement('section'); card.className = 'pause-card ui-raster-panel';
  const title = document.createElement('h2'); title.textContent = 'Tạm dừng';
  const text = document.createElement('p'); text.textContent = 'Thời gian trong khu vườn đang dừng lại.';
  const actions = document.createElement('div'); actions.className = 'pause-card__actions';
  for (const [id, label] of [['resume', 'Tiếp tục'], ['save', 'Lưu ngay'], ['settings', 'Cài đặt']]) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'ui-raster-button'; button.textContent = label;
    button.addEventListener('click', () => onAction(id)); actions.append(button);
  }
  card.append(title, text, actions); root.append(card); shell.append(root);
  return { show: () => { root.hidden = false; }, hide: () => { root.hidden = true; } };
}

function createSeedTray(shell, manifest, onSelect) {
  const root = document.createElement('nav'); root.className = 'seed-tray ui-raster-panel'; root.hidden = true; root.setAttribute('aria-label', 'Chọn hạt giống'); shell.append(root);
  let selected = 'carrot';
  function render(state) {
    root.replaceChildren();
    for (const cropId of state.progression.unlockedCrops) {
      const crop = CROPS[cropId]; if (!crop) continue;
      const button = document.createElement('button'); button.type = 'button'; button.className = 'seed-tray__button ui-raster-button'; button.classList.toggle('is-active', cropId === selected);
      button.title = `${crop.name} · ${state.inventory.stacks[crop.seedItemId] || 0} hạt`;
      const image = document.createElement('img'); image.src = resolveAsset(manifest, `crop.${cropId}.seed`); image.alt = crop.name;
      const count = document.createElement('strong'); count.textContent = String(state.inventory.stacks[crop.seedItemId] || 0);
      button.append(image, count); button.addEventListener('click', () => { selected = cropId; onSelect(cropId); render(state); }); root.append(button);
    }
  }
  return { root, render, show(state) { render(state); root.hidden = false; }, hide() { root.hidden = true; }, get selected() { return selected; } };
}

function createBuildingActions(shell, callbacks) {
  const root = document.createElement('div'); root.className = 'building-actions ui-raster-panel'; root.hidden = true;
  const label = document.createElement('strong'); const actions = document.createElement('div');
  for (const [id, text] of [['rotate', 'Xoay'], ['move', 'Di chuyển'], ['demolish', 'Phá dỡ'], ['close', 'Đóng']]) {
    const button = document.createElement('button'); button.type = 'button'; button.className = `ui-raster-button${id === 'demolish' ? ' is-danger' : ''}`; button.textContent = text;
    button.addEventListener('click', () => callbacks[id]?.()); actions.append(button);
  }
  root.append(label, actions); shell.append(root);
  return { show(building) { label.textContent = getBuilding(building.typeId)?.name || 'Công trình'; root.hidden = false; }, hide() { root.hidden = true; } };
}

export async function bootGame(host) {
  if (!host) throw new Error('BoardYume cần một phần tử #app để khởi động.');
  const shell = document.createElement('main'); shell.className = 'game-shell';
  const loading = document.createElement('div'); loading.className = 'loading-screen';
  loading.setAttribute('aria-live', 'polite');
  loading.innerHTML = '<section class="loading-card ui-raster-panel"><img class="loading-card__art" alt="Ngôi nhà Vườn Mộng"><h1>BoardYume</h1><p class="loading-card__message">Đang chuẩn bị khu vườn...</p><strong class="loading-card__count">Đang đọc danh mục tài nguyên</strong><div class="loading-meter" role="progressbar" aria-label="Tiến độ tải tài nguyên" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><div class="loading-meter__fill"></div></div><button type="button" class="loading-card__retry ui-raster-button" hidden>Thử tải lại</button></section>';
  const viewport = document.createElement('section'); viewport.className = 'game-viewport'; viewport.setAttribute('aria-label', 'Khu vườn BoardYume');
  shell.append(viewport, loading); host.replaceChildren(shell);

  const loadingMessage = loading.querySelector('.loading-card__message');
  const loadingCount = loading.querySelector('.loading-card__count');
  const loadingMeter = loading.querySelector('.loading-meter');
  const loadingFill = loading.querySelector('.loading-meter__fill');
  const loadingArt = loading.querySelector('.loading-card__art');
  const retryButton = loading.querySelector('.loading-card__retry');
  const waitForRetry = (message) => new Promise((resolve) => {
    loadingMessage.textContent = message;
    loadingCount.textContent = 'Kiểm tra kết nối rồi thử lại. Game chưa được khởi chạy.';
    retryButton.hidden = false;
    retryButton.addEventListener('click', () => {
      retryButton.hidden = true;
      resolve();
    }, { once: true });
  });

  let manifest = null;
  let worldBackdrop = null;
  while (!manifest) {
    loadingMessage.textContent = 'Đang đọc danh mục tài nguyên...';
    loadingCount.textContent = 'Vui lòng chờ';
    loadingFill.style.width = '2%';
    loadingMeter.setAttribute('aria-valuenow', '2');
    const candidate = await loadAssetManifest();
    if (!candidate?.assets || Object.keys(candidate.assets).length < 100) {
      await waitForRetry('Không thể tải danh mục tài nguyên của khu vườn.');
      continue;
    }

    shell.style.setProperty('--asset-ui-panel', `url("${resolveAsset(candidate, 'ui.description_panel')}")`);
    shell.style.setProperty('--asset-ui-toolbar', `url("${resolveAsset(candidate, 'ui.toolbar')}")`);
    shell.style.setProperty('--asset-ui-button', `url("${resolveAsset(candidate, 'ui.item_slot')}")`);
    if (!worldBackdrop) {
      worldBackdrop = document.createElement('img');
      worldBackdrop.className = 'world-backdrop';
      worldBackdrop.alt = '';
      worldBackdrop.setAttribute('aria-hidden', 'true');
      shell.insertBefore(worldBackdrop, viewport);
    }
    worldBackdrop.src = resolveAsset(candidate, 'background.world');
    loadingArt.src = resolveAsset(candidate, 'building.house_1');
    loadingMessage.textContent = 'Đang tải và giải mã tài nguyên...';

    try {
      const preloaded = await preloadRasterAssets(candidate, {
        concurrency: 10,
        onProgress(progress) {
          const percentage = progress.total ? Math.round((progress.completed / progress.total) * 100) : 100;
          loadingFill.style.width = `${percentage}%`;
          loadingMeter.setAttribute('aria-valuenow', String(percentage));
          loadingCount.textContent = progress.retrying
            ? `Đang thử lại tài nguyên lỗi · ${progress.loaded}/${progress.total}`
            : `${progress.loaded}/${progress.total} tài nguyên sẵn sàng`;
        },
      });
      if (preloaded.failures.length) {
        await waitForRetry(`Còn ${preloaded.failures.length} tài nguyên chưa tải được.`);
        continue;
      }
      manifest = candidate;
    } catch (error) {
      console.error('[BoardYume] Preload thất bại.', error);
      await waitForRetry('Quá trình tải tài nguyên bị gián đoạn.');
    }
  }

  const catalogs = { items: ITEMS, crops: CROPS, buildings: BUILDINGS, recipes: RECIPES, quests: QUESTS };
  let state = loadOrCreateGame().state || createInitialState(); syncProgressionUnlocks(state);

  const renderer = createWorldRenderer(viewport, { manifest, catalogs });
  const notifications = createNotifications(shell);
  const effects = createRasterEffectLayer(shell, manifest);
  const weather = createWeatherLayer(shell, manifest);
  const confirmDialog = createConfirmDialog(shell);
  let placement = null, moveBuildingId = null, selectedCrop = 'carrot', selectedBuilding = null, moveTarget = null, actionUntil = 0, lastFootstepAt = 0, lastAudioScene = '';

  function notifyResult(result, success, sound = null) { notifications.show(resultMessage(result, success), { type: result?.ok ? 'success' : 'error' }); if (result?.ok && sound) audioManager.playSfx(sound); }
  function setAction(action, sound, point, effectKey) { state.player.action = action; actionUntil = performance.now() + ACTION_MS; if (sound) audioManager.playSfx(sound); if (effectKey) effects.play(effectKey, point); }
  function placementAt(tile) {
    if (!placement) return null;
    const result = moveBuildingId
      ? canPlaceBuilding(state, placement.buildingId, tile.x, tile.y, placement.rotation, { ignoreBuildingId: moveBuildingId })
      : canPlaceBuilding(state, placement.buildingId, tile.x, tile.y, placement.rotation);
    return { ...placement, x: tile.x, y: tile.y, valid: result.ok, reason: result.reason };
  }

  const buildingActions = createBuildingActions(shell, {
    rotate() { if (!selectedBuilding) return; notifyResult(rotateBuilding(state, selectedBuilding.id), 'Đã xoay công trình.', 'build'); },
    move() { if (!selectedBuilding) return; moveBuildingId = selectedBuilding.id; placement = { buildingId: selectedBuilding.typeId, rotation: selectedBuilding.rotation || 0, x: selectedBuilding.x, y: selectedBuilding.y, valid: true }; buildingActions.hide(); notifications.show('Chọn vị trí mới cho công trình.'); },
    async demolish() { if (!selectedBuilding) return; const definition = getBuilding(selectedBuilding.typeId); const accepted = await confirmDialog.ask('Phá dỡ công trình?', `Bạn sẽ nhận lại một phần nguyên liệu từ ${definition?.name || 'công trình này'}.`, 'Phá dỡ'); if (!accepted) return; const result = demolishBuilding(state, selectedBuilding.id); notifyResult(result, 'Đã phá dỡ và hoàn lại vật liệu.', 'build'); selectedBuilding = null; buildingActions.hide(); },
    close() { selectedBuilding = null; buildingActions.hide(); },
  });
  const seedTray = createSeedTray(shell, manifest, (cropId) => { selectedCrop = cropId; });

  let panels, hud, tutorial;
  function selectTool(toolId) {
    if (toolId === 'hammer') { panels.open('build', state); return; }
    state.player.selectedTool = toolId; hud.setActiveTool(toolId); placement = null; moveBuildingId = null; buildingActions.hide();
    viewport.classList.toggle('is-tool-active', toolId !== 'hand');
    if (toolId === 'seeds') seedTray.show(state); else seedTray.hide();
    audioManager.playSfx('click');
  }
  function nearestStation(recipeId) { const recipe = RECIPES[recipeId]; return Object.values(state.world.buildings).find((building) => building.complete && building.typeId === recipe?.station) || null; }
  async function handlePanelAction(action, payload = {}) {
    let result;
    if (action === 'build-select') { placement = { buildingId: payload.buildingId, rotation: 0, x: 0, y: 0, valid: false }; state.player.selectedTool = 'hammer'; hud.setActiveTool('hammer'); seedTray.hide(); notifications.show('Di chuyển con trỏ rồi chạm để đặt công trình. Nhấn Esc để hủy.'); return; }
    if (action === 'craft') { const station = nearestStation(payload.recipeId); result = station ? startCrafting(state, station.id, payload.recipeId) : { ok: false, reason: 'wrong_station' }; notifyResult(result, 'Đã bắt đầu sản xuất.', 'build'); }
    else if (action === 'buy') { result = buyItem(state, payload.itemId, payload.quantity); notifyResult(result, 'Đã mua vật phẩm.', 'buy'); }
    else if (action === 'sell') { result = sellItem(state, payload.itemId, payload.quantity); notifyResult(result, 'Đã bán vật phẩm.', 'sell'); }
    else if (action === 'quest-claim') { result = claimQuestReward(state, payload.questId); notifyResult(result, 'Đã nhận thưởng nhiệm vụ.', 'complete'); }
    else if (action === 'save') { result = saveGame(state); notifyResult(result, 'Đã lưu khu vườn.', 'click'); }
    else if (action === 'load') { result = loadGame(); if (result.ok) { state = result.state; notifications.show('Đã tải lại bản lưu.', { type: 'success' }); } else notifyResult(result, ''); }
    else if (action === 'expand-land') { result = buyExpansion(state); notifyResult(result, 'Khu vườn đã được mở rộng.', 'complete'); }
    else if (action === 'upgrade-house') { result = upgradeHouse(state); notifyResult(result, 'Nhà chính đang được nâng cấp.', 'build'); }
    else if (action === 'tutorial') tutorial.open(true);
    else if (action === 'setting') { state.settings[payload.id] = payload.value; if (payload.id === 'musicVolume') audioManager.setMusicVolume(payload.value); if (payload.id === 'sfxVolume') audioManager.setSfxVolume(payload.value); if (payload.id === 'muted') audioManager.setMuted(payload.value); }
    else if (action === 'new-game') { const accepted = await confirmDialog.ask('Tạo khu vườn mới?', 'Bản lưu hiện tại sẽ bị xóa vĩnh viễn.', 'Xóa và tạo mới'); if (accepted) { deleteSave(); state = createInitialState(); syncProgressionUnlocks(state); panels.close(); notifications.show('Một khu vườn mới đã được tạo.', { type: 'success' }); } }
    panels.update(state); if (panels.active) panels.refresh(); seedTray.render(state);
  }

  panels = createPanels(shell, { manifest, catalogs, onAction: handlePanelAction });
  hud = createHud(shell, { manifest, catalogs, onTool: selectTool, onPanel: (id) => { panels.toggle(id, state); audioManager.playSfx('click'); }, onAction: (id) => { if (id === 'zoom-in') renderer.zoomBy(1.14); if (id === 'zoom-out') renderer.zoomBy(0.88); if (id === 'center-camera') renderer.resetCamera(); } });
  hud.setActiveTool(state.player.selectedTool || 'hand');
  tutorial = createTutorial(shell, { onComplete: () => notifications.show('Bạn đã sẵn sàng chăm sóc Vườn Mộng.', { type: 'success' }) });
  const autosave = createAutosaveController(() => state, { intervalMs: 20000 });

  let pauseMenu;
  function togglePause(force) { const paused = typeof force === 'boolean' ? force : !state.time.paused; setPaused(state, paused); if (paused) pauseMenu.show(); else pauseMenu.hide(); }
  pauseMenu = createPauseMenu(shell, (action) => { if (action === 'resume') togglePause(false); if (action === 'save') handlePanelAction('save'); if (action === 'settings') { togglePause(false); panels.open('settings', state); } });
  const pauseButton = document.createElement('button'); pauseButton.type = 'button'; pauseButton.className = 'pause-button ui-raster-button'; pauseButton.title = 'Tạm dừng';
  const pauseIcon = document.createElement('img'); pauseIcon.src = resolveAsset(manifest, 'ui.button.pause'); pauseIcon.alt = 'Tạm dừng'; pauseButton.append(pauseIcon); pauseButton.addEventListener('click', () => togglePause()); shell.append(pauseButton);

  function interactAt(tile, point) {
    const { x, y } = tile;
    if (placement) {
      const preview = placementAt(tile);
      if (!preview.valid) { notifyResult({ ok: false, reason: preview.reason }, ''); effects.play('effect.placement_invalid', point); return; }
      const result = moveBuildingId ? moveBuilding(state, moveBuildingId, x, y, placement.rotation) : placeBuilding(state, placement.buildingId, x, y, placement.rotation);
      notifyResult(result, moveBuildingId ? 'Đã di chuyển công trình.' : 'Đã khởi công công trình.', 'build'); if (result.ok) effects.play('effect.build_dust', point);
      placement = null; moveBuildingId = null; state.player.selectedTool = 'hand'; hud.setActiveTool('hand'); viewport.classList.remove('is-tool-active'); return;
    }
    const tool = state.player.selectedTool, tileState = getTile(state, x, y), node = closestNode(state, x, y); let result;
    if (tool === 'hoe') { result = tillTile(state, x, y); notifyResult(result, 'Đất đã được cuốc.', 'hoe'); if (result.ok) setAction('hoe', null, point, 'effect.build_dust'); }
    else if (tool === 'watering_can') { result = waterTile(state, x, y); notifyResult(result, 'Luống đất đã được tưới.', 'water'); if (result.ok) setAction('water', null, point, 'effect.water_splash'); }
    else if (tool === 'seeds') { result = plantCrop(state, x, y, selectedCrop); notifyResult(result, `Đã gieo ${CROPS[selectedCrop]?.name || 'hạt giống'}.`, 'seed'); if (result.ok) setAction('plant', null, point, 'effect.harvest_burst'); seedTray.render(state); }
    else if (tool === 'axe' || tool === 'pickaxe') { result = node ? gatherNode(state, node.id) : { ok: false, reason: 'tile_blocked' }; notifyResult(result, result?.depleted ? 'Đã thu thập tài nguyên.' : `Còn ${result?.health ?? 0} độ bền.`, tool === 'axe' ? 'chop' : 'mine'); if (result.ok) setAction(tool === 'axe' ? 'chop' : 'mine', null, point, tool === 'axe' ? 'effect.hit_wood' : 'effect.hit_rock'); }
    else if (tool === 'hand') {
      if (tileState?.crop) { result = harvestCrop(state, x, y); notifyResult(result, 'Đã thu hoạch nông sản.', 'harvest'); if (result.ok) setAction('harvest', null, point, 'effect.harvest_burst'); }
      else if (node?.type === 'weed') { result = gatherNode(state, node.id); notifyResult(result, 'Đã nhặt sợi thực vật.', 'pickup'); if (result.ok) setAction('pickup', null, point, 'effect.harvest_burst'); }
      else { const building = getPlacedBuildingAt(state, x, y); if (building) { selectedBuilding = building; buildingActions.show(building); } else { moveTarget = { x: x + 0.5, y: y + 0.5 }; buildingActions.hide(); } }
    }
    panels.update(state);
  }

  const pointer = createPointerInput(viewport, { onPan: (dx, dy) => { renderer.pan(dx, dy); viewport.classList.add('is-dragging'); }, onZoom: (factor, anchor) => renderer.zoomBy(factor, anchor), onHover: (point) => { const tile = renderer.screenToTile(point); renderer.viewState.selectedTile = tile; renderer.viewState.placement = placementAt(tile); }, onTap: (point) => interactAt(renderer.screenToTile(point), point), onInteract: () => audioManager.unlock() });
  viewport.addEventListener('pointerup', () => viewport.classList.remove('is-dragging'));
  const keyboard = createKeyboardInput({ onTool: (index) => TOOLBAR_TOOLS[index] && selectTool(TOOLBAR_TOOLS[index].id), onShortcut: (shortcut) => { if (shortcut === 'pause') togglePause(); else if (shortcut === 'escape') { placement = null; moveBuildingId = null; panels.close(); buildingActions.hide(); } else if (shortcut === 'interact') interactAt({ x: Math.round(state.player.x), y: Math.round(state.player.y) }, { x: shell.clientWidth / 2, y: shell.clientHeight / 2 }); else panels.toggle(shortcut, state); }, onInteract: () => audioManager.unlock() });

  audioManager.setMusicVolume(state.settings.musicVolume); audioManager.setSfxVolume(state.settings.sfxVolume); audioManager.setMuted(state.settings.muted); audioManager.installFirstInteractionUnlock();
  autosave.start(); registerOfflineService({ onUpdate: () => notifications.show('Có bản cập nhật mới. Tải lại trang để áp dụng.') });
  let previousCompleted = new Set(state.quests.completed);
  const loop = createGameLoop({
    update(stepMs, now) {
      const seconds = stepMs / 1000; const movement = keyboard.getMovement(); let vector = movement;
      if (!movement.moving && moveTarget) { const dx = moveTarget.x - state.player.x, dy = moveTarget.y - state.player.y, distance = Math.hypot(dx, dy); if (distance < 0.12) moveTarget = null; else vector = { x: dx / distance, y: dy / distance, moving: true }; } else if (movement.moving) moveTarget = null;
      if (vector.moving && !state.time.paused) { const speed = state.player.movementSpeed * seconds, nextX = state.player.x + vector.x * speed, nextY = state.player.y + vector.y * speed; if (canWalk(state, nextX, state.player.y)) state.player.x = nextX; if (canWalk(state, state.player.x, nextY)) state.player.y = nextY; state.player.facing = Math.abs(vector.x) > Math.abs(vector.y) ? (vector.x > 0 ? 'east' : 'west') : (vector.y > 0 ? 'south' : 'north'); state.player.action = 'walk'; if (now - lastFootstepAt > 320) { audioManager.playSfx('footstep', { volume: 0.55 }); lastFootstepAt = now; } } else if (now > actionUntil) state.player.action = 'idle';
      const timeResult = advanceTime(state, seconds);
      if (timeResult.buildingsCompleted.length) { effects.play('effect.construction_complete'); audioManager.playSfx('complete'); notifications.show('Một công trình vừa hoàn thành.', { type: 'success' }); }
      if (timeResult.craftingCompleted.length) { audioManager.playSfx('complete'); notifications.show('Sản phẩm chế tạo đã hoàn tất.', { type: 'success' }); }
      const completed = new Set(state.quests.completed); for (const questId of completed) if (!previousCompleted.has(questId)) notifications.show(`Hoàn thành nhiệm vụ: ${QUESTS[questId]?.title || questId}`, { type: 'success' }); previousCompleted = completed;
    },
    render(_alpha, now) {
      const sceneKey = `${isNight(state)}:${state.time.weather}`;
      if (sceneKey !== lastAudioScene) { lastAudioScene = sceneKey; shell.classList.toggle('is-night', isNight(state)); shell.classList.toggle('is-raining', state.time.weather === 'rain'); weather.update(state); audioManager.setScene({ isNight: isNight(state), raining: state.time.weather === 'rain' }); }
      renderer.viewState.placement = placement ? placementAt(renderer.viewState.selectedTile || { x: 0, y: 0 }) : null;
      renderer.render(state, renderer.viewState, now); hud.update(state); panels.update(state);
    },
  });
  renderer.render(state, renderer.viewState, performance.now()); hud.update(state); panels.update(state);
  loop.start(); window.addEventListener('beforeunload', () => saveGame(state), { once: true }); window.addEventListener('resize', () => renderer.applyCamera());
  loadingFill.style.width = '100%'; loadingMeter.setAttribute('aria-valuenow', '100'); loadingMessage.textContent = 'Khu vườn đã sẵn sàng.'; loadingCount.textContent = 'Hoàn tất';
  await new Promise((resolve) => requestAnimationFrame(() => { loading.hidden = true; tutorial.open(); resolve(); }));
  window.__BOARDYUME__ = { get state() { return state; }, manifest, renderer, save: () => saveGame(state), reset: () => { state = createInitialState(); return state; }, destroy() { loop.stop(); autosave.stop(); keyboard.destroy(); pointer.destroy(); renderer.destroy(); audioManager.destroy(); } };
  return window.__BOARDYUME__;
}
