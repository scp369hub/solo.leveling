# SHADOW SYSTEM

A local-first personal progression system built for mobile web and iPhone Home Screen use. V1 stores personal data in the browser's IndexedDB; it does not use a backend, analytics, external AI, or payment processing.

## Run locally

1. Install Node.js 20 or newer.
2. In PowerShell, change to the project folder: `Set-Location 'D:\Solo Leveling'`.
3. Use `npm.cmd` to avoid PowerShell blocking the `npm.ps1` script:

   ```powershell
   npm.cmd install
   npm.cmd run dev
   npm.cmd test
   npm.cmd run build
   ```

   If `npm.cmd` is not found, use its full path: `& 'C:\Program Files\nodejs\npm.cmd' test`. Run these commands from `D:\Solo Leveling`; running npm from `C:\Users\R C C` will fail because that folder has no `package.json`.

See [INSTALLATION.md](./INSTALLATION.md) for iPhone testing and PWA limitations.

## Core progression

Attribute XP is distributed according to each quest's explicit mapping. Attribute and skill level-up thresholds use `floor(100 × level^1.5)`. Overall level is the floor of the equal-weight geometric mean of five attribute levels. This discourages one-domain farming; all five attributes begin at level 1. Skills use editable prerequisite IDs, and a prerequisite is satisfied at skill level 1. Quest reports are explicitly self-reported, not independently verified.

## Data and backup

IndexedDB tables are declared in `src/data/db.js`. Export a versioned JSON backup from System before moving browsers/devices; importing replaces current local data. Browser storage can be cleared by the user or browser, so keep backups.

## Structure

- `src/engine/`: deterministic calculations and quest/reward rules
- `src/data/`: Dexie schema, transactions, import/export
- `src/store/`: Zustand UI state and application actions
- `src/App.jsx`: mobile app surfaces
- `src/index.css`: responsive tactical HUD styling

Progression formulas and workflows are documented in [ARCHITECTURE.md](./ARCHITECTURE.md); operational behavior is in [USER_GUIDE.md](./USER_GUIDE.md).
