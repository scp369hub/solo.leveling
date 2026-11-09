import { beforeEach, describe, expect, it } from 'vitest';
import { db, initializeDatabase } from '../data/db.js';
import { localDayKey } from '../engine/quests.js';
import { useSystemStore } from './useSystemStore.js';

describe('application workflows', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    await initializeDatabase();
    useSystemStore.setState({
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
    });
    await useSystemStore.getState().refresh();
  });

  it('respects workload settings and prevents generating duplicate daily quests', async () => {
    const store = useSystemStore.getState();
    await store.setDailyCount(1);
    await store.generateQuests();
    await useSystemStore.getState().generateQuests();
    expect(useSystemStore.getState().quests).toHaveLength(1);
  });

  it('claims each reward type only once and only after required quests are complete', async () => {
    const date = localDayKey();
    await db.quests.add({
      id: 'required-today',
      title: 'Mission',
      status: 'pending',
      required: true,
      createdAt: new Date().toISOString(),
      deadline: new Date(Date.now() + 60_000).toISOString(),
      xpReward: 40,
      attributes: { awareness: 100 },
    });
    await useSystemStore.getState().refresh();
    await expect(useSystemStore.getState().claimReward('purchase')).rejects.toThrow(/complete every required/i);
    await db.quests.update('required-today', { status: 'completed' });
    await useSystemStore.getState().refresh();
    await useSystemStore.getState().claimReward('purchase');
    await expect(useSystemStore.getState().claimReward('purchase')).rejects.toThrow(/already been claimed/i);
    expect(await db.redemptions.get(`${date}-purchase`)).toBeTruthy();
  });

  it('creates only one optional recovery follow-up after the 24-hour grace period', async () => {
    const deadline = new Date('2026-03-04T12:00:00.000Z');
    const expiredAt = new Date(deadline.getTime() + 24 * 60 * 60 * 1000);
    await db.quests.add({
      id: 'missed', title: 'Missed learning', domain: 'Learning', status: 'expired',
      deadline: deadline.toISOString(), expiredAt: expiredAt.toISOString(), xpReward: 40,
      duration: 30, attributes: { intelligence: 100 }, createdAt: deadline.toISOString(),
    });
    await useSystemStore.getState().refresh();
    const now = new Date(expiredAt.getTime());
    await useSystemStore.getState().expireQuests(now);
    await useSystemStore.getState().expireQuests(now);
    const followups = await db.quests.filter((quest) => quest.penalty === true).toArray();
    expect(followups).toHaveLength(1);
    expect(followups[0].required).toBe(false);
    expect(followups[0].duration).toBe(15);
  });

  it('suppresses penalty follow-ups while recovery mode is enabled', async () => {
    await db.quests.add({
      id: 'recovery-missed', title: 'Missed workout', domain: 'Physical', status: 'expired',
      deadline: '2026-03-04T12:00:00.000Z', xpReward: 40, duration: 30,
      attributes: { strength: 100 }, createdAt: '2026-03-04T11:00:00.000Z',
    });
    await useSystemStore.getState().refresh();
    await useSystemStore.getState().setRecovery(true);
    await useSystemStore.getState().expireQuests(new Date('2026-03-05T13:00:00.000Z'));
    expect(await db.quests.get('recovery-missed')).toMatchObject({ penaltySuppressed: true, penaltyCreated: true });
    expect(await db.quests.filter((quest) => quest.penalty === true).count()).toBe(0);
  });
});
