# Vortex Control Panel

A control-panel web app with a React/Vite frontend and an Express API backend.

## Run & Operate

Workflows are managed by Replit — use the workflow panel to start/stop services.

- **Frontend (Vortex):** `pnpm --filter @workspace/vortex run dev` — React/Vite on port 22676, preview path `/`
- **API Server:** `pnpm --filter @workspace/api-server run dev` — Express on port 8080, preview path `/api`
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)

## Required environment variables

- `DATABASE_URL` — Postgres connection string (required for `lib/db` and DB-backed routes)
- `SUPABASE_URL` — Supabase project URL (used by API legacy routes)
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase service role key (used by admin routes)
- `VITE_SUPABASE_URL` — Supabase URL for the frontend client
- `VITE_SUPABASE_ANON_KEY` — Supabase anon key for the frontend client
- `VITE_PROXY_API_BASE` — (optional) base URL for proxy API calls from the frontend

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

_Populate as you build — short repo map plus pointers to the source-of-truth file for DB schema, API contracts, theme files, etc._

## Architecture decisions

_Populate as you build — non-obvious choices a reader couldn't infer from the code (3-5 bullets)._

## Product

_Describe the high-level user-facing capabilities of this app once they exist._

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
