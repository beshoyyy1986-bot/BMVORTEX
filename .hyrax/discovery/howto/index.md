<!-- synced from Hyrax discovery — this file will be overwritten on next sync -->

# How-To Guides

> If your task isn't listed below, follow [../patterns.md](../patterns.md) and mirror the style of similar code in the repo.

| Guide | What it covers |
|-------|----------------|
| [Add a new legacy proxy-forwarding route](add-legacy-proxy-route.md) | Wire a new Express handler into the legacy proxy module used to forward Facebook/Meta ads traffic. |
| [Add a new first-class (non-legacy) api-server route](add-non-legacy-api-server-route.md) | Add a modern typed Express route to api-server, distinct from the legacy JS proxy routes. |
| [Add a new advertising-tool modal to the vortex frontend](add-vortex-tool-modal.md) | Add a new feature modal to the vortex UI following the existing \*ToolsModal / \*Tool naming and composition pattern. |
| [Extend ProxyManager with a new proxy protocol/mode](extend-proxy-manager-protocol-support.md) | Add support for a new proxy protocol or fetch mode to the shared ProxyManager used across the vortex tools. |
| [Regenerate the typed API client after changing the API contract](regenerate-api-client-from-spec.md) | Use orval to regenerate lib/api-client-react / lib/api-zod outputs after editing the shared API spec, instead of hand-editing generated files. |
| [Understand and modify the supabase/ package (migrations, functions, config)](supabase-directory-overview.md) | Covers the top-level supabase/ directory: migrations, edge functions, and config.toml, and how it relates to the api-server's Supabase usage. |
