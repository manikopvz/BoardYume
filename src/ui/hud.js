import { resolveAsset } from '../render/world.js';

export const TOOLBAR_TOOLS = Object.freeze([
  { id: 'hand', label: 'Tương tác', key: 'item.glove' },
  { id: 'axe', label: 'Rìu', key: 'tool.axe' },
  { id: 'pickaxe', label: 'Cuốc chim', key: 'tool.pickaxe' },
  { id: 'hoe', label: 'Cuốc đất', key: 'tool.hoe' },
  { id: 'watering_can', label: 'Bình tưới', key: 'tool.watering_can' },
  { id: 'seeds', label: 'Hạt giống', key: 'item.seed_bag' },
  { id: 'hammer', label: 'Xây dựng', key: 'tool.hammer' },
]);

function makeButton(label, className, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.setAttribute('aria-label', label);
  button.title = label;
  button.addEventListener('click', onClick);
  return button;
}

function iconImage(source, alt = '') {
  const image = document.createElement('img');
  image.className = 'ui-icon';
  image.src = source;
  image.alt = alt;
  image.draggable = false;
  image.decoding = 'async';
  return image;
}

function quantityOf(inventory, id) {
  if (!inventory) return 0;
  const value = inventory.stacks?.[id] ?? inventory[id] ?? inventory.items?.[id];
  return Number(typeof value === 'object' ? value.quantity ?? value.count : value) || 0;
}

