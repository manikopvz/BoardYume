const defineQuest = (id, title, description, objectives, rewards, prerequisite = null) => Object.freeze({
  id,
  title,
  description,
  objectives: Object.freeze(objectives.map((objective) => Object.freeze(objective))),
  rewards: Object.freeze(rewards),
  prerequisite,
});

export const QUESTS = Object.freeze({
  first_steps: defineQuest('first_steps', 'Mầm xanh đầu tiên', 'Cuốc đất, gieo hạt và tưới cây đầu tiên.', [
    { event: 'tile_tilled', target: '*', quantity: 1 },
    { event: 'crop_planted', target: '*', quantity: 1 },
    { event: 'crop_watered', target: '*', quantity: 1 },
  ], { money: 40, items: { carrot_seed: 3 } }),
  first_harvest: defineQuest('first_harvest', 'Giỏ nông sản', 'Thu hoạch năm nông sản bất kỳ.', [
    { event: 'crop_harvested', target: '*', quantity: 5 },
  ], { money: 75, xp: 25, unlockCrops: ['tomato'] }, 'first_steps'),
  sturdy_materials: defineQuest('sturdy_materials', 'Vật liệu vững chắc', 'Chế tạo ván gỗ và khối đá.', [
    { event: 'item_crafted', target: 'plank', quantity: 4 },
    { event: 'item_crafted', target: 'stone_block', quantity: 3 },
  ], { money: 100, xp: 35, unlockBuildings: ['windmill'] }, 'first_harvest'),
  growing_home: defineQuest('growing_home', 'Khu vườn lớn dần', 'Hoàn thành ba công trình mới.', [
    { event: 'building_completed', target: '*', quantity: 3 },
  ], { money: 150, xp: 50, unlockCrops: ['corn', 'strawberry'] }, 'sturdy_materials'),
  market_day: defineQuest('market_day', 'Ngày họp chợ', 'Bán nông sản để thu về 250 đồng.', [
    { event: 'money_earned', target: 'sale', quantity: 250 },
  ], { money: 125, xp: 60, unlockBuildings: ['market', 'kitchen'] }, 'growing_home'),
  artisan: defineQuest('artisan', 'Người thợ lành nghề', 'Sản xuất năm món hàng chế biến.', [
    { event: 'item_crafted', target: 'product', quantity: 5 },
  ], { money: 220, xp: 90, unlockCrops: ['sunflower', 'blueberry'] }, 'market_day'),
  garden_dream: defineQuest('garden_dream', 'Khu vườn trong mơ', 'Mở rộng đất và nâng cấp nhà.', [
    { event: 'land_expanded', target: '*', quantity: 1 },
    { event: 'house_upgraded', target: '*', quantity: 1 },
  ], { money: 400, xp: 160, unlockCrops: ['pumpkin', 'watermelon'], unlockBuildings: ['garden_lamp', 'flower_arch'] }, 'artisan'),
});

export const QUEST_LIST = Object.freeze(Object.values(QUESTS));

export function getQuest(questId) {
  return QUESTS[questId] ?? null;
}

export function createQuestState() {
  return {
    active: ['first_steps'],
    completed: [],
    claimed: [],
    progress: {},
  };
}

export function recordQuestEvent(state, event, target = '*', quantity = 1) {
  const newlyCompleted = [];
  const activeIds = [...state.quests.active];
  for (const questId of activeIds) {
    const quest = getQuest(questId);
    if (!quest) continue;
    let touched = false;
    const questProgress = state.quests.progress[questId] ?? {};
    quest.objectives.forEach((objective, index) => {
      const targetMatches = objective.target === '*' || objective.target === target;
      if (objective.event !== event || !targetMatches) return;
      questProgress[index] = Math.min(objective.quantity, (questProgress[index] ?? 0) + quantity);
      touched = true;
    });
    if (!touched) continue;
    state.quests.progress[questId] = questProgress;
    const complete = quest.objectives.every((objective, index) => (questProgress[index] ?? 0) >= objective.quantity);
    if (complete && !state.quests.completed.includes(questId)) {
      state.quests.completed.push(questId);
      state.quests.active = state.quests.active.filter((id) => id !== questId);
      newlyCompleted.push(questId);
      const nextQuest = QUEST_LIST.find((candidate) => candidate.prerequisite === questId);
      if (nextQuest && !state.quests.active.includes(nextQuest.id) && !state.quests.completed.includes(nextQuest.id)) {
        state.quests.active.push(nextQuest.id);
      }
    }
  }
  return newlyCompleted;
}
