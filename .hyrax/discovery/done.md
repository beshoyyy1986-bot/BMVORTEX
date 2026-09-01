<!-- synced from Hyrax discovery — this file will be overwritten on next sync -->
## Definition of Done

Before claiming a change is complete, the commands below must pass. Sections marked **Unknown** need a human answer in the repo's Settings tab.

### Pre-push commands

| Purpose | Command | Source |
|---------|---------|--------|
| types | `pnpm typecheck` | `package.json/scripts/typecheck` |
| types | `pnpm typecheck:libs` | `package.json/scripts/typecheck:libs` |
| build | `pnpm build` | `package.json/scripts/build` |

_Order is fast→slow; run earlier rows first so cheap checks fail before expensive ones._


> _Sections above are derived deterministically from repo config. **Unknown** sections and operator-provided content render side-by-side; fill in the matching slot via the repo's Settings tab to replace the Unknown on the next sync._
