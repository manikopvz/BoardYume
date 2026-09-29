import { addItems } from './inventory.js';
import { updateCrops } from './farming.js';
import { updateConstruction } from './building.js';
import { updateCrafting } from './crafting.js';
import { updateGatherNodes } from './gathering.js';
import { getBuilding } from '../data/buildings.js';
import { markStateChanged } from '../game/state.js';

export const MINUTES_PER_DAY = 24 * 60;

function chooseWeather(state, rng) {
  const roll = rng();
  const rainChance = state.time.season === 'spring' ? 0.3 : 0.18;
  if (roll < rainChance) return 'rain';
  if (roll > 0.82) return 'windy';
  return 'clear';
}

function applyDailyBuildingOutput(state) {
  const outputs = {};
  for (const placed of Object.values(state.world.buildings)) {
    if (!placed.complete) continue;
    const definition = getBuilding(placed.typeId);
    if (definition?.waterPerDay) outputs.water = (outputs.water ?? 0) + definition.waterPerDay;
    if (definition?.dailyProduct) {
      const { itemId, quantity } = definition.dailyProduct;
      outputs[itemId] = (outputs[itemId] ?? 0) + quantity;
    }
  }
  return addItems(state.inventory, outputs, { atomic: false });
}

function beginDay(state, rng) {
  state.time.weather = chooseWeather(state, rng);
  for (const tile of Object.values(state.world.tiles)) {
    if (tile.terrain === 'tilled') tile.watered = state.time.weather === 'rain';
  }
  return applyDailyBuildingOutput(state);
}

export function advanceTime(state, realSeconds, options = {}) {
  if (state.time.paused) return { ok: true, elapsedGameMinutes: 0, daysStarted: [], cropsChanged: [], buildingsCompleted: [], craftingCompleted: [], nodesRespawned: [] };
  const seconds = Math.max(0, Number(realSeconds) || 0);
  const elapsedGameMinutes = options.gameMinutes ?? seconds * state.time.minutesPerRealSecond * state.time.speed;
  if (elapsedGameMinutes <= 0) return { ok: true, elapsedGameMinutes: 0, daysStarted: [], cropsChanged: [], buildingsCompleted: [], craftingCompleted: [], nodesRespawned: [] };
  const previousDay = state.time.day;
  state.time.totalMinutes += elapsedGameMinutes;
  state.time.day = Math.floor(state.time.totalMinutes / MINUTES_PER_DAY) + 1;
  state.time.minuteOfDay = state.time.totalMinutes % MINUTES_PER_DAY;
  state.meta.playTimeSeconds += seconds;
  const cropsChanged = updateCrops(state, elapsedGameMinutes);
  const buildingsCompleted = updateConstruction(state, elapsedGameMinutes);
  const craftingCompleted = updateCrafting(state, elapsedGameMinutes);
  const nodesRespawned = updateGatherNodes(state, elapsedGameMinutes);
  const daysStarted = [];
  const rng = options.rng ?? Math.random;
  for (let day = previousDay + 1; day <= state.time.day; day += 1) {
    const dailyOutput = beginDay(state, rng);
    daysStarted.push({ day, weather: state.time.weather, dailyOutput });
  }
  markStateChanged(state, options.now ?? Date.now());
  return { ok: true, elapsedGameMinutes, daysStarted, cropsChanged, buildingsCompleted, craftingCompleted, nodesRespawned };
}

export function setTimeSpeed(state, speed) {
  const allowed = [0.5, 1, 2, 4];
  if (!allowed.includes(speed)) return { ok: false, reason: 'invalid_speed' };
  state.time.speed = speed;
  state.time.paused = false;
  return { ok: true, speed };
}

export function setPaused(state, paused) {
  state.time.paused = Boolean(paused);
  return { ok: true, paused: state.time.paused };
}

export function formatGameTime(state) {
  const hour = Math.floor(state.time.minuteOfDay / 60);
  const minute = Math.floor(state.time.minuteOfDay % 60);
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function isNight(state) {
  const hour = state.time.minuteOfDay / 60;
  return hour < 6 || hour >= 19;
}
