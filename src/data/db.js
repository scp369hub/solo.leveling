import Dexie from 'dexie';
import { ATTRIBUTE_KEYS, calculateOverall, addXp } from '../engine/progression.js';
import { reportXp } from '../engine/quests.js';
import { progressSkill, validatePrerequisites } from '../engine/skills.js';

export const db = new Dexie('shadow-system');
const schemaV2 = {
  profile: 'id',
  attributes: 'key',
  skills: 'id, archived',
  quests: 'id, createdAt, status',
  xpEvents: '++id, questId, createdAt, type',
  redemptions: 'id, date, type, [date+type]',
  dungeons: 'id, status',
  recommendations: 'id, category',
  settings: 'key',
};

db.version(1).stores({ ...schemaV2, redemptions: 'id, date, type' });
db.version(2).stores(schemaV2);

export const DEFAULT_PROFILE = {
  id: 'player',
  name: 'Player',
  role: 'Initiate',
  monthlyIncome: 0,
  currency: 'USD',
  incomeUpdatedAt: new Date().toISOString().slice(0, 10),
  createdAt: new Date().toISOString(),
};

export async function initializeDatabase() {
  if (!(await db.profile.get('player'))) await db.profile.put(DEFAULT_PROFILE);
  for (const key of ATTRIBUTE_KEYS) {
    if (!(await db.attributes.get(key))) await db.attributes.put({ key, level: 1, xp: 0 });
  }
  if (!(await db.settings.get('recovery'))) await db.settings.put({ key: 'recovery', value: false });
  if (!(await db.settings.get('dailyCount'))) await db.settings.put({ key: 'dailyCount', value: 3 });
}

export async function completeQuest(questId, report = {}, now = new Date()) {
  return db.transaction('rw', db.quests, db.attributes, db.skills, db.xpEvents, async () => {
    const quest = await db.quests.get(questId);
    if (!quest) throw new Error('Quest not found.');
    if (quest.status === 'completed' || quest.rewardedAt) throw new Error('Quest has already been rewarded.');
    if (quest.status !== 'pending' && quest.status !== 'in-progress') throw new Error('This quest can no longer be completed.');
    if (new Date(now).getTime() > new Date(quest.deadline).getTime()) throw new Error('This quest deadline has passed.');
    const earned = reportXp(quest);
    for (const [key, amount] of Object.entries(earned)) {
      const current = await db.attributes.get(key);
      if (!current) throw new Error(`Unknown attribute: ${key}`);
      const result = addXp(current.level, current.xp, amount);
      await db.attributes.put({ ...current, ...result, key });
      await db.xpEvents.add({ questId, type: 'attribute', targetId: key, amount, report, createdAt: new Date(now).toISOString() });
    }
    if (quest.skillId && quest.skillXp) {
      const skill = await db.skills.get(quest.skillId);
      if (skill && !skill.archived) {
        await db.skills.put(progressSkill(skill, quest.skillXp));
        await db.xpEvents.add({ questId, type: 'skill', targetId: skill.id, amount: quest.skillXp, report, createdAt: new Date(now).toISOString() });
      }
    }
    await db.quests.update(questId, { status: 'completed', report, completedAt: new Date(now).toISOString(), rewardedAt: new Date(now).toISOString() });
    const attributes = Object.fromEntries((await db.attributes.toArray()).map((item) => [item.key, item]));
    return { earned, overall: calculateOverall(attributes) };
  });
}

export async function addSkill(skill) {
  const skills = await db.skills.toArray();
  const normalized = {
    id: globalThis.crypto?.randomUUID?.() || `skill-${Date.now()}`,
    level: 0,
    xp: 0,
    prerequisites: [],
    archived: false,
    ...skill,
  };
  validatePrerequisites(normalized.id, normalized.prerequisites, skills);
  await db.skills.add(normalized);
  return normalized;
}

export async function exportData() {
  const data = {};
  for (const table of db.tables) data[table.name] = await table.toArray();
  return { format: 'shadow-system-backup', version: 1, exportedAt: new Date().toISOString(), data };
}

export async function importData(snapshot) {
  if (snapshot?.format !== 'shadow-system-backup' || snapshot.version !== 1 || !snapshot.data) {
    throw new Error('Unsupported or invalid backup file.');
  }
  const tables = new Map(db.tables.map((table) => [table.name, table]));
  for (const [name, rows] of Object.entries(snapshot.data)) {
    if (!tables.has(name) || !Array.isArray(rows)) throw new Error(`Invalid backup table: ${name}`);
  }
  const data = { ...snapshot.data };
  if (Array.isArray(data.redemptions)) {
    const uniqueClaims = new Map(data.redemptions.map((claim) => [
      `${claim.date}-${claim.type}`,
      { ...claim, id: `${claim.date}-${claim.type}` },
    ]));
    data.redemptions = [...uniqueClaims.values()];
  }
  await db.transaction('rw', ...db.tables, async () => {
    for (const table of db.tables) {
      await table.clear();
      const rows = data[table.name] || [];
      if (rows.length) await table.bulkPut(rows);
    }
  });
  await initializeDatabase();
}
