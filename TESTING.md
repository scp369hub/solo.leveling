# Testing

Run focused tests and production build:

```powershell
npm test
npm run build
```

Automated coverage includes:

- Attribute XP thresholds, overflow, and balanced overall-level calculations.
- Independent skill XP, prerequisite activation, invalid prerequisites, and cycle rejection.
- Quest workload, skill gating, XP distribution, roast context, and deadline plus 24-hour penalty timing.
- Daily reward unlock and per-type redemption state.
- IndexedDB initialization, atomic duplicate quest-completion prevention, post-deadline rejection, and JSON backup/restore.

Manual device checks should cover Safari Add to Home Screen on an HTTPS deployment, reopening the installed app offline after the first online visit, IndexedDB persistence after closing/reopening, and narrow portrait layout. Browser and iOS storage eviction are outside the app's control.
