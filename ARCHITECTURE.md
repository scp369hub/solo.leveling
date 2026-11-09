# Architecture

## Local-first runtime

React renders the mobile screens, Zustand holds the current view of persisted data, and Dexie owns the IndexedDB schema and atomic operations. No normal-use backend is required. The Vite PWA plugin emits an app manifest and service worker that precaches the built app shell; application data remains in IndexedDB.

## Data entities

Dexie schema in `src/data/db.js`:

- `profile`: player identity and manually reported monthly income.
- `attributes`: five independent level/XP records.
- `skills`: independent skill XP, archive state, and editable prerequisite IDs.
- `quests`: generated missions, status, self-reported evidence, and one-time reward marker.
- `xpEvents`: append-only XP event ledger linked to a quest.
- `redemptions`: daily reward claims by type.
- `dungeons`: one active challenge at a time.
- `recommendations`: user-maintained personal purchase suggestions.
- `settings`: recovery mode and workload preferences.

`initializeDatabase` creates only missing defaults. `completeQuest` applies XP and changes quest state in one Dexie transaction; repeated completion is rejected. Backups have a format name and version; import validates shape before replacing all local tables and restoring required defaults.

## Progression rules

Attribute XP cost is `floor(100 × max(1, level)^1.5)`. Attributes start at level 1. The Overall Level is `floor(exp(sum(weight × ln(attribute level)) / sum(weights)))` using equal positive weights by default. This is a weighted geometric mean, not a sum; the lowest attributes constrain the result. The progress display uses the fractional portion of that mean. Blocker text reports which attributes have not reached the next overall threshold.

New skills begin at level 0. Skill XP follows the same threshold formula starting at level 1's 100 XP cost. A skill is active when every configured prerequisite exists, is not archived, and has level 1 or higher. Requirements are deterministic, user-editable, and cycle-checked.

Quest reward maps are explicit percentages/weights in quest data. The XP distributor normalizes them and assigns rounding remainder to the last attribute so no XP is lost. Quest completion stores report content in the ledger event. User-entered reports are not verified performance.

## Deadlines and safeguards

Pending quests expire at their deadline. A related, optional recovery-sized follow-up may be created only after the expired quest has remained expired for 24 hours. Physical follow-ups are limited to 15 minutes, award half XP (minimum 10), do not become daily required quests, and can be skipped. Recovery mode pauses generation. Daily rewards require every required quest for the local calendar day and can each be redeemed once.

## Analysis

The system analysis is deterministic local code over stored attribute levels, skill prerequisites, quest outcomes, and recovery setting. It does not call an AI provider or transmit personal data. Shop recommendations are not commerce and do not process payments.
