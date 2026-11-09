import { localDayKey } from './quests.js';

export function dailyRewardStatus(quests, redeemed = [], date = new Date()) {
  const dayKey = localDayKey(date);
  const required = quests.filter((quest) => quest.required && localDayKey(quest.createdAt) === dayKey);
  const unlocked = required.length > 0 && required.every((quest) => quest.status === 'completed');
  return {
    unlocked,
    claimed: (type) => redeemed.some((item) => item.date === dayKey && item.type === type),
    completed: required.filter((quest) => quest.status === 'completed').length,
    total: required.length,
    dayKey,
  };
}
