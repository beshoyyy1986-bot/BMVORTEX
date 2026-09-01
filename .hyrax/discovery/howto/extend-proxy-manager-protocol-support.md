<!-- synced from Hyrax discovery — this file will be overwritten on next sync -->
---
title: Extend ProxyManager with a new proxy protocol/mode
description: Add support for a new proxy protocol or fetch mode to the shared ProxyManager
  used across the vortex tools.
---

# Extend ProxyManager with a new proxy protocol/mode

Proxy handling is centralized: `ProxyManager` plus supporting constants `PROTOCOL_MODES`, `AUTO_PROTOCOLS`, `FETCH_PROTOCOL_FILTERS`, `COMMON_PROXY_PORTS`, `GATEWAYS`, `PROXIES_FILE`, and `FAILED_PROXIES_FILE` are all present in the symbol table and used by the various tool modals (e.g. `ProxyToolsModal`, `ProxySelector`).

Steps:
1. Locate where `PROTOCOL_MODES` and `AUTO_PROTOCOLS` are defined and add the new protocol/mode value there first, since other logic (like `FETCH_PROTOCOL_FILTERS`) keys off these constant sets.
2. Update `ProxyManager` to handle the new mode consistently with how existing protocols are dispatched.
3. If the new protocol needs its own agent (the repo already depends on both `https-proxy-agent` and `socks`/`socks-proxy-agent` for different protocol families), follow whichever existing agent-selection branch matches your protocol's transport (HTTP(S) vs SOCKS).
4. Surface the new mode in `ProxySelector` so it appears as a selectable option in the UI, alongside the existing protocol choices.
5. If failed proxies for the new protocol need to be tracked, keep using the existing `FAILED_PROXIES_FILE` / `PROXIES_FILE` conventions rather than introducing a separate storage mechanism.