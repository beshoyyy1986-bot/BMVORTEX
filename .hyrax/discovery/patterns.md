<!-- synced from Hyrax discovery — this file will be overwritten on next sync -->

# Coding Patterns

## Route / Endpoint Handler (Express-style)

The baseline pattern seeds identify Express route handlers across `artifacts/api-server/src/routes/`. These are the canonical templates for adding new API endpoints.

### Seed: `artifacts/api-server/src/routes/health.ts:5`
A minimal handler — the simplest template for a new route:

```ts
// artifacts/api-server/src/routes/health.ts (around line 5)
// WHY: This is the smallest possible route handler in the repo —
// use as a starting skeleton for a brand-new endpoint before adding
// validation/auth middleware.
router.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});
```

### Seed: `artifacts/api-server/src/routes/invite.ts:62`
### Seed: `artifacts/api-server/src/routes/permissions.ts:78`
These handlers are in files under `artifacts/api-server/src/routes/` that follow the same Express router pattern (`router.<method>(path, handler)`), consistent with `health.ts`. New feature endpoints should be added as sibling files in this directory, registered the same way.

### Seed: `artifacts/api-server/src/routes/temp-email.ts:233`, `:256`, `:294`
Three separate handler seeds in the same file — indicates a route module that groups multiple related endpoints (e.g. create/check/delete) together rather than one-handler-per-file. This is the pattern to copy when a feature needs several related endpoints: co-locate them in a single route module (`temp-email.ts`) rather than splitting into many tiny files.

### Seed: `artifacts/api-server/src/routes/legacy/proxy.js:13,27,51,75,95,119,138,163,188,208,229,249`
This file has 12 handler seeds — the densest cluster in the baseline. It's a `legacy/` JS route module (not TypeScript) with many small handlers stacked in one file. WHY this matters as a pattern signal: the `legacy/` directory (also containing `metaAdsOneWay.js:38`, `ads.js:17`) is JavaScript, not TypeScript, while newer routes (`temp-email.ts`, `invite.ts`, `permissions.ts`, `health.ts`) are TypeScript. **New route work should follow the `.ts` files as the canonical style** — the `legacy/*.js` handlers are pattern seeds to recognize as legacy/pre-migration code, not to copy from when adding new endpoints.

## Summary of what to copy
- New endpoint → add a `.ts` file in `artifacts/api-server/src/routes/` (follow `health.ts`, `invite.ts`, `permissions.ts`, or `temp-email.ts` depending on whether it's a single or multi-handler feature).
- Avoid extending `artifacts/api-server/src/routes/legacy/*.js` — these are pre-existing JS handlers (`proxy.js`, `metaAdsOneWay.js`, `ads.js`) kept for legacy behavior, not the current TypeScript convention.