function formatClock(time) {
  const minutes = Number(time?.minuteOfDay ?? time?.minutes ?? time?.minute ?? 480);
  const hour = Math.floor(minutes / 60) % 24;
  const minute = Math.floor(minutes % 60);
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function formatMoney(value) {
  return Math.max(0, Math.floor(Number(value || 0))).toLocaleString('vi-VN');
}

export function createHud(parent, { manifest = {}, catalogs = {}, onTool, onPanel, onAction } = {}) {
  const root = document.createElement('div');
  root.className = 'game-hud';

  const status = document.createElement('section');
  status.className = 'hud-status ui-raster-panel';
  status.setAttribute('aria-label', 'Thông tin ngày và thời gian');
  const season = document.createElement('span');
  season.className = 'hud-status__season';
  season.textContent = 'Mùa Xuân';
  const day = document.createElement('strong');
  day.className = 'hud-status__day';
  day.textContent = 'Ngày 1';
  const clock = document.createElement('span');
  clock.className = 'hud-status__clock';
  clock.textContent = '08:00';
  const weather = document.createElement('span');
  weather.className = 'hud-status__weather';
  weather.textContent = 'Trời quang';
  status.append(season, day, clock, weather);

  const wallet = document.createElement('section');
  wallet.className = 'hud-wallet ui-raster-panel';
  wallet.setAttribute('aria-label', 'Tiền và năng lượng');
  const moneyIconPath = resolveAsset(manifest, 'item.coin', catalogs.items?.coin?.icon);
  if (moneyIconPath) wallet.append(iconImage(moneyIconPath, ''));
  const money = document.createElement('strong');
  money.className = 'hud-wallet__money';
  money.textContent = '0';
  const energy = document.createElement('div');
  energy.className = 'hud-energy';
  energy.setAttribute('aria-label', 'Năng lượng');
  const energyFill = document.createElement('div');
  energyFill.className = 'hud-energy__fill';
  energy.append(energyFill);
  wallet.append(money, energy);

  const resourceBar = document.createElement('section');
  resourceBar.className = 'hud-resources ui-raster-panel';
  resourceBar.setAttribute('aria-label', 'Tài nguyên nhanh');
  const quickResourceIds = ['wood', 'stone', 'fiber', 'water'];
  const resourceElements = new Map();
  for (const itemId of quickResourceIds) {
    const entry = document.createElement('div');
    entry.className = 'hud-resource';
    const definition = catalogs.items?.[itemId] || {};
    const source = resolveAsset(manifest, `item.${itemId}`, definition.icon);
    if (source) entry.append(iconImage(source, definition.name || itemId));
    const count = document.createElement('strong');
    count.textContent = '0';
    entry.append(count);
    entry.title = definition.name || itemId;
    resourceBar.append(entry);
    resourceElements.set(itemId, count);
  }

  const menu = document.createElement('nav');
  menu.className = 'hud-menu';
  menu.setAttribute('aria-label', 'Menu trò chơi');
  const menuItems = [
    ['inventory', 'Túi đồ', 'ui.inventory_panel'],
    ['build', 'Xây dựng', 'ui.button.build'],
    ['craft', 'Chế tạo', 'ui.button.craft'],
    ['shop', 'Cửa hàng', 'ui.button.sell'],
    ['quests', 'Nhiệm vụ', 'ui.quest_panel'],
    ['settings', 'Cài đặt', 'ui.button.settings'],
  ];
  for (const [id, label, assetKey] of menuItems) {
    const button = makeButton(label, 'hud-menu__button ui-raster-button', () => onPanel?.(id));
    button.dataset.panel = id;
    const source = resolveAsset(manifest, assetKey);
    if (source) button.append(iconImage(source, ''));
    const text = document.createElement('span');
    text.textContent = label;
    button.append(text);
    menu.append(button);
  }

  const toolbar = document.createElement('nav');
  toolbar.className = 'toolbelt';
  toolbar.setAttribute('aria-label', 'Thanh công cụ');
  const toolButtons = new Map();
  TOOLBAR_TOOLS.forEach((tool, index) => {
    const button = makeButton(`${index + 1}. ${tool.label}`, 'toolbelt__slot ui-raster-button', () => onTool?.(tool.id, index));
    button.dataset.tool = tool.id;
    button.dataset.shortcut = String(index + 1);
    const source = resolveAsset(manifest, tool.key);
    if (source) button.append(iconImage(source, ''));
    const label = document.createElement('span');
    label.className = 'toolbelt__label';
    label.textContent = tool.label;
    const shortcut = document.createElement('span');
    shortcut.className = 'toolbelt__shortcut';
    shortcut.textContent = String(index + 1);
    button.append(label, shortcut);
    toolbar.append(button);
    toolButtons.set(tool.id, button);
  });

  const cameraControls = document.createElement('div');
  cameraControls.className = 'camera-controls';
  const zoomIn = makeButton('Phóng to', 'camera-controls__button ui-raster-button', () => onAction?.('zoom-in'));
  zoomIn.textContent = '+';
  const zoomOut = makeButton('Thu nhỏ', 'camera-controls__button ui-raster-button', () => onAction?.('zoom-out'));
  zoomOut.textContent = '−';
  const center = makeButton('Đưa camera về nhân vật', 'camera-controls__button ui-raster-button', () => onAction?.('center-camera'));
  center.textContent = 'Tâm';
  cameraControls.append(zoomIn, zoomOut, center);

  const actionHint = document.createElement('div');
  actionHint.className = 'action-hint ui-raster-panel';
  actionHint.hidden = true;

  root.append(status, wallet, resourceBar, menu, toolbar, cameraControls, actionHint);
  parent.append(root);

  let activeTool = 'hand';
  function setActiveTool(toolId) {
    activeTool = toolId;
    for (const [id, button] of toolButtons) {
      const selected = id === toolId;
      button.classList.toggle('is-active', selected);
      button.setAttribute('aria-pressed', selected ? 'true' : 'false');
    }
  }

  function setHint(text, invalid = false) {
    actionHint.textContent = text || '';
    actionHint.hidden = !text;
    actionHint.classList.toggle('is-invalid', Boolean(invalid));
  }

  function update(state) {
    season.textContent = state?.time?.seasonName || state?.time?.season || 'Mùa Xuân';
    day.textContent = `Ngày ${Math.max(1, Number(state?.time?.day || 1))}`;
    clock.textContent = formatClock(state?.time);
    weather.textContent = state?.time?.weatherName || state?.time?.weather || 'Trời quang';
    money.textContent = formatMoney(state?.money ?? state?.inventory?.money);
    const currentEnergy = Number(state?.player?.energy ?? 100);
    const maxEnergy = Math.max(1, Number(state?.player?.maxEnergy ?? 100));
    energyFill.style.width = `${Math.round(Math.min(1, Math.max(0, currentEnergy / maxEnergy)) * 100)}%`;
    energy.setAttribute('aria-label', `Năng lượng ${Math.round(currentEnergy)} trên ${Math.round(maxEnergy)}`);
    for (const [id, element] of resourceElements) element.textContent = formatMoney(quantityOf(state?.inventory, id));
  }

  setActiveTool(activeTool);
  return { root, update, setActiveTool, setHint, get activeTool() { return activeTool; } };
}
