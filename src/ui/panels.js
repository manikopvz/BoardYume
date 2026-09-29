import { resolveAsset } from '../render/world.js';

function entriesOf(source) {
  return source && typeof source === 'object' ? Object.entries(source) : [];
}

function quantityOf(inventory, id) {
  const value = inventory?.stacks?.[id] ?? inventory?.[id] ?? inventory?.items?.[id];
  return Number(typeof value === 'object' ? value.quantity ?? value.count : value) || 0;
}

function makeButton(label, className, callback) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  button.addEventListener('click', callback);
  return button;
}

function makeAssetImage(source, alt) {
  if (!source) return null;
  const image = document.createElement('img');
  image.className = 'panel-card__image';
  image.src = source;
  image.alt = alt || '';
  image.loading = 'lazy';
  image.decoding = 'async';
  image.draggable = false;
  return image;
}

function itemSource(manifest, item, id) {
  const aliases = { metal_ingot: 'metal_bar', berry_jam: 'jam', tomato_soup: 'meal', vegetable_stew: 'meal', bread: 'meal', apple_preserve: 'jam', lavender_oil: 'crystal', rope: 'fiber', glass: 'crystal', coal: 'ore', hardwood: 'wood' };
  let key = `item.${aliases[id] || id}`;
  if (item?.category === 'seed' && item.cropId) key = `crop.${item.cropId}.seed`;
  if (item?.category === 'crop') key = `crop.${id}.product`;
  return resolveAsset(manifest, key, item?.icon || item?.asset);
}

function buildingKey(id, suffix = '') {
  const aliases = { cottage: 'house_1', homestead: 'house_2', garden_manor: 'house_3', masonry: 'stoneworks', smelter: 'stoneworks', garden_lamp: 'lantern' };
  const nature = { fence: 'nature.fence', gate: 'nature.gate', flower_arch: 'nature.flower_box' };
  if (nature[id]) return nature[id];
  return `building.${aliases[id] || id}${suffix}`;
}

function isUnlocked(collection, id, defaultValue = true) {
  if (!collection) return defaultValue;
  if (Array.isArray(collection)) return collection.includes(id);
  if (collection instanceof Set) return collection.has(id);
  return collection[id] !== false && (collection[id] === true || defaultValue);
}

function costText(cost, items) {
  return entriesOf(cost).map(([id, amount]) => `${items?.[id]?.name || id}: ${amount}`).join(' · ');
}

function createCard({ title, description, image, meta, disabled, actionLabel, onAction, className = '' }) {
  const card = document.createElement('article');
  card.className = `panel-card ${className}`.trim();
  if (disabled) card.classList.add('is-disabled');
  const visual = makeAssetImage(image, title);
  if (visual) card.append(visual);
  const content = document.createElement('div');
  content.className = 'panel-card__content';
  const heading = document.createElement('h3');
  heading.textContent = title;
  content.append(heading);
  if (description) {
    const text = document.createElement('p');
    text.textContent = description;
    content.append(text);
  }
  if (meta) {
    const detail = document.createElement('small');
    detail.textContent = meta;
    content.append(detail);
  }
  card.append(content);
  if (actionLabel) {
    const action = makeButton(actionLabel, 'panel-card__action ui-raster-button', onAction);
    action.disabled = Boolean(disabled);
    card.append(action);
  }
  return card;
}

