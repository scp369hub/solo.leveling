import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import App from './App.jsx';
import { db, initializeDatabase } from './data/db.js';
import { useSystemStore } from './store/useSystemStore.js';

afterEach(cleanup);

describe('application dashboard', () => {
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

  it('renders the mobile dashboard with quest, analysis, and reward sections', async () => {
    render(<App />);
    expect(await screen.findByRole('heading', { name: "Today's quests" })).toBeInTheDocument();
    expect(screen.getByText('System analysis')).toBeInTheDocument();
    expect(screen.getByText('Earn your claim')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument();
  });
});
