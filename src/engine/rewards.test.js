import { describe, expect, it } from 'vitest';
import { dailyRewardStatus } from './rewards.js';

describe('daily reward rules', () => {
  const date = new Date('2026-04-02T12:00:00');
  const quests = [
    { required: true, status: 'completed', createdAt: '2026-04-02T09:00:00' },
    { required: true, status: 'pending', createdAt: '2026-04-02T09:00:00' },
    { required: false, status: 'pending', createdAt: '2026-04-02T09:00:00' },
  ];

  it('unlocks only after every required quest is complete', () => {
    expect(dailyRewardStatus(quests, [], date).unlocked).toBe(false);
    expect(dailyRewardStatus(quests.map((quest) => ({ ...quest, status: 'completed' })), [], date).unlocked).toBe(true);
  });

  it('tracks a claimed reward by type and local daily key', () => {
    const status = dailyRewardStatus(quests, [{ date: '2026-04-02', type: 'purchase' }], date);
    expect(status.claimed('purchase')).toBe(true);
    expect(status.claimed('exploration')).toBe(false);
  });
});
