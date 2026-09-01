<!-- synced from Hyrax discovery — this file will be overwritten on next sync -->
---
title: Regenerate the typed API client after changing the API contract
description: Use orval to regenerate lib/api-client-react / lib/api-zod outputs after
  editing the shared API spec, instead of hand-editing generated files.
---

# Regenerate the typed API client after changing the API contract

This monorepo has a dedicated contract flow: `lib/api-spec` defines the API contract, and `lib/api-client-react` plus `lib/api-zod` contain generated client/schema code produced by `orval` (listed as a dependency in the baseline). Treat outputs in these packages as generated, not hand-authored.

Steps:
1. Make your contract change in `lib/api-spec` (the source-of-truth package for the API spec) rather than editing generated files directly.
2. Re-run the `orval` generation step for the workspace so `lib/api-client-react` and `lib/api-zod` are regenerated from the updated spec. Do not hand-edit files inside these two packages — any manual edit will be overwritten on the next generation run.
3. The api-server (`artifacts/api-server`) and the frontend (`artifacts/vortex`) both consume `@workspace/api-zod` — update call sites there only after regenerating, so their types stay in sync with the new contract.
4. Since this is a pnpm workspace with 5 packages (`artifacts/api-server`, `artifacts/vortex`, `lib/api-client-react`, `lib/api-spec`, `lib/api-zod`), make sure the workspace dependency graph picks up the regenerated packages before building `artifacts/vortex` or `artifacts/api-server`.