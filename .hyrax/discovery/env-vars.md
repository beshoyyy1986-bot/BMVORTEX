<!-- synced from Hyrax discovery — this file will be overwritten on next sync -->
# Environment Variables

| Variable | Required | Example | Declared in |
|----------|----------|---------|-------------|
| `API_PROXY_TARGET` | Yes | `http://127.0.0.1:8080` | artifacts/vortex/vite.config.ts |
| `BASE_PATH` | Yes | `/` | artifacts/vortex/vite.config.ts |
| `LOG_LEVEL` | Yes | `info` | artifacts/api-server/src/lib/logger.ts |
| `NODE_ENV` | Yes | `—` | artifacts/api-server/src/lib/logger.ts |
| `PORT` | Yes | `8080` | artifacts/api-server/src/index.ts, artifacts/vortex/vite.config.ts |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | `—` | artifacts/api-server/src/middlewares/requireAdmin.js, artifacts/api-server/src/routes/legacy/adminRoutes.js |
| `SUPABASE_URL` | Yes | `—` | artifacts/api-server/src/middlewares/requireAdmin.js, artifacts/api-server/src/routes/legacy/adminRoutes.js |
| `VITE_PROXY_API_BASE` | Yes | `—` | artifacts/vortex/src/api/proxyApi.js |
| `VITE_SUPABASE_ANON_KEY` | Yes | `—` | artifacts/vortex/src/lib/supabaseClient.js |
| `VITE_SUPABASE_URL` | Yes | `—` | artifacts/vortex/src/lib/supabaseClient.js |
