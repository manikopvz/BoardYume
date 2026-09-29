import { createQuestState } from '../data/quests.js';

export const GAME_STATE_VERSION = 3;
export const WORLD_WIDTH = 28;
export const WORLD_HEIGHT = 28;

const initialNodes = () => {
  const definitions = [
    ['tree', 3, 4, 3, 'wood', 8], ['tree', 7, 3, 4, 'wood', 8], ['tree', 13, 6, 5, 'wood', 9],
    ['pine', 17, 4, 3, 'wood', 9], ['fruit_tree', 20, 8, 4, 'apple', 10], ['fruit_tree', 5, 13, 5, 'apple', 10],
    ['rock', 4, 9, 3, 'stone', 7], ['rock', 12, 3, 4, 'stone', 8], ['rock', 19, 13, 5, 'stone', 9],
    ['ore_rock', 15, 15, 5, 'ore', 8], ['ore_rock', 22, 5, 5, 'ore', 8],
    ['weed', 2, 14, 1, 'fiber', 4], ['weed', 8, 16, 1, 'fiber', 4], ['weed', 16, 10, 1, 'fiber', 4],
    ['clay_mound', 11, 18, 3, 'clay', 6], ['clay_mound', 21, 17, 3, 'clay', 6],
  ];
  return Object.fromEntries(definitions.map(([type, x, y, health, resourceItemId, respawnMinutes], index) => {
    const id = `node-${index + 1}`;
    return [id, {
      id,
      type,
      variant: (index % 3) + 1,
      x,
      y,
      health,
      maxHealth: health,
      resourceItemId,
      active: true,
      respawnMinutes,
      respawnRemaining: 0,
      spriteKey: `nature-${type}-${(index % 3) + 1}`,
      shadowSpriteKey: `nature-${type}-shadow`,
    }];
  }));
};

const initialBuildings = () => ({
  'building-1': {
    id: 'building-1',
    typeId: 'cottage',
    x: 8,
    y: 7,
    rotation: 0,
    complete: true,
    buildRemaining: 0,
    production: { queue: [], pendingOutput: {} },
  },
});

const initialTiles = () => {
  const tiles = {};
  for (let x = 4; x <= 17; x += 1) {
    const key = `${x},12`;
    tiles[key] = { x, y: 12, terrain: 'path_dirt', watered: false, crop: null };
  }
  for (let y = 10; y <= 17; y += 1) {
    const key = `11,${y}`;
    tiles[key] = { x: 11, y, terrain: 'path_stone', watered: false, crop: null };
  }
  for (let y = 9; y <= 11; y += 1) {
    for (let x = 18; x <= 21; x += 1) {
      const key = `${x},${y}`;
      tiles[key] = { x, y, terrain: 'water', waterFrame: (x + y) % 3, watered: false, crop: null };
    }
  }
  return tiles;
};

export function createInitialState(options = {}) {
  const now = Number.isFinite(options.now) ? options.now : Date.now();
  return {
    version: GAME_STATE_VERSION,
    meta: {
      createdAt: now,
      updatedAt: now,
      playTimeSeconds: 0,
      nextEntityId: 100,
      revision: 0,
    },
    player: {
      x: 10,
      y: 11,
      facing: 'south',
      action: 'idle',
      selectedTool: 'hand',
      selectedItem: null,
      movementSpeed: 3.2,
      spriteKey: 'player',
      animationKeys: {
        idle: 'player-idle',
        walk: 'player-walk',
        chop: 'player-chop',
        mine: 'player-mine',
        hoe: 'player-hoe',
        water: 'player-water',
        plant: 'player-plant',
        harvest: 'player-harvest',
        pickup: 'player-pickup',
        build: 'player-build',
      },
    },
    inventory: {
      capacity: 36,
      stacks: {
        axe: 1,
        pickaxe: 1,
        hoe: 1,
        watering_can: 1,
        wood: 28,
        stone: 20,
        fiber: 12,
        water: 18,
        carrot_seed: 6,
        wheat_seed: 6,
        potato_seed: 4,
      },
    },
    money: Number.isFinite(options.startingMoney) ? Math.max(0, options.startingMoney) : 180,
    progression: {
      level: 1,
      xp: 0,
      xpToNext: 100,
      unlockedCrops: ['carrot', 'wheat', 'potato'],
      unlockedBuildings: ['cottage', 'storage', 'fence', 'signpost'],
      unlockedRecipes: ['plank', 'rope'],
      expansions: 0,
      houseLevel: 1,
    },
    world: {
      width: WORLD_WIDTH,
      height: WORLD_HEIGHT,
      unlockedBounds: { minX: 1, minY: 1, maxX: 22, maxY: 20 },
      tiles: initialTiles(),
      nodes: initialNodes(),
      buildings: initialBuildings(),
    },
    time: {
      day: 1,
      minuteOfDay: 7 * 60,
      totalMinutes: 7 * 60,
      speed: 1,
      minutesPerRealSecond: 0.25,
      paused: false,
      weather: 'clear',
      season: 'spring',
    },
    quests: createQuestState(),
    settings: {
      musicVolume: 0.65,
      sfxVolume: 0.8,
      muted: false,
      zoom: 1,
      reduceMotion: false,
    },
    notifications: [],
  };
}

export function cloneGameState(state) {
  return typeof structuredClone === 'function'
    ? structuredClone(state)
    : JSON.parse(JSON.stringify(state));
}

export function allocateEntityId(state, prefix = 'entity') {
  const value = Math.max(1, Number(state.meta.nextEntityId) || 1);
  state.meta.nextEntityId = value + 1;
  return `${prefix}-${value}`;
}

export function markStateChanged(state, now = Date.now()) {
  state.meta.updatedAt = now;
  state.meta.revision = (state.meta.revision ?? 0) + 1;
  return state;
}

export function isInsideUnlockedWorld(state, x, y) {
  const bounds = state.world.unlockedBounds;
  return Number.isInteger(x) && Number.isInteger(y)
    && x >= bounds.minX && x <= bounds.maxX
    && y >= bounds.minY && y <= bounds.maxY;
}
