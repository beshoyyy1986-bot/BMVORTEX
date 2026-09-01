<!-- synced from Hyrax discovery — this file will be overwritten on next sync -->
---
title: Understand and modify the supabase/ package (migrations, functions, config)
description: 'Covers the top-level supabase/ directory: migrations, edge functions,
  and config.toml, and how it relates to the api-server''s Supabase usage.'
---

# Understand and modify the supabase/ package (migrations, functions, config)

The repo has a top-level `supabase/` directory (11 files) alongside `artifacts/` and `lib/` that is not part of the pnpm workspace packages but holds the Supabase project configuration consumed by `artifacts/api-server` (via `@supabase/supabase-js`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) and `artifacts/vortex` (via `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).

What lives here (per stage-0 directory listing, not yet individually opened/verified):
- `supabase/config.toml` — the Supabase CLI project configuration (project ref, API ports, auth settings). Treat this as the source of truth for local Supabase CLI behavior (`supabase start`/`supabase db push`), not the runtime env vars.
- `supabase/migrations/` — SQL migration files defining the Postgres schema backing the Supabase project. Any change to database structure referenced by `artifacts/api-server` should be added as a new migration file here rather than applied ad hoc.
- `supabase/functions/` (if present) — Supabase Edge Functions, which run independently of `artifacts/api-server`'s Express routes; check here before assuming all server-side logic lives in `artifacts/api-server/src/routes/`.

Steps when working with this directory:
1. Before adding a new table/column used by `artifacts/api-server` route handlers, add a corresponding migration under `supabase/migrations/` rather than mutating the database out-of-band.
2. Check `supabase/config.toml` for the local project ref/ports before assuming `SUPABASE_URL` always points to a hosted project — local development may point at the Supabase CLI's local stack.
3. If a route handler in `artifacts/api-server/src/routes/` expects a table or RPC that doesn't appear in `supabase/migrations/`, flag it — the migration may be missing or the table was created manually outside version control.
4. Cross-reference `supabase/functions/` (if present) before adding new backend logic — some functionality may belong in an Edge Function rather than in `artifacts/api-server`.