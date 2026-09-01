<!-- synced from Hyrax discovery — this file will be overwritten on next sync -->
---
title: Add a new first-class (non-legacy) api-server route
description: Add a modern typed Express route to api-server, distinct from the legacy
  JS proxy routes.
---

# Add a new first-class (non-legacy) api-server route

Newer, TypeScript routes live directly under `artifacts/api-server/src/routes/` (not under `legacy/`), e.g.:
- `artifacts/api-server/src/routes/temp-email.ts` (handlers at lines 233, 256, 294)
- `artifacts/api-server/src/routes/invite.ts:62`
- `artifacts/api-server/src/routes/permissions.ts:78`
- `artifacts/api-server/src/routes/health.ts:5`

Steps:
1. Pick the closest existing route file (`temp-email.ts` for multi-handler modules, `health.ts` for a minimal single handler) and open it to see the handler signature style used in this repo (Express-style `(req, res)` handlers, TypeScript typed).
2. Add your new handler in the same file (if closely related) or create a new `.ts` file alongside the others in `artifacts/api-server/src/routes/`.
3. Since the repo uses `zod` and `@workspace/api-zod` as dependencies, validate request bodies with the same pattern already used in the neighboring handlers rather than hand-rolled checks.
4. If the route needs auth/permission checks, look at `artifacts/api-server/src/routes/permissions.ts:78` for the existing pattern.
5. Register the route in the same place the other TS routes are wired up (check how `health.ts`, `invite.ts`, and `temp-email.ts` are mounted).