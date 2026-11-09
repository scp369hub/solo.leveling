import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Activity, Archive, ArrowDownToLine, ArrowUpFromLine, Award, BookOpen, Check, ChevronRight,
  CircleHelp, Coins, Dumbbell, Flame, Home, Layers3, ListChecks, LockKeyhole, Plus, RotateCcw,
  Settings2, ShieldAlert, Sparkles, Swords, Trash2, Trophy, UserRound, X,
} from 'lucide-react';
import { useSystemStore } from './store/useSystemStore.js';
import { db, exportData, importData } from './data/db.js';
import { ATTRIBUTE_KEYS, ATTRIBUTE_LABELS, calculateOverall, xpToNextLevel } from './engine/progression.js';
import { analyzeSystem } from './engine/analysis.js';
import { dailyRewardStatus } from './engine/rewards.js';
import { skillState } from './engine/skills.js';
import { getRoast, localDayKey } from './engine/quests.js';

const NAV_ITEMS = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'quests', label: 'Quests', icon: ListChecks },
  { id: 'skills', label: 'Skills', icon: Layers3 },
  { id: 'progress', label: 'Progress', icon: Activity },
  { id: 'system', label: 'System', icon: Settings2 },
];

const RECOMMENDATIONS = [
  { name: 'Resistance band set', category: 'Fitness', price: 18, reason: 'Compact, adjustable resistance for strength work.' },
  { name: 'Used external keyboard', category: 'Programming', price: 25, reason: 'A practical upgrade for longer coding sessions.' },
  { name: 'Networking fundamentals book', category: 'Learning', price: 22, reason: 'Structured study material for building technical foundations.' },
  { name: 'Training journal', category: 'Fitness', price: 8, reason: 'Track sessions and recovery without buying connected gear.' },
];

function Button({ children, variant = '', ...props }) {
  return <button className={`button ${variant}`} {...props}>{children}</button>;
}

function SectionTitle({ eyebrow, title, action }) {
  return <div className="section-title"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h2>{title}</h2></div>{action}</div>;
}

function StatBar({ label, item, icon: Icon }) {
  const needed = xpToNextLevel(item?.level || 1);
  const pct = Math.min(100, Math.round(((item?.xp || 0) / needed) * 100));
  return <div className="stat-row">
    <div className="stat-row-top"><span className="stat-name"><Icon size={15} />{label}</span><span className="muted">LVL {item?.level || 1}</span></div>
    <div className="progress-track"><motion.div className="progress-fill" initial={{ width: 0 }} animate={{ width: `${pct}%` }} /></div>
    <div className="stat-row-bottom"><span>{item?.xp || 0} / {needed} XP</span><span>{pct}%</span></div>
  </div>;
}

function QuestCard({ quest, onComplete, onStatus }) {
  const completed = quest.status === 'completed';
  return <article className={`quest-card ${completed ? 'is-complete' : ''} ${quest.penalty ? 'is-penalty' : ''}`}>
    <div className="quest-card-head"><span className="tag">{quest.domain}</span><span className={`status ${quest.status}`}>{quest.status}</span></div>
    <h3>{quest.title}</h3>
    <p>{quest.description}</p>
    <div className="quest-meta"><span><Sparkles size={14} />{quest.xpReward} XP</span><span>{quest.duration} min</span><span>{quest.difficulty}</span></div>
    {quest.evidence && <p className="evidence"><CircleHelp size={13} /> {quest.evidence} <span className="self-report">Self-reported</span></p>}
    {quest.penalty && <p className="warning-note"><ShieldAlert size={14} /> Recovery challenge—not punishment. Skip if unwell.</p>}
    {quest.status === 'pending' && <div className="quest-actions">
      <Button onClick={() => onComplete(quest)}><Check size={15} /> Report complete</Button>
      <button className="text-button" onClick={() => onStatus(quest.id, 'in-progress')}>Start</button>
      <button className="text-button" onClick={() => onStatus(quest.id, 'skipped')}>Skip</button>
    </div>}
    {quest.status === 'in-progress' && <div className="quest-actions">
      <Button onClick={() => onComplete(quest)}><Check size={15} /> Report complete</Button>
      <button className="text-button" onClick={() => onStatus(quest.id, 'pending')}>Move to pending</button>
    </div>}
    {completed && <div className="completed-line"><Check size={15} /> Completed · XP recorded</div>}
    {quest.status === 'expired' && <><div className="warning-note"><ShieldAlert size={14} /> Missed deadline · recovery reminder may follow</div><p className="roast">{getRoast(quest)}</p></>}
  </article>;
}

