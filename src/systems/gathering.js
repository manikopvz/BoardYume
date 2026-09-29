import { addItems, canAddItems, countItem } from './inventory.js';
import { markStateChanged } from '../game/state.js';

const NODE_RULES = Object.freeze({
  tree: { tool: 'axe', drops: { wood: [3, 5] }, bonus: { itemId: 'hardwood', chance: 0.18 } },
  pine: { tool: 'axe', drops: { wood: [4, 6] }, bonus: { itemId: 'hardwood', chance: 0.25 } },
  fruit_tree: { tool: 'axe', drops: { wood: [2, 4], apple: [2, 4] }, bonus: null },
  rock: { tool: 'pickaxe', drops: { stone: [3, 6] }, bonus: { itemId: 'coal', chance: 0.2 } },
  ore_rock: { tool: 'pickaxe', drops: { stone: [1, 2], ore: [2, 4] }, bonus: { itemId: 'coal', chance: 0.35 } },
  clay_mound: { tool: 'pickaxe', drops: { clay: [3, 5] }, bonus: null },
  weed: { tool: null, drops: { fiber: [2, 4] }, bonus: null },
});

const rollRange = (range, rng) => range[0] + Math.floor(Math.min(0.999999, Math.max(0, rng())) * (range[1] - range[0] + 1));

export function gatherNode(state, nodeId, options = {}) {
  const node = state.world.nodes[nodeId];
  if (!node) return { ok: false, reason: 'node_not_found' };
  if (!node.active) return { ok: false, reason: 'node_depleted' };
  const rule = NODE_RULES[node.type];
  if (!rule) return { ok: false, reason: 'unsupported_node' };
  if (rule.tool && countItem(state.inventory, rule.tool) < 1) return { ok: false, reason: 'tool_required', tool: rule.tool };
  const damage = Math.max(1, Math.floor(options.damage ?? 1));
  node.health = Math.max(0, node.health - damage);
  if (node.health > 0) {
    markStateChanged(state);
    return { ok: true, depleted: false, health: node.health, drops: {} };
  }
  const rng = options.rng ?? Math.random;
  const drops = Object.fromEntries(Object.entries(rule.drops).map(([itemId, range]) => [itemId, rollRange(range, rng)]));
  if (rule.bonus && rng() < rule.bonus.chance) drops[rule.bonus.itemId] = (drops[rule.bonus.itemId] ?? 0) + 1;
  if (!canAddItems(state.inventory, drops)) {
    node.health = 1;
    return { ok: false, reason: 'inventory_full', depleted: false, health: node.health, drops: {} };
  }
  const result = addItems(state.inventory, drops);
  node.active = false;
  node.respawnRemaining = node.respawnMinutes;
  node.health = 0;
  markStateChanged(state);
  return { ok: true, depleted: true, drops: result.added, overflow: {} };
}

export function updateGatherNodes(state, elapsedGameMinutes) {
  const elapsed = Math.max(0, Number(elapsedGameMinutes) || 0);
  const respawned = [];
  for (const node of Object.values(state.world.nodes)) {
    if (node.active) continue;
    node.respawnRemaining = Math.max(0, (node.respawnRemaining ?? node.respawnMinutes) - elapsed);
    if (node.respawnRemaining === 0) {
      node.active = true;
      node.health = node.maxHealth;
      respawned.push(node.id);
    }
  }
  return respawned;
}

export function getGatherRule(nodeType) {
  return NODE_RULES[nodeType] ?? null;
}
