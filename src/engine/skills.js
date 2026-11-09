import { addXp, xpToNextLevel } from './progression.js';

export function skillState(skill, allSkills) {
  if (skill.archived) return { status: 'archived', missing: [] };
  const missing = (skill.prerequisites || []).filter((id) => {
    const prerequisite = allSkills.find((item) => item.id === id);
    return !prerequisite || prerequisite.level < 1 || prerequisite.archived;
  });
  return { status: missing.length ? 'locked' : 'active', missing };
}

export function progressSkill(skill, earnedXp) {
  let level = Math.max(0, skill.level ?? 0);
  let xp = Math.max(0, skill.xp || 0) + Math.max(0, earnedXp);
  let threshold = xpToNextLevel(level);
  while (xp >= threshold) {
    xp -= threshold;
    level += 1;
    threshold = xpToNextLevel(level);
  }
  return { ...skill, level, xp, xpToNext: threshold };
}

export function validatePrerequisites(skillId, prerequisites, skills) {
  if (prerequisites.includes(skillId)) throw new Error('A skill cannot require itself.');
  const graph = new Map(skills.map((skill) => [skill.id, skill.prerequisites || []]));
  graph.set(skillId, prerequisites);
  const visits = new Set();
  const visiting = new Set();
  function visit(id) {
    if (visiting.has(id)) return true;
    if (visits.has(id)) return false;
    visiting.add(id);
    for (const prerequisite of graph.get(id) || []) {
      if (visit(prerequisite)) return true;
    }
    visiting.delete(id);
    visits.add(id);
    return false;
  }
  if (visit(skillId)) throw new Error('Prerequisites cannot contain a dependency cycle.');
  if (prerequisites.some((id) => !skills.some((skill) => skill.id === id))) {
    throw new Error('Choose an existing skill as a prerequisite.');
  }
  return true;
}