function CompleteDialog({ quest, onClose, onSubmit }) {
  const [report, setReport] = useState({ duration: quest.duration || '', result: '', reflection: '' });
  const [busy, setBusy] = useState(false);
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      const succeeded = await onSubmit(report);
      if (succeeded) onClose();
    } finally { setBusy(false); }
  };
  return <div className="overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <form className="dialog" onSubmit={submit}>
      <div className="dialog-head"><div><p className="eyebrow">SELF-REPORTED EVIDENCE</p><h2>{quest.title}</h2></div><button type="button" className="icon-button" aria-label="Close" onClick={onClose}><X size={19} /></button></div>
      <p className="muted">{quest.evidence}</p>
      <label>Time spent (minutes)<input type="number" min="0" value={report.duration} onChange={(e) => setReport({ ...report, duration: e.target.value })} /></label>
      <label>What did you do or produce?<textarea rows="3" value={report.result} onChange={(e) => setReport({ ...report, result: e.target.value })} placeholder="Sets and reps, distance and time, topic, puzzle result…" /></label>
      <label>Recall, reflection, or notes<textarea rows="2" value={report.reflection} onChange={(e) => setReport({ ...report, reflection: e.target.value })} placeholder="For learning quests, note one idea from memory." /></label>
      <div className="dialog-actions"><Button type="button" variant="subtle" onClick={onClose}>Cancel</Button><Button disabled={busy}>{busy ? 'Saving…' : 'Complete quest'}</Button></div>
    </form>
  </div>;
}

