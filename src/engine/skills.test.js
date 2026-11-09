import { describe, expect, it } from 'vitest';
import { progressSkill, skillState, validatePrerequisites } from './skills.js';

describe('skill progression and prerequisites', () => {
  it('keeps unmet prerequisites locked and activates the skill at level one', () => {
    const skills = [{ id: 'net', name: 'Networking', level: 0 }, { id: 'cyber', name: 'Cybersecurity', level: 0, prerequisites: ['net'] }];
    expect(skillState(skills[1], skills)).toEqual({ status: 'locked', missing: ['net'] });
    const grown = progressSkill(skills[0], 100);
    const unlockedSkills = [grown, skills[1]];
    expect(grown.level).toBe(1);
    expect(skillState(skills[1], unlockedSkills).status).toBe('active');
  });

  it('rejects unknown dependencies and dependency cycles', () => {
    const skills = [{ id: 'a', prerequisites: ['b'] }, { id: 'b' }];
    expect(() => validatePrerequisites('b', ['a'], skills)).toThrow(/cycle/i);
    expect(() => validatePrerequisites('b', ['unknown'], skills)).toThrow(/existing skill/i);
  });

  it('does not lose XP when one quest crosses multiple levels', () => {
    const result = progressSkill({ id: 'skill', level: 0, xp: 0 }, 400);
    expect(result.level).toBe(2);
    expect(result.xp).toBe(200);
  });
});
