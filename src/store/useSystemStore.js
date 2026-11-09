import { create } from 'zustand';
import { db, initializeDatabase, completeQuest, addSkill } from '../data/db.js';
import { generateDailyQuests, isPenaltyDue, localDayKey } from '../engine/quests.js';
import { validatePrerequisites } from '../engine/skills.js';

export const useSystemStore = create((set, get) => ({
  loading: true,
  error: '',
  profile: null,
  attributes: {},
  skills: [],
  quests: [],
  xpEvents: [],
  redemptions: [],
  dungeons: [],
  recovery: false,
  dailyCount: 3,
  async refresh() {
    try {
      await initializeDatabase();
      const [profile, attributes, skills, quests, xpEvents, redemptions, dungeons, recovery, dailyCount] = await Promise.all([
        db.profile.get('player'),
        db.attributes.toArray(),
        db.skills.toArray(),
        db.quests.orderBy('createdAt').reverse().toArray(),
        db.xpEvents.orderBy('createdAt').reverse().toArray(),
        db.redemptions.toArray(),
        db.dungeons.toArray(),
        db.settings.get('recovery'),
        db.settings.get('dailyCount'),
      ]);
      set({
        profile,
        attributes: Object.fromEntries(attributes.map((item) => [item.key, item])),
        skills,
        quests,
        xpEvents,
        redemptions,
        dungeons,
        recovery: Boolean(recovery?.value),
        dailyCount: Math.max(1, Math.min(4, Number(dailyCount?.value) || 3)),
        loading: false,
        error: '',
      });
    } catch (error) {
      set({ loading: false, error: error.message || 'Could not load local data.' });
    }
  },
  async saveProfile(changes) {
    const profile = { ...get().profile, ...changes };
    if (!profile.name?.trim()) throw new Error('Enter a player name.');
    await db.profile.put(profile);
    await get().refresh();
  },
  async generateQuests(count = get().dailyCount) {
    const now = new Date();
    const today = localDayKey(now);
    if (get().recovery) throw new Error('Recovery mode is active. Daily quests are paused.');
    await db.transaction('rw', db.quests, async () => {
      const existing = await db.quests.toArray();
      if (existing.some((quest) => localDayKey(quest.createdAt) === today)) return;
      const quests = generateDailyQuests({ date: now, skills: get().skills, count });
      await db.quests.bulkAdd(quests);
    });
    await get().refresh();
  },
  async completeQuest(id, report) {
    await completeQuest(id, report);
    await get().updateDungeons(1);
    await get().refresh();
  },
  async addSkill(skill) {
    const created = await addSkill(skill);
    await get().refresh();
    return created;
  },
  async setQuestStatus(id, status) {
    await db.quests.update(id, { status });
    await get().refresh();
  },
  async updateSkill(id, changes) {
    if (changes.prerequisites) {
      const skills = await db.skills.toArray();
      validatePrerequisites(id, changes.prerequisites, skills);
    }
    await db.skills.update(id, changes);
    await get().refresh();
  },
  async updateQuest(id, changes) {
    await db.quests.update(id, changes);
    await get().refresh();
  },
  async setRecovery(value) {
    await db.settings.put({ key: 'recovery', value });
    set({ recovery: value });
  },
  async setDailyCount(value) {
    const dailyCount = Math.max(1, Math.min(4, Number(value) || 3));
    await db.settings.put({ key: 'dailyCount', value: dailyCount });
    set({ dailyCount });
  },
  async claimReward(type) {
    const date = localDayKey();
    await db.transaction('rw', db.redemptions, db.quests, async () => {
      const id = `${date}-${type}`;
      const previousClaim = await db.redemptions
        .where('[date+type]')
        .equals([date, type])
        .first();
      if (previousClaim) throw new Error('This reward has already been claimed today.');
      const quests = await db.quests.toArray();
      const required = quests.filter((quest) => quest.required && localDayKey(quest.createdAt) === date);
      if (!required.length || required.some((quest) => quest.status !== 'completed')) {
        throw new Error('Complete every required daily quest before claiming a reward.');
      }
      await db.redemptions.add({ id, date, type, redeemedAt: new Date().toISOString() });
    });
    await get().refresh();
  },
  async createDungeon(dungeon) {
    const item = { id: `dungeon-${Date.now()}`, status: 'active', progress: 0, ...dungeon };
    await db.transaction('rw', db.dungeons, async () => {
      const active = await db.dungeons.where('status').equals('active').count();
      if (active) throw new Error('Complete or end your active dungeon before starting another.');
      await db.dungeons.add(item);
    });
    await get().refresh();
  },
  async updateDungeons(progress) {
    const active = await db.dungeons.where('status').equals('active').first();
    if (!active) return;
    const next = Math.min(active.duration, active.progress + progress);
    await db.dungeons.update(active.id, { progress: next, status: next >= active.duration ? 'completed' : 'active' });
    await get().refresh();
  },
  async expireQuests(now = new Date()) {
    const due = get().quests.filter((quest) => ['pending', 'in-progress'].includes(quest.status)
      && new Date(now).getTime() >= new Date(quest.deadline).getTime());
    for (const quest of due) {
      await db.transaction('rw', db.quests, async () => {
        const current = await db.quests.get(quest.id);
        if (current && ['pending', 'in-progress'].includes(current.status)
          && new Date(now).getTime() >= new Date(current.deadline).getTime()) {
          await db.quests.update(quest.id, { status: 'expired', expiredAt: new Date(now).toISOString() });
        }
      });
    }
    const penaltyDue = get().quests.filter((quest) => isPenaltyDue(quest, now) && !quest.penaltyCreated);
    for (const quest of penaltyDue) {
      await db.transaction('rw', db.quests, async () => {
        const current = await db.quests.get(quest.id);
        if (!current || current.status !== 'expired' || current.penaltyCreated
          || !isPenaltyDue(current, now)) return;
        if (get().recovery) {
          await db.quests.update(quest.id, { penaltyCreated: true, penaltySuppressed: true });
          return;
        }
        await db.quests.add({
          id: `recovery-${quest.id}`,
          title: `Reset: ${current.title}`,
          description: `A gentle recovery-sized restart related to: ${current.title}. Adjust or skip if unwell.`,
          domain: current.domain,
          attributes: current.attributes,
          xpReward: Math.max(10, Math.floor(current.xpReward / 2)),
          duration: Math.min(15, current.duration || 10),
          difficulty: 'Easy',
          evidence: 'Record a brief completion note.',
          status: 'pending',
          required: false,
          penalty: true,
          createdAt: new Date(now).toISOString(),
          deadline: new Date(new Date(now).getTime() + 24 * 60 * 60 * 1000).toISOString(),
        });
        await db.quests.update(quest.id, { penaltyCreated: true });
      });
    }
    if (due.length || penaltyDue.length) await get().refresh();
  },
}));