function App() {
  const system = useSystemStore();
  const [page, setPage] = useState('home');
  const [reporting, setReporting] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [skillName, setSkillName] = useState('');
  const [selectedPrereqs, setSelectedPrereqs] = useState([]);
  const [shopDraft, setShopDraft] = useState({ name: '', category: 'Learning', price: '', reason: '' });
  const [editingRecommendation, setEditingRecommendation] = useState('');
  const [dungeonType, setDungeonType] = useState('7-Day Discipline Dungeon');
  const importRef = useRef(null);

  useEffect(() => {
    system.refresh().then(async () => {
      await system.expireQuests();
      if (!useSystemStore.getState().recovery) await system.generateQuests();
    }).catch((e) => setError(e.message));
    const timer = window.setInterval(() => system.expireQuests().catch((e) => setError(e.message)), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const today = localDayKey();
  const todaysQuests = system.quests.filter((quest) => localDayKey(quest.createdAt) === today);
  const doneToday = todaysQuests.filter((quest) => quest.status === 'completed').length;
  const overall = useMemo(() => calculateOverall(system.attributes), [system.attributes]);
  const rewards = dailyRewardStatus(system.quests, system.redemptions, new Date());
  const analysis = useMemo(() => analyzeSystem({
    attributes: system.attributes, skills: system.skills, quests: system.quests, recovery: system.recovery,
  }), [system.attributes, system.skills, system.quests, system.recovery]);
  const activeDungeon = system.dungeons.find((dungeon) => dungeon.status === 'active');
  const run = async (action, success = '') => {
    setError(''); setMessage('');
    try { await action(); if (success) setMessage(success); return true; }
    catch (e) { setError(e.message || 'Action failed.'); return false; }
  };

  const generate = () => run(() => system.generateQuests(), 'Today’s missions are ready.');
  const complete = async (report) => run(() => system.completeQuest(reporting.id, report), 'Quest complete. Attribute XP has been recorded.');
  const addNewSkill = async (event) => {
    event.preventDefault();
    await run(async () => {
      await system.addSkill({ name: skillName.trim(), prerequisites: selectedPrereqs });
      setSkillName(''); setSelectedPrereqs([]);
    }, 'Skill added. Edit its prerequisites on the skill card.');
  };
  const claim = (type) => run(() => system.claimReward(type), 'Reward claimed. Enjoy it intentionally.');

  if (system.loading) return <main className="loading-screen"><div className="loader" />Opening local system…</main>;
  if (system.error) return <main className="loading-screen"><ShieldAlert /><p>{system.error}</p><Button onClick={() => system.refresh()}>Try again</Button></main>;
  const profile = system.profile;

  return <div className="app-shell">
    <header className="topbar">
      <div className="brand-mark">S<span>.</span></div><div className="brand-copy"><strong>SHADOW SYSTEM</strong><small>PERSONAL EVOLUTION OS</small></div>
      <button className="profile-chip" onClick={() => setPage('system')}><span className="avatar">{profile?.name?.slice(0, 1)?.toUpperCase() || 'P'}</span><span>{profile?.name || 'Player'}</span><ChevronRight size={14} /></button>
    </header>
    <main className="main-content">
      {message && <div className="toast success"><Check size={16} />{message}<button aria-label="Dismiss" onClick={() => setMessage('')}><X size={15} /></button></div>}
      {error && <div className="toast error"><ShieldAlert size={16} />{error}<button aria-label="Dismiss" onClick={() => setError('')}><X size={15} /></button></div>}
      {page === 'home' && <HomePage {...{ profile, overall, attributes: system.attributes, skills: system.skills, todaysQuests, doneToday, rewards, analysis, activeDungeon, recovery: system.recovery, setPage, generate, claim, onComplete: setReporting, onStatus: (id, status) => run(() => system.setQuestStatus(id, status)) }} />}
      {page === 'quests' && <QuestsPage {...{ todaysQuests, quests: system.quests, generate, recovery: system.recovery, dailyCount: system.dailyCount, setDailyCount: (value) => run(() => system.setDailyCount(value), 'Daily workload preference saved.'), onComplete: setReporting, onStatus: (id, status) => run(() => system.setQuestStatus(id, status)) }} />}
      {page === 'skills' && <SkillsPage skills={system.skills} onAdd={addNewSkill} skillName={skillName} setSkillName={setSkillName} selectedPrereqs={selectedPrereqs} setSelectedPrereqs={setSelectedPrereqs} onArchive={(skill) => run(() => system.updateSkill(skill.id, { archived: !skill.archived }), skill.archived ? 'Skill restored.' : 'Skill archived.')} onPrerequisites={(id, prerequisites) => run(() => system.updateSkill(id, { prerequisites }), 'Prerequisites saved.')} />}
      {page === 'progress' && <ProgressPage {...{ attributes: system.attributes, overall, events: system.xpEvents, dungeons: system.dungeons, activeDungeon, setDungeonType, dungeonType, startDungeon: (dungeon) => run(() => system.createDungeon(dungeon), 'Dungeon started. One active challenge at a time.'), endDungeon: () => run(() => db.dungeons.update(activeDungeon.id, { status: 'ended' }), 'Dungeon ended.'), profile }} />}
      {page === 'system' && <SystemPage {...{ profile, saveProfile: (data) => run(() => system.saveProfile(data), 'Profile saved.'), recovery: system.recovery, setRecovery: (value) => run(() => system.setRecovery(value), value ? 'Recovery mode enabled.' : 'Recovery mode disabled.'), shopDraft, setShopDraft, editingRecommendation, setEditingRecommendation, quests: system.quests, skills: system.skills, attributes: system.attributes, redemptions: system.redemptions, rewards, claim, importRef, refresh: system.refresh, setError, setMessage }} />}
    </main>
    <nav className="bottom-nav" aria-label="Main navigation">
      {NAV_ITEMS.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => setPage(id)} className={page === id ? 'active' : ''} aria-current={page === id ? 'page' : undefined}>
        <Icon size={19} strokeWidth={page === id ? 2.4 : 1.8} /><span>{label}</span>
      </button>)}
    </nav>
    {reporting && <CompleteDialog quest={reporting} onClose={() => setReporting(null)} onSubmit={complete} />}
  </div>;
}

function HomePage({ profile, overall, attributes, skills, todaysQuests, doneToday, rewards, analysis, activeDungeon, recovery, setPage, generate, claim, onComplete, onStatus }) {
  const icons = [Dumbbell, Activity, Flame, BookOpen, Sparkles];
  return <div className="page-stack">
    <section className="hero-panel">
      <div className="hero-orbit"><div className="orbit-core"><span>LVL</span><strong>{overall.level}</strong></div></div>
      <div className="hero-copy"><p className="eyebrow">PLAYER STATUS · {profile?.role || 'Initiate'}</p><h1>{profile?.name || 'Player'}<span className="cyan">.</span></h1>
        <p className="muted">Your next level is earned through balanced growth.</p>
        <div className="hero-income"><Coins size={15} />{new Intl.NumberFormat(undefined, { style: 'currency', currency: profile?.currency || 'USD', maximumFractionDigits: 0 }).format(profile?.monthlyIncome || 0)}<small> monthly income · {profile?.currency || 'USD'}</small></div>
      </div>
      <div className="hero-level-progress"><div className="stat-row-top"><span>OVERALL PROGRESS</span><span>{overall.progress}%</span></div><div className="progress-track"><motion.div className="progress-fill" animate={{ width: `${overall.progress}%` }} /></div><small>Balanced geometric mean · next level {overall.level + 1}</small></div>
    </section>
    {recovery && <div className="recovery-banner"><RotateCcw size={17} /><div><strong>Recovery mode active</strong><small>Daily generation is paused. Resume only when you feel ready.</small></div></div>}
    <section className="panel">
      <SectionTitle eyebrow="CORE ATTRIBUTES" title="Your build" action={<button className="text-button" onClick={() => setPage('progress')}>Full progress <ChevronRight size={14} /></button>} />
      <div className="attributes-grid">{ATTRIBUTE_KEYS.map((key, index) => <StatBar key={key} label={ATTRIBUTE_LABELS[key]} item={attributes[key]} icon={icons[index]} />)}</div>
    </section>
    <section className="panel">
      <SectionTitle eyebrow="DAILY OPERATIONS" title="Today's quests" action={<button className="text-button" onClick={() => setPage('quests')}>View all <ChevronRight size={14} /></button>} />
      <div className="daily-progress"><div><strong>{doneToday}<span> / {todaysQuests.length || 0}</span></strong><small>missions complete</small></div><div className="progress-track"><motion.div className="progress-fill" animate={{ width: `${todaysQuests.length ? doneToday / todaysQuests.length * 100 : 0}%` }} /></div></div>
      {todaysQuests.length ? <div className="quest-list compact">{todaysQuests.slice(0, 2).map((quest) => <QuestCard key={quest.id} quest={quest} onComplete={onComplete} onStatus={onStatus} />)}</div> : <EmptyState title="No missions generated" text="Generate a small, balanced set of daily missions when you’re ready." action={<Button onClick={generate}><Sparkles size={15} /> Generate today's quests</Button>} />}
    </section>
    <section className="split-grid">
      <div className="panel analysis-panel"><SectionTitle eyebrow="RULE-BASED · LOCAL" title="System analysis" /><div className="insight-list">{analysis.insights.slice(0, 3).map((line) => <div key={line} className="insight"><Sparkles size={15} />{line}</div>)}</div><button className="text-button" onClick={() => setPage('system')}>Open system <ChevronRight size={14} /></button></div>
      <div className="panel reward-panel"><SectionTitle eyebrow="DAILY REWARD" title="Earn your claim" /><div className="reward-count">{rewards.completed}<span> / {rewards.total || 0} required</span></div><p className="muted">{rewards.unlocked ? 'All required missions complete. Choose one intentional reward.' : 'Complete today’s required quests to unlock a personal reward.'}</p>{rewards.unlocked ? <div className="reward-buttons"><RewardButton label="Personal treat" type="purchase" rewards={rewards} claim={claim} /><RewardButton label="Leisure hour" type="exploration" rewards={rewards} claim={claim} /></div> : <div className="locked-label"><LockKeyhole size={14} /> Locked</div>}</div>
    </section>
    {activeDungeon && <section className="panel dungeon-strip"><div className="dungeon-icon"><Swords size={20} /></div><div><p className="eyebrow">ACTIVE DUNGEON</p><strong>{activeDungeon.name}</strong><small>{activeDungeon.progress} / {activeDungeon.duration} daily objectives</small></div><div className="dungeon-progress"><span>{Math.round(activeDungeon.progress / activeDungeon.duration * 100)}%</span><div className="progress-track"><div className="progress-fill" style={{ width: `${activeDungeon.progress / activeDungeon.duration * 100}%` }} /></div></div></section>}
    {skills.length > 0 && <section className="panel"><SectionTitle eyebrow="SKILL TREE" title="Skill status" action={<button className="text-button" onClick={() => setPage('skills')}>Manage <ChevronRight size={14} /></button>} /><div className="skill-chip-list">{skills.filter((skill) => !skill.archived).slice(0, 5).map((skill) => <SkillChip key={skill.id} skill={skill} skills={skills} />)}</div></section>}
  </div>;
}

function QuestsPage({ todaysQuests, quests, generate, recovery, dailyCount, setDailyCount, onComplete, onStatus }) {
  return <div className="page-stack"><SectionTitle eyebrow="DAILY OPERATIONS" title="Quest board" action={<Button disabled={recovery || todaysQuests.length > 0} onClick={generate}><Sparkles size={15} />{todaysQuests.length ? 'Today generated' : 'Generate daily quests'}</Button>} />
    <div className="workload-setting"><label>Daily mission target<select value={dailyCount} disabled={todaysQuests.length > 0} onChange={(e) => setDailyCount(e.target.value)}>{[1, 2, 3, 4].map((count) => <option key={count} value={count}>{count} quests</option>)}</select></label><p className="helper-text">Changing this affects future daily generation only.</p></div>
    <div className="quest-summary"><div><strong>{todaysQuests.filter((q) => q.status === 'completed').length}<span>/{todaysQuests.length}</span></strong><small>today complete</small></div><p>Workload is intentionally small. Activity targets are beginner-friendly and adjustable; stop for pain and use recovery mode when needed.</p></div>
    {recovery && <div className="recovery-banner"><RotateCcw size={17} /><div><strong>Recovery mode</strong><small>Turn it off in System when ready to generate quests.</small></div></div>}
    {todaysQuests.length ? <div className="quest-list">{todaysQuests.map((quest) => <QuestCard key={quest.id} quest={quest} onComplete={onComplete} onStatus={onStatus} />)}</div> : <EmptyState title={recovery ? 'Take the recovery you need' : 'No quests for today'} text={recovery ? 'Recovery mode protects your workload. No new missions will be generated.' : 'Generate up to three short missions based on active skills and balanced domains.'} action={!recovery && <Button onClick={generate}><Sparkles size={15} /> Generate quests</Button>} />}
    <SectionTitle eyebrow="HISTORY" title="Recent missions" />
    <div className="history-list">{quests.filter((quest) => localDayKey(quest.createdAt) !== localDayKey()).slice(0, 12).map((quest) => <div className="history-row" key={quest.id}><span className={`history-dot ${quest.status}`} /><div><strong>{quest.title}</strong><small>{new Date(quest.createdAt).toLocaleDateString()} · {quest.domain}</small></div><span className={`status ${quest.status}`}>{quest.status}</span></div>)}</div>
  </div>;
}

function SkillsPage({ skills, onAdd, skillName, setSkillName, selectedPrereqs, setSelectedPrereqs, onArchive, onPrerequisites }) {
  const visible = skills.filter((skill) => !skill.archived);
  return <div className="page-stack"><SectionTitle eyebrow="INDEPENDENT PROGRESSION" title="Skill tree" />
    <section className="panel"><SectionTitle eyebrow="PROPOSE A SKILL" title="Add a skill" /><form className="inline-form" onSubmit={onAdd}><label>Skill name<input required maxLength="40" value={skillName} onChange={(e) => setSkillName(e.target.value)} placeholder="e.g. Python, English, Chess" /></label><Button disabled={!skillName.trim()}><Plus size={15} /> Add skill</Button></form>
      <p className="helper-text">Prerequisites are user-defined and deterministic. Select what must be leveled before this skill is active. You can edit requirements later on each skill card.</p>
      {visible.length > 0 && <div className="prereq-picker"><span>Requires:</span>{visible.map((skill) => <label key={skill.id} className="check-option"><input type="checkbox" checked={selectedPrereqs.includes(skill.id)} onChange={(e) => setSelectedPrereqs(e.target.checked ? [...selectedPrereqs, skill.id] : selectedPrereqs.filter((id) => id !== skill.id))} />{skill.name}</label>)}</div>}
    </section>
    <div className="skills-list">{skills.map((skill) => {
      const state = skillState(skill, skills);
      return <article className={`skill-card ${state.status}`} key={skill.id}><div className="skill-icon">{state.status === 'locked' ? <LockKeyhole size={19} /> : <Layers3 size={19} />}</div><div className="skill-card-content"><div className="skill-title"><div><h3>{skill.name}</h3><span className={`status ${state.status}`}>{state.status}</span></div>{!skill.archived && <button className="icon-button" aria-label={`Archive ${skill.name}`} onClick={() => onArchive(skill)}><Archive size={16} /></button>}{skill.archived && <button className="text-button" onClick={() => onArchive(skill)}>Restore</button>}</div>
        {state.missing.length > 0 && <p className="muted">Locked: requires {state.missing.map((id) => skills.find((item) => item.id === id)?.name || 'unavailable skill').join(', ')}.</p>}
        <div className="stat-row-top"><span>LEVEL {skill.level}</span><span>{skill.xp || 0} / {xpToNextLevel(skill.level)} XP</span></div><div className="progress-track"><div className="progress-fill" style={{ width: `${Math.min(100, Math.round((skill.xp || 0) / xpToNextLevel(skill.level) * 100))}%` }} /></div>
        {(skill.prerequisites || []).length > 0 && <small className="muted prereq-note">Prerequisites: {skill.prerequisites.map((id) => skills.find((item) => item.id === id)?.name).filter(Boolean).join(', ')}</small>}
        {!skill.archived && <details className="prereq-editor"><summary>Edit prerequisites</summary><PrerequisiteEditor skill={skill} skills={skills} onSave={onPrerequisites} /></details>}
      </div></article>;
    })}</div>
    {!skills.length && <EmptyState title="Your tree starts with a skill" text="Add a skill to track its own XP and unlock requirements." />}
    <p className="formula-note">Skill level uses XP thresholds of 100 × current level<sup>1.5</sup>. XP is awarded through linked quests.</p>
  </div>;
}

function PrerequisiteEditor({ skill, skills, onSave }) {
  const [selected, setSelected] = useState(skill.prerequisites || []);
  const choices = skills.filter((item) => item.id !== skill.id && !item.archived);
  return <div className="prereq-picker edit-picker">{choices.map((item) => <label key={item.id} className="check-option"><input type="checkbox" checked={selected.includes(item.id)} onChange={(e) => setSelected(e.target.checked ? [...selected, item.id] : selected.filter((id) => id !== item.id))} />{item.name}</label>)}<Button type="button" variant="subtle" onClick={() => onSave(skill.id, selected)}>Save requirements</Button></div>;
}

function SkillChip({ skill, skills }) {
  const state = skillState(skill, skills);
  return <div className="skill-chip"><span className={state.status === 'locked' ? 'chip-lock' : ''}>{state.status === 'locked' ? <LockKeyhole size={13} /> : <Layers3 size={13} />}{skill.name}</span><small>{state.status === 'locked' ? 'LOCKED' : `LVL ${skill.level}`}</small></div>;
}

function ProgressPage({ attributes, overall, events, dungeons, activeDungeon, dungeonType, setDungeonType, startDungeon, endDungeon, profile }) {
  const [name, setName] = useState(dungeonType);
  const [description, setDescription] = useState('');
  const [duration, setDuration] = useState(7);
  const [budget, setBudget] = useState('');
  const [goal, setGoal] = useState('Discipline');
  const suggestions = RECOMMENDATIONS.filter((item) => !item.price || item.price <= (profile?.monthlyIncome || 0) * 0.1);
  const start = (e) => {
    e.preventDefault();
    startDungeon({ name: name.trim(), description: description.trim(), duration: Number(duration), progress: 0, rewardMultiplier: 1.15 });
  };
  return <div className="page-stack"><SectionTitle eyebrow="LONG-TERM VIEW" title="Progress & challenges" />
    <section className="panel overall-card"><div className="overall-badge"><Trophy size={22} /><strong>LVL {overall.level}</strong></div><div className="overall-copy"><p className="eyebrow">BALANCED OVERALL LEVEL</p><h3>Geometric mean: {overall.geometricMean}</h3><p className="muted">Overall Level = floor(weighted geometric mean of five attribute levels). Equal weights; attributes start at level 1.</p></div></section>
    <section className="panel"><SectionTitle eyebrow="CONTRIBUTORS & BLOCKERS" title="Next level requirements" /><div className="blocker-list">{overall.blockers.length ? overall.blockers.map((item) => <div className="blocker" key={item.key}><span className="blocker-icon">{item.current < item.needed ? <LockKeyhole size={15} /> : <Check size={15} />}</span><div><strong>{ATTRIBUTE_LABELS[item.key]} · level {item.current}</strong><small>{item.message}</small></div></div>) : <p className="muted">No attribute blockers for the next balanced level.</p>}</div><div className="contributors">{overall.contributors.map((item) => <span key={item.key}>{ATTRIBUTE_LABELS[item.key]} <b>LVL {item.level}</b></span>)}</div></section>
    <section className="panel"><SectionTitle eyebrow="ATTRIBUTE DETAIL" title="Development ledger" /><div className="attributes-grid vertical">{ATTRIBUTE_KEYS.map((key) => <StatBar key={key} label={ATTRIBUTE_LABELS[key]} item={attributes[key]} icon={Activity} />)}</div></section>
    <section className="panel"><SectionTitle eyebrow="CHALLENGE MODE" title="One dungeon at a time" /><p className="muted">A completed quest advances the active dungeon by one daily objective. Recovery and missed quests never cause extra physical workload.</p>
      {activeDungeon ? <div className="active-dungeon"><div className="dungeon-heading"><Swords size={20} /><div><strong>{activeDungeon.name}</strong><small>{activeDungeon.description || 'Steady progress, safe workload.'}</small></div><span className="tag">ACTIVE</span></div><div className="progress-track"><div className="progress-fill" style={{ width: `${Math.round(activeDungeon.progress / activeDungeon.duration * 100)}%` }} /></div><small>{activeDungeon.progress} / {activeDungeon.duration} quest completions · {Math.round(activeDungeon.progress / activeDungeon.duration * 100)}%</small><Button variant="subtle" onClick={endDungeon}>End dungeon</Button></div>
        : <form className="dungeon-form" onSubmit={start}><label>Challenge template<select value={dungeonType} onChange={(e) => { setDungeonType(e.target.value); setName(e.target.value); }}><option>7-Day Discipline Dungeon</option><option>7-Day Fitness Dungeon</option><option>7-Day Learning Dungeon</option><option>7-Day Money Dungeon</option></select></label><div className="form-grid"><label>Challenge name<input maxLength="50" value={name} onChange={(e) => setName(e.target.value)} required /></label><label>Daily objectives<input type="number" min="1" max="30" value={duration} onChange={(e) => setDuration(e.target.value)} /></label></div><label>Rules / personal objective<textarea rows="2" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Define a realistic, recovery-safe rule." /></label><Button><Swords size={15} /> Start challenge</Button></form>}
    </section>
    <section className="panel"><SectionTitle eyebrow="PROGRESSION HISTORY" title="Recent XP events" />{events.length ? <div className="history-list">{events.slice(0, 15).map((event) => <div className="history-row" key={event.id}><span className="xp-event-icon"><Sparkles size={14} /></span><div><strong>{event.targetId} +{event.amount} XP</strong><small>{event.type} · {event.report?.result || 'self-reported quest'}</small></div><time>{new Date(event.createdAt).toLocaleDateString()}</time></div>)}</div> : <p className="muted">Completed quests will be recorded here.</p>}</section>
  </div>;
}

function RewardButton({ label, type, rewards, claim }) {
  const claimed = rewards.claimed(type);
  return <Button disabled={!rewards.unlocked || claimed} variant={claimed ? 'subtle' : ''} onClick={() => claim(type)}>{claimed ? <><Check size={14} /> Claimed</> : <><Award size={14} /> {label}</>}</Button>;
}

function EmptyState({ title, text, action }) {
  return <div className="empty-state"><div className="empty-icon"><Sparkles size={20} /></div><h3>{title}</h3><p>{text}</p>{action}</div>;
}

function SystemPage({ profile, saveProfile, recovery, setRecovery, shopDraft, setShopDraft, editingRecommendation, setEditingRecommendation, quests, skills, attributes, redemptions, rewards, claim, importRef, refresh, setError, setMessage }) {
  const [profileDraft, setProfileDraft] = useState(profile);
  const [recommendationRows, setRecommendationRows] = useState([]);
  useEffect(() => setProfileDraft(profile), [profile]);
  useEffect(() => { db.recommendations.toArray().then(setRecommendationRows).catch((e) => setError(e.message)); }, []);
  const result = analyzeSystem({ attributes, skills, quests, recovery });
  const saveRecommendation = async (e) => {
    e.preventDefault();
    setError(''); setMessage('');
    try {
      const row = { ...shopDraft, price: Number(shopDraft.price) || 0, id: editingRecommendation || `item-${Date.now()}` };
      await db.recommendations.put(row);
      setRecommendationRows(await db.recommendations.toArray());
      setShopDraft({ name: '', category: 'Learning', price: '', reason: '' });
      setEditingRecommendation('');
      setMessage('Recommendation saved.');
    } catch (error) { setError(error.message); }
  };
  const deleteRecommendation = async (id) => {
    if (!window.confirm('Remove this recommendation?')) return;
    try {
      await db.recommendations.delete(id);
      setRecommendationRows(await db.recommendations.toArray());
      setMessage('Recommendation removed.');
    } catch (error) { setError(error.message); }
  };
  const editRecommendation = (item) => {
    setEditingRecommendation(item.id);
    setShopDraft({ name: item.name, category: item.category, price: String(item.price || ''), reason: item.reason });
  };
  const downloadBackup = async () => {
    try {
      const backup = await exportData();
      const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url; link.download = `shadow-system-${localDayKey()}.json`; link.click();
      URL.revokeObjectURL(url);
    } catch (error) { setError(error.message); }
  };
  const restoreBackup = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const snapshot = JSON.parse(await file.text());
      if (!window.confirm('Restoring this backup replaces all current local data. Continue?')) return;
      await importData(snapshot);
      await refresh();
      setRecommendationRows(await db.recommendations.toArray());
      setMessage('Backup restored.');
    } catch (error) { setError(error.message || 'Could not restore backup.'); }
    finally { event.target.value = ''; }
  };
  const clearData = async () => {
    if (!window.confirm('Permanently clear all SHADOW SYSTEM data stored on this device? This cannot be undone. Export a backup first if needed.')) return;
    try {
      await db.transaction('rw', ...db.tables, async () => { for (const table of db.tables) await table.clear(); });
      await refresh(); setRecommendationRows([]); setMessage('Local data cleared; a fresh profile was initialized.');
    } catch (error) { setError(error.message); }
  };
  const income = Number(profileDraft.monthlyIncome) || 0;
  const currency = profileDraft.currency || 'USD';
  const affordability = (price) => price <= income * 0.05 ? 'Affordable' : price <= income * 0.2 ? 'Save for later' : 'Not currently recommended';
  const smartPicks = RECOMMENDATIONS.filter((item) => {
    const words = `${profile?.role || ''} ${skills.map((s) => s.name).join(' ')}`.toLowerCase();
    return item.category === 'Fitness' || (item.category === 'Programming' && /python|program|code/.test(words)) || (item.category === 'Learning' && skills.length > 0);
  });
  return <div className="page-stack"><SectionTitle eyebrow="LOCAL CONTROL CENTER" title="System & profile" />
    <section className="panel"><SectionTitle eyebrow="PLAYER PROFILE" title="Identity & income" /><form onSubmit={(e) => { e.preventDefault(); saveProfile({ ...profileDraft, monthlyIncome: income, incomeUpdatedAt: localDayKey() }); }} className="profile-form">
      <div className="form-grid"><label>Player name<input maxLength="40" value={profileDraft.name} onChange={(e) => setProfileDraft({ ...profileDraft, name: e.target.value })} required /></label><label>Current role / class<input maxLength="40" value={profileDraft.role} onChange={(e) => setProfileDraft({ ...profileDraft, role: e.target.value })} /></label></div>
      <div className="form-grid income-grid"><label>Monthly income<input type="number" min="0" step="0.01" value={profileDraft.monthlyIncome} onChange={(e) => setProfileDraft({ ...profileDraft, monthlyIncome: e.target.value })} /></label><label>Currency<select value={currency} onChange={(e) => setProfileDraft({ ...profileDraft, currency: e.target.value })}>{['USD', 'CAD', 'EUR', 'GBP', 'AUD', 'JPY'].map((code) => <option key={code}>{code}</option>)}</select></label></div>
      <p className="helper-text">Income is manual and stays on this device. Last updated: {profile.incomeUpdatedAt || 'not set'} · Account created: {new Date(profile.createdAt).toLocaleDateString()}</p><Button><UserRound size={15} /> Save profile</Button>
    </form></section>
    <section className="panel"><SectionTitle eyebrow="RECOVERY" title="Respect your limits" /><div className="toggle-row"><div><strong>Recovery mode</strong><small>Pauses daily quest generation. It never removes earned XP or applies physical penalties.</small></div><button type="button" role="switch" aria-checked={recovery} className={`switch ${recovery ? 'on' : ''}`} onClick={() => setRecovery(!recovery)}><span /></button></div></section>
    <section className="panel"><SectionTitle eyebrow="PERSONAL RECOMMENDATIONS · NO CHECKOUT" title="Real-world shop" /><p className="muted">Suggestions only—no marketplace, payment processing, or pressure to spend. Affordability compares price with your manually entered monthly income.</p>
      {smartPicks.length > 0 && <div className="shop-grid">{smartPicks.map((item) => <div className="shop-card" key={item.name}><div className="shop-title"><span>{item.category}</span><span className={`affordability ${affordability(item.price).toLowerCase().replaceAll(' ', '-')}`}>{affordability(item.price)}</span></div><h3>{item.name}</h3><p>{item.reason}</p><strong>{new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(item.price)}</strong></div>)}</div>}
      <form className="recommendation-form" onSubmit={saveRecommendation}><h3>{editingRecommendation ? 'Edit recommendation' : 'Add your own recommendation'}</h3><div className="form-grid"><label>Item<input required maxLength="60" value={shopDraft.name} onChange={(e) => setShopDraft({ ...shopDraft, name: e.target.value })} /></label><label>Category<input required maxLength="30" value={shopDraft.category} onChange={(e) => setShopDraft({ ...shopDraft, category: e.target.value })} /></label><label>Estimated price<input type="number" min="0" step="0.01" value={shopDraft.price} onChange={(e) => setShopDraft({ ...shopDraft, price: e.target.value })} required /></label><label>Why useful<input required maxLength="120" value={shopDraft.reason} onChange={(e) => setShopDraft({ ...shopDraft, reason: e.target.value })} /></label></div><Button><Plus size={14} /> {editingRecommendation ? 'Save changes' : 'Add recommendation'}</Button>{editingRecommendation && <Button type="button" variant="subtle" onClick={() => { setEditingRecommendation(''); setShopDraft({ name: '', category: 'Learning', price: '', reason: '' }); }}>Cancel edit</Button>}</form>
      {recommendationRows.map((item) => <div className="recommendation-row" key={item.id}><div><strong>{item.name}</strong><small>{item.category} · {new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(item.price)} · {affordability(item.price)}</small><p>{item.reason}</p></div><div><button className="icon-button" aria-label={`Edit ${item.name}`} onClick={() => editRecommendation(item)}><Settings2 size={15} /></button><button className="icon-button danger-icon" aria-label={`Remove ${item.name}`} onClick={() => deleteRecommendation(item.id)}><Trash2 size={15} /></button></div></div>)}
    </section>
    <section className="panel"><SectionTitle eyebrow="DAILY REWARDS" title="Claim intentionally" /><p className="muted">Each reward type can be claimed once per day, after all required quests are complete. Spending is optional.</p><div className="reward-buttons"><RewardButton label="Personal purchase" type="purchase" rewards={rewards} claim={claim} /><RewardButton label="One hour of exploration" type="exploration" rewards={rewards} claim={claim} /></div>{redemptions.slice(-5).reverse().map((item) => <div className="history-row" key={item.id}><Award size={15} /><div><strong>{item.type === 'purchase' ? 'Personal purchase' : 'Leisure exploration'}</strong><small>{item.date} · manually claimed</small></div></div>)}</section>
    <section className="panel"><SectionTitle eyebrow="RULE-BASED · NO EXTERNAL AI" title="Daily system analysis" /><div className="insight-list">{result.insights.map((line) => <div className="insight" key={line}><Sparkles size={15} />{line}</div>)}</div><p className="helper-text">Analysis uses locally stored levels, quests, and recovery status. No personal data is sent anywhere.</p></section>
    <section className="panel"><SectionTitle eyebrow="BACKUP & PRIVACY" title="Your data stays yours" /><p className="muted">Profile, quests, skills, and progression are stored in this browser’s IndexedDB. Export regular backups; restoring replaces current local data.</p><div className="data-actions"><Button variant="subtle" onClick={downloadBackup}><ArrowDownToLine size={15} /> Export JSON</Button><Button variant="subtle" onClick={() => importRef.current?.click()}><ArrowUpFromLine size={15} /> Import backup</Button><input ref={importRef} className="visually-hidden" type="file" accept="application/json,.json" onChange={restoreBackup} /><Button variant="danger" onClick={clearData}><Trash2 size={15} /> Clear all data</Button></div></section>
    <section className="panel install-panel"><SectionTitle eyebrow="INSTALLATION" title="Add to iPhone Home Screen" /><ol><li>Deploy this app to an HTTPS host, then open its URL in Safari on iPhone.</li><li>Tap <strong>Share</strong>, choose <strong>Add to Home Screen</strong>, then confirm.</li><li>Open the icon once while online to cache the app shell for offline reopening.</li></ol><p className="helper-text">Installation requires Safari’s Add to Home Screen workflow and a supported secure context. Desktop localhost alone does not install an iPhone app; reliable background tasks or notifications are not promised.</p></section>
  </div>;
}

export default App;
