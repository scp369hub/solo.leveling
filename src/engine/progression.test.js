import { describe, expect, it } from 'vitest';
import { addXp, calculateOverall, xpToNextLevel } from './progression.js';

describe('progression formulas', () => {
  it('levels attributes independently and carries overflow XP', () => {
    expect(addXp(1, 0, 100)).toEqual({ level: 2, xp: 0, levelsGained: [2] });
    expect(addXp(1, 80, 350)).toEqual({ level: 3, xp: 48, levelsGained: [2, 3] });
    expect(xpToNextLevel(3)).toBe(519);
  });

  it('uses the balanced geometric mean instead of total XP or attribute sum', () => {
    const even = { strength: { level: 4 }, endurance: { level: 4 }, agility: { level: 4 }, intelligence: { level: 4 }, awareness: { level: 4 } };
    const lopsided = { strength: { level: 20 }, endurance: { level: 1 }, agility: { level: 1 }, intelligence: { level: 1 }, awareness: { level: 1 } };
    expect(calculateOverall(even).level).toBe(4);
    expect(calculateOverall(lopsided).level).toBe(1);
    expect(calculateOverall(lopsided).blockers.map((item) => item.key)).toContain('endurance');
  });
});
