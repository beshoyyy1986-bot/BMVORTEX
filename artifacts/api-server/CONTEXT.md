<!-- synced from Hyrax discovery — this file will be overwritten on next sync -->

# api-server

> Module within the [BMVORTEX@main](../../HYRAX.md) monorepo.

**Path:** `/tmp/hyrax-publish-fargate-zrrc67l_/BMVORTEX/artifacts/api-server`

## Available Scripts

- `build`: `node ./build.mjs`
- `dev`: `export NODE_ENV=development && pnpm run build && pnpm run start`
- `start`: `node --enable-source-maps ./dist/index.mjs`
- `typecheck`: `tsc -p tsconfig.json --noEmit`

## Dependencies

- `@supabase/supabase-js`
- `@workspace/api-zod`
- `axios`
- `body-parser`
- `cookie-parser`
- `cors`
- `express`
- `https-proxy-agent`
- `multer`
- `pino`
- `pino-http`
- `playwright`
- `socks`
- `socks-proxy-agent`
- `undici`
- `ws`

## Dev Dependencies

- `@types/cookie-parser`
- `@types/cors`
- `@types/express`
- `@types/node`
- `esbuild`
- `esbuild-plugin-pino`
- `pino-pretty`
- `thread-stream`

## Directory Structure

- `data/`
- `src/`
