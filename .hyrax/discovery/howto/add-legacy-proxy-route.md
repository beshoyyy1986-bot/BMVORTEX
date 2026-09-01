<!-- synced from Hyrax discovery — this file will be overwritten on next sync -->
---
title: Add a new legacy proxy-forwarding route
description: Wire a new Express handler into the legacy proxy module used to forward
  Facebook/Meta ads traffic.
---

# Add a new legacy proxy-forwarding route

The api-server has a `legacy` routes area with many handler functions forwarding requests to external services (Facebook Graph API, Meta Ads, temp-email providers).

Relevant existing handlers to model a new one on:
- `artifacts/api-server/src/routes/legacy/proxy.js` — has many sequential handler functions (e.g. lines 13, 27, 51, 75, 95, 119, 138, 163, 188, 208, 229, 249) each following the same Express-style `(req, res)` shape.
- `artifacts/api-server/src/routes/legacy/metaAdsOneWay.js:38` — another handler in the same style, dealing with Meta Ads one-way flows.
- `artifacts/api-server/src/routes/legacy/ads.js:17` — ads-related handler.

Steps:
1. Open `artifacts/api-server/src/routes/legacy/proxy.js` and find the handler whose upstream target/behavior is closest to what you need.
2. Copy its structure (req parsing, upstream call, response shaping, error handling) into a new handler function in the same file or a new file under `artifacts/api-server/src/routes/legacy/`.
3. Register the new route the same way the existing ones are registered in that file.
4. If the new route needs a new external target/header set, follow the pattern of constants like `FB_GRAPH_URL`, `FB_GRAPHQL_URL`, `FB_HEADERS`, `FB_UA`, or `META_DOMAINS` (all present in the symbol table) rather than inlining literals.
5. Keep response/error handling consistent with `ResponseParseError` / `ApiError` types already used in the codebase.