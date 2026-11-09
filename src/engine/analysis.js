import { ATTRIBUTE_KEYS, ATTRIBUTE_LABELS } from './progression.js';
import { skillState } from './skills.js';

export function analyzeSystem({ attributes = {}, skills = [], quests = [], recovery = false }) {
  const lowest = ATTRIBUTE_KEYS
    .map((key) => ({ key, level: attributes[key]?.level || 1 }))
    .sort((a, b) => a.level - b.level)[0];
  const active = skills.filter((skill) => skillState(skill, skills).status === 'active');
  const weakest = [...active].sort((a, b) => a.level - b.level)[0];
  const completed = quests.filter((quest) => quest.status === 'completed').length;
  const measured = quests.filter((quest) => ['completed', 'skipped', 'expired'].includes(quest.status));
  const rate = measured.length ? Math.round((completed / measured.length) * 100) : null;
  const insights = [`${ATTRIBUTE_LABELS[lowest.key]} is your lowest attribute at level ${lowest.level}.`];
  if (weakest) insights.push(`${weakest.name} is your least advanced active skill at level ${weakest.level}.`);
  const locked = skills.filter((skill) => skillState(skill, skills).status === 'locked');
  if (locked.length) {
    const first = locked[0];
    const missingNames = skillState(first, skills).missing
      .map((id) => skills.find((skill) => skill.id === id)?.name || 'missing prerequisite');
    insights.push(`${first.name} is locked until ${missingNames.join(', ')} reaches level 1.`);
  }
  if (rate !== null) insights.push(`Quest completion rate in the selected history: ${rate}%.`);
  if (recovery) insights.push('Recovery mode is active. Training quests are paused; resume only when ready.');
  return { insights, weakestAttribute: lowest.key, weakestSkill: weakest?.id || null, completionRate: rate };
}