export function createPanels(parent, { manifest = {}, catalogs = {}, onAction } = {}) {
  const backdrop = document.createElement('div');
  backdrop.className = 'panel-backdrop';
  backdrop.hidden = true;

  const root = document.createElement('aside');
  root.className = 'game-panel ui-raster-panel';
  root.hidden = true;
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('role', 'dialog');

  const header = document.createElement('header');
  header.className = 'game-panel__header';
  const title = document.createElement('h2');
  const closeButton = makeButton('Đóng', 'game-panel__close ui-raster-button', close);
  closeButton.setAttribute('aria-label', 'Đóng bảng');
  header.append(title, closeButton);

  const body = document.createElement('div');
  body.className = 'game-panel__body';
  root.append(header, body);
  parent.append(backdrop, root);
  backdrop.addEventListener('click', close);

  let active = null;
  let currentState = null;

  const panelTitles = {
    inventory: 'Túi đồ',
    build: 'Sổ xây dựng',
    craft: 'Xưởng chế tạo',
    shop: 'Chợ Vườn Mộng',
    quests: 'Nhiệm vụ',
    settings: 'Cài đặt',
  };

  function open(id, state) {
    if (!panelTitles[id]) return;
    active = id;
    currentState = state || currentState;
    title.textContent = panelTitles[id];
    root.dataset.panel = id;
    root.hidden = false;
    backdrop.hidden = false;
    render();
    requestAnimationFrame(() => closeButton.focus({ preventScroll: true }));
  }

  function close() {
    active = null;
    root.hidden = true;
    backdrop.hidden = true;
    body.replaceChildren();
  }

  function toggle(id, state) {
    if (active === id) close();
    else open(id, state);
  }

  function update(state) {
    currentState = state;
  }

  function renderInventory() {
    const grid = document.createElement('div');
    grid.className = 'panel-grid panel-grid--inventory';
    const inventory = currentState?.inventory;
    const possessed = entriesOf(catalogs.items).filter(([id]) => quantityOf(inventory, id) > 0);
    if (!possessed.length) {
      const empty = document.createElement('p');
      empty.className = 'panel-empty';
      empty.textContent = 'Túi đồ đang trống. Hãy thu thập tài nguyên quanh khu vườn.';
      body.append(empty);
      return;
    }
    for (const [id, item] of possessed) {
      grid.append(createCard({
        title: item.name || id,
        description: item.description,
        image: itemSource(manifest, item, id),
        meta: `Số lượng: ${quantityOf(inventory, id)}`,
        actionLabel: item.sellPrice ? 'Bán 1' : '',
        onAction: () => onAction?.('sell', { itemId: id, quantity: 1 }),
        className: 'panel-card--compact',
      }));
    }
    body.append(grid);
  }

  function renderBuild() {
    const intro = document.createElement('p');
    intro.className = 'panel-intro';
    intro.textContent = 'Chọn công trình, sau đó chạm một ô đất hợp lệ để đặt. Có thể xoay, di chuyển hoặc phá dỡ sau khi xây.';
    const grid = document.createElement('div');
    grid.className = 'panel-grid panel-grid--catalog';
    for (const [id, building] of entriesOf(catalogs.buildings)) {
      const unlocked = isUnlocked(currentState?.progression?.unlockedBuildings, id, building.unlocked !== false);
      grid.append(createCard({
        title: building.name || id,
        description: building.description,
        image: resolveAsset(manifest, buildingKey(id), building.previewAsset || building.asset),
        meta: unlocked ? costText(building.cost, catalogs.items) : `Mở khóa cấp ${building.unlockLevel || '?'}`,
        disabled: !unlocked,
        actionLabel: unlocked ? 'Chọn xây' : 'Chưa mở khóa',
        onAction: () => {
          onAction?.('build-select', { buildingId: id });
          close();
        },
      }));
    }
    body.append(intro, grid);
  }

  function renderCraft() {
    const grid = document.createElement('div');
    grid.className = 'panel-grid panel-grid--catalog';
    for (const [id, recipe] of entriesOf(catalogs.recipes)) {
      const [mappedOutputId, mappedOutputAmount] = entriesOf(recipe.outputs)[0] || [];
      const outputId = recipe.output?.itemId || recipe.outputItem || recipe.result || mappedOutputId;
      const outputItem = catalogs.items?.[outputId] || {};
      const amount = recipe.output?.quantity || recipe.outputQuantity || mappedOutputAmount || 1;
      grid.append(createCard({
        title: recipe.name || outputItem.name || id,
        description: recipe.description,
        image: itemSource(manifest, outputItem, outputId),
        meta: `${costText(recipe.inputs || recipe.cost, catalogs.items)} · ${recipe.durationMinutes ? `${recipe.durationMinutes} phút game` : recipe.duration ? `${Math.ceil(recipe.duration / 1000)} giây` : 'Tức thì'} · Nhận ${amount}`,
        actionLabel: 'Chế tạo',
        onAction: () => onAction?.('craft', { recipeId: id }),
      }));
    }
    if (!grid.children.length) {
      const empty = document.createElement('p');
      empty.className = 'panel-empty';
      empty.textContent = 'Hãy xây xưởng sản xuất để mở công thức chế tạo.';
      body.append(empty);
      return;
    }
    body.append(grid);
  }

  function renderShop() {
    const balance = document.createElement('p');
    balance.className = 'panel-balance';
    balance.textContent = `Bạn đang có ${Math.floor(Number(currentState?.money || 0)).toLocaleString('vi-VN')} xu.`;
    const grid = document.createElement('div');
    grid.className = 'panel-grid panel-grid--catalog';
    for (const [id, item] of entriesOf(catalogs.items)) {
      if (!item.buyPrice && item.category !== 'seed') continue;
      const cropId = item.cropId;
      const unlocked = !cropId || isUnlocked(currentState?.progression?.unlockedCrops, cropId, item.unlocked !== false);
      const price = Number(item.buyPrice || 0);
      grid.append(createCard({
        title: item.name || id,
        description: item.description,
        image: itemSource(manifest, item, id),
        meta: unlocked ? `${price.toLocaleString('vi-VN')} xu` : 'Chưa mở khóa',
        disabled: !unlocked,
        actionLabel: unlocked ? 'Mua 1' : 'Khóa',
        onAction: () => onAction?.('buy', { itemId: id, quantity: 1 }),
      }));
    }
    body.append(balance, grid);
  }

  function renderQuests() {
    const list = document.createElement('div');
    list.className = 'quest-list';
    const questState = currentState?.quests || {};
    for (const [id, quest] of entriesOf(catalogs.quests)) {
      if (questState.claimed?.includes(id)) continue;
      if (Array.isArray(questState.active) && !questState.active.includes(id) && !questState.completed?.includes(id)) continue;
      const objectives = Array.isArray(quest.objectives) ? quest.objectives : [];
      const target = objectives.length ? objectives.reduce((sum, objective) => sum + Number(objective.quantity || 0), 0) : Number(quest.target || 1);
      const progressMap = questState.progress?.[id] || {};
      const progress = objectives.length
        ? objectives.reduce((sum, objective, index) => sum + Math.min(Number(objective.quantity || 0), Number(progressMap[index] || 0)), 0)
        : Math.min(target, Number(questState[id]?.progress || 0));
      const card = document.createElement('article');
      card.className = 'quest-card';
      const heading = document.createElement('h3');
      heading.textContent = quest.title || quest.name || id;
      const description = document.createElement('p');
      description.textContent = quest.description || '';
      const status = document.createElement('strong');
      status.textContent = `${progress} / ${target}`;
      const track = document.createElement('div');
      track.className = 'quest-card__progress';
      const fill = document.createElement('div');
      fill.className = 'quest-card__fill';
      fill.style.width = `${Math.round((progress / target) * 100)}%`;
      track.append(fill);
      card.append(heading, description, status, track);
      if (questState.completed?.includes(id) || progress >= target) card.append(makeButton('Nhận thưởng', 'panel-card__action ui-raster-button', () => onAction?.('quest-claim', { questId: id })));
      list.append(card);
    }
    if (!list.children.length) {
      const completed = document.createElement('p');
      completed.className = 'panel-empty';
      completed.textContent = 'Bạn đã hoàn thành các mục tiêu hiện tại.';
      list.append(completed);
    }
    body.append(list);
  }

  function addRange(group, labelText, id, value) {
    const label = document.createElement('label');
    label.className = 'setting-row';
    const titleElement = document.createElement('span');
    titleElement.textContent = labelText;
    const input = document.createElement('input');
    input.type = 'range';
    input.min = '0';
    input.max = '1';
    input.step = '0.05';
    input.value = String(value ?? 0.7);
    input.addEventListener('input', () => onAction?.('setting', { id, value: Number(input.value) }));
    label.append(titleElement, input);
    group.append(label);
  }

  function renderSettings() {
    const group = document.createElement('div');
    group.className = 'settings-list';
    addRange(group, 'Âm lượng nhạc', 'musicVolume', currentState?.settings?.musicVolume);
    addRange(group, 'Âm lượng hiệu ứng', 'sfxVolume', currentState?.settings?.sfxVolume);

    const muteLabel = document.createElement('label');
    muteLabel.className = 'setting-row setting-row--toggle';
    const muteText = document.createElement('span');
    muteText.textContent = 'Tắt toàn bộ âm thanh';
    const mute = document.createElement('input');
    mute.type = 'checkbox';
    mute.checked = Boolean(currentState?.settings?.muted);
    mute.addEventListener('change', () => onAction?.('setting', { id: 'muted', value: mute.checked }));
    muteLabel.append(muteText, mute);
    group.append(muteLabel);

    const actions = document.createElement('div');
    actions.className = 'settings-actions';
    actions.append(
      makeButton('Lưu ngay', 'ui-raster-button', () => onAction?.('save')),
      makeButton('Tải bản lưu', 'ui-raster-button', () => onAction?.('load')),
      makeButton('Mở rộng đất', 'ui-raster-button', () => onAction?.('expand-land')),
      makeButton('Nâng cấp nhà', 'ui-raster-button', () => onAction?.('upgrade-house')),
      makeButton('Hướng dẫn', 'ui-raster-button', () => { close(); onAction?.('tutorial'); }),
      makeButton('Game mới', 'ui-raster-button is-danger', () => onAction?.('new-game')),
    );
    body.append(group, actions);
  }

  function render() {
    body.replaceChildren();
    if (!active) return;
    ({ inventory: renderInventory, build: renderBuild, craft: renderCraft, shop: renderShop, quests: renderQuests, settings: renderSettings })[active]?.();
  }

  return { root, backdrop, open, close, toggle, update, refresh: render, get active() { return active; } };
}
