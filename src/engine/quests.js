import { skillState } from './skills.js';

export const DAILY_TEMPLATES = [
  { title: 'Strength foundation', description: 'Complete 2 comfortable sets of 8 bodyweight squats or push-ups. Stop if you feel pain.', domain: 'Physical', attributes: { strength: 60, endurance: 20, agility: 20 }, duration: 15, difficulty: 'Easy', evidence: 'Record exercise and completed sets/repetitions.' },
  { title: 'Move with intent', description: 'Take a brisk walk or easy jog for 15 minutes at a pace that lets you speak comfortably.', domain: 'Physical', attributes: { endurance: 60, agility: 40 }, duration: 15, difficulty: 'Easy', evidence: 'Record activity and duration; distance is optional.' },
  { title: 'Focused learning', description: 'Study a topic for 20 minutes, then write one key idea from memory.', domain: 'Learning', attributes: { intelligence: 80, awareness: 20 }, duration: 20, difficulty: 'Easy', evidence: 'Record topic, duration, and one recalled idea.' },
  { title: 'Pattern journal', description: 'Write a short reflection: one observation, one prediction, and what you learned.', domain: 'Awareness', attributes: { awareness: 80, intelligence: 20 }, duration: 10, difficulty: 'Easy', evidence: 'Record your observation and reflection.' },
];

export function localDayKey(value = new Date()) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function generateDailyQuests({ date = new Date(), skills = [], count = 3, previousTitles = [] } = {}) {
  const activeSkills = skills.filter((skill) => skillState(skill, skills).status === 'active');
  const day = new Date(date).getDate();
  const templates = DAILY_TEMPLATES.filter((template) => !previousTitles.includes(template.title));
  const selected = [];
  const physical = templates.filter((item) => item.domain === 'Physical');
  const learning = templates.filter((item) => item.domain === 'Learning');
  if (physical.length) selected.push(physical[day % physical.length]);
  if (learning.length) selected.push(learning[day % learning.length]);
  if (activeSkills.length && selected.length < count) {
    const skill = activeSkills[day % activeSkills.length];
    selected.push({
      title: `Skill practice: ${skill.name}`,
      description: `Spend 15 focused minutes practicing ${skill.name}. Define one small, tangible outcome.`,
      domain: 'Skill',
      attributes: { intelligence: 60, awareness: 40 },
      skillId: skill.id,
      skillXp: 20,
      duration: 15,
      difficulty: 'Easy',
      evidence: 'Record the practice and tangible outcome.',
    });
  }
  if (selected.length < count) {
    const extra = DAILY_TEMPLATES.find((item) => !selected.includes(item));
    if (extra) selected.push(extra);
  }
  return selected.slice(0, Math.max(1, Math.min(4, count))).map((template, index) => ({
    id: `quest-${localDayKey(date)}-${index}-${globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)}`,
    ...template,
    xpReward: 40,
    status: 'pending',
    required: true,
    deadline: new Date(new Date(date).setHours(23, 59, 59, 999)).toISOString(),
    createdAt: new Date(date).toISOString(),
  }));
}

export function isPenaltyDue(quest, now = new Date()) {
  return quest.status === 'expired' && !quest.penalty
    && new Date(now).getTime() >= new Date(quest.deadline).getTime() + 24 * 60 * 60 * 1000;
}

export function getRoast(quest) {
  const messages = {
    Learning: 'The page is still there. Your follow-through is the missing chapter.',
    Physical: 'Your recovery matters. When ready, return with a plan you can sustain.',
    Skill: 'Progress needs practice, not just a promising skill list.',
    default: 'Your plans are ambitious. Your execution is still missing.',
  };
  return messages[quest.domain] || messages.default;
}

export function reportXp(quest) {
  const total = Math.max(0, Number(quest.xpReward) || 0);
  const entries = Object.entries(quest.attributes || {}).filter(([, share]) => share > 0);
  if (!entries.length) return {};
  const shareTotal = entries.reduce((sum, [, share]) => sum + share, 0);
  const result = {};
  let distributed = 0;
  entries.forEach(([key, share], index) => {
    const amount = index === entries.length - 1
      ? total - distributed
      : Math.floor((total * share) / shareTotal);
    result[key] = amount;
    distributed += amount;
  });
  return result;
}
