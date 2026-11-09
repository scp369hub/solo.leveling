import Dexie from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, exportData, importData, initializeDatabase, completeQuest } from './db.js';

describe('local database transactions and backups', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    await initializeDatabase();
  });

  it('persists a report and prevents duplicate XP reward atomically', async () => {
    await db.quests.add({
      id: 'quest-1', title: 'Focus', status: 'pending', deadline: '2026-04-02T23:59:59.999Z',
      xpReward: 40, attributes: { intelligence: 100 }, createdAt: '2026-04-02T10:00:00.000Z',
    });
    await completeQuest('quest-1', { result: 'Summary written' }, new Date('2026-04-02T12:00:00.000Z'));
    expect((await db.attributes.get('intelligence')).xp).toBe(40);
    expect(await db.xpEvents.where('questId').equals('quest-1').count()).toBe(1);
    await expect(completeQuest('quest-1', {}, new Date('2026-04-02T13:00:00.000Z'))).rejects.toThrow(/already/i);
    expect((await db.attributes.get('intelligence')).xp).toBe(40);
  });

  it('rejects completion after its deadline without rewarding XP', async () => {
    await db.quests.add({
      id: 'late', status: 'pending', deadline: '2026-04-02T11:00:00.000Z',
      xpReward: 40, attributes: { strength: 100 }, createdAt: '2026-04-02T10:00:00.000Z',
    });
    await expect(completeQuest('late', {}, new Date('2026-04-02T12:00:00.000Z'))).rejects.toThrow(/deadline/i);
    expect((await db.attributes.get('strength')).xp).toBe(0);
    expect(await db.xpEvents.where('questId').equals('late').count()).toBe(0);
  });

  it('round-trips JSON backups and validates before replacing data', async () => {
    await db.profile.update('player', { name: 'Test Player' });
    const backup = await exportData();
    backup.data.redemptions = [
      { id: 1, date: '2026-04-02', type: 'purchase' },
      { id: 2, date: '2026-04-02', type: 'purchase' },
    ];
    await db.profile.update('player', { name: 'Changed' });
    await importData(backup);
    expect((await db.profile.get('player')).name).toBe('Test Player');
    expect(await db.redemptions.where('[date+type]').equals(['2026-04-02', 'purchase']).first()).toMatchObject({ date: '2026-04-02', type: 'purchase' });
    expect(await db.redemptions.count()).toBe(1);
    await expect(importData({ format: 'wrong', version: 1 })).rejects.toThrow(/invalid backup/i);
  });

  it('upgrades the prior auto-increment rewards table and indexes daily claims', async () => {
    await db.delete();
    const previousDb = new Dexie('shadow-system');
    previousDb.version(1).stores({
      profile: 'id',
      attributes: 'key',
      skills: 'id, archived',
      quests: 'id, createdAt, status',
      xpEvents: '++id, questId, createdAt, type',
      redemptions: 'id, date, type',
      dungeons: 'id, status',
      recommendations: 'id, category',
      settings: 'key',
    });
    await previousDb.open();
    await previousDb.redemptions.add({ id: '2026-04-02-purchase', date: '2026-04-02', type: 'purchase', redeemedAt: '2026-04-02T10:00:00.000Z' });
    previousDb.close();
    await db.open();
    expect(db.verno).toBe(2);
    expect(await db.redemptions.where('[date+type]').equals(['2026-04-02', 'purchase']).first())
      .toMatchObject({ date: '2026-04-02', type: 'purchase' });
    await db.redemptions.add({ id: 'historical-duplicate', date: '2026-04-02', type: 'purchase', redeemedAt: '2026-04-02T11:00:00.000Z' });
    expect(await db.redemptions.where('[date+type]').equals(['2026-04-02', 'purchase']).count()).toBe(2);
  });
});
