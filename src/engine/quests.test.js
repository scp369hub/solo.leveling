import { describe, expect, it } from 'vitest';
import { generateDailyQuests, getRoast, isPenaltyDue, reportXp } from './quests.js';

describe('quest engine', () => {
  it('generates a manageable daily plan and does not reward locked skill quests', () => {
    const quests = generateDailyQuests({
      date: new Date('2026-03-04T12:00:00'),
      skills: [
        { id: 'net', name: 'Networking', level: 0, prerequisites: [] },
        { id: 'cyber', name: 'Cybersecurity', level: 0, prerequisites: ['net'] },
      ],
      count: 3,
    });
    expect(quests).toHaveLength(3);
    expect(quests.some((quest) => quest.skillId === 'cyber')).toBe(false);
    expect(quests.some((quest) => quest.skillId === 'net')).toBe(true);
    expect(quests.every((quest) => quest.status === 'pending' && quest.required)).toBe(true);
  });

  it('distributes all XP exactly across configured attributes', () => {
    const earned = reportXp({ xpReward: 101, attributes: { agility: 50, endurance: 30, strength: 20 } });
    expect(Object.values(earned).reduce((sum, amount) => sum + amount, 0)).toBe(101);
    expect(earned.strength).toBe(21);
  });

  it('waits 24 hours after expiry before penalty and returns context-based copy', () => {
    const deadline = new Date('2026-03-04T23:59:59');
    const quest = { status: 'expired', deadline: deadline.toISOString(), domain: 'Physical' };
    expect(isPenaltyDue(quest, new Date(deadline.getTime() + 23 * 60 * 60 * 1000))).toBe(false);
    expect(isPenaltyDue(quest, new Date(deadline.getTime() + 24 * 60 * 60 * 1000))).toBe(true);
    expect(isPenaltyDue({ ...quest, penalty: true }, new Date(deadline.getTime() + 48 * 60 * 60 * 1000))).toBe(false);
    expect(getRoast(quest)).toMatch(/recovery/i);
  });
});
