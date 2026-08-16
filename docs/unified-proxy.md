# Unified Proxy Layer + Shared Connect/Test Button

> This document explains the change that unifies proxy handling across every VORTEX
> tool and adds a shared **Test / Connect** button that reports live status, proxy
> **type**, **country**, latency, and proof that traffic actually egresses through the
> proxy. It now supports **HTTP / HTTPS / SOCKS4 / SOCKS5**.

---

## Background

### For newcomers: what a proxy is here

A *proxy* is a relay server. Instead of the API server talking to Meta (Facebook)
directly, it opens a connection to the proxy and asks the proxy to fetch on its behalf.
Meta then sees the proxy's IP and country, not ours. Two common families:

- **HTTP/HTTPS proxies** — you tunnel through them with an HTTP `CONNECT` request.
- **SOCKS4/SOCKS5 proxies** — a lower-level TCP relay; SOCKS5 can also carry a
  username/password.

> 💡 A proxy string can arrive in several shapes: `http://host:port`,
> `socks5://user:pass@host:port`, or the legacy 4-part `host:port:user:pass`. Any
> unified layer has to normalise all of these before use.

### The system before this change

VORTEX makes outbound calls three different ways, and each had its **own** proxy code path:

- **axios** routes (`ads`, `cards`, `paypal`, `iban`, `funds`, `partnership`) used
  `createAxiosConfig()` or `getProxyConfig()` — both built an `HttpsProxyAgent` only.
- **native fetch (undici)** routes (`ccTools`, `meta`, and the `getSession → fbFetch`
  token path) used `undici.ProxyAgent` directly.
- **Playwright** routes (`metaCardAdder`, session capture) each parsed the proxy string
  with their own regex.

> ⚠️ **Consequences of the divergence**
> - `HttpsProxyAgent` and `undici.ProxyAgent` are **HTTP-CONNECT only** — every **SOCKS**
>   proxy silently failed.
> - `getProxyConfig()` ignored the `site` option entirely.
> - `fbFetch` fed the **raw** string to `new ProxyAgent()`, so the legacy
>   `host:port:user:pass` format broke.
> - `invite.ts` and `permissions.ts` never passed a proxy at all — those two tools
>   egressed directly.
> - The UI had a passive status badge but **no way to test a proxy**, and never reported
>   the country.

---

## Intuition

The core idea: funnel **every** outbound path through **one** normalisation step and
**one** agent factory that picks the right implementation by protocol.

Concretely, given the raw string `1.2.3.4:1080:bob:pw`:

1. `parseProxyUrl` normalises it → `http://bob:pw@1.2.3.4:1080`.
2. `detectProxyType` reads the scheme → `http` (or `socks5` if `socks5://` was given).
3. The factory returns the correct object for the transport in play:

| Transport          | HTTP/HTTPS proxy               | SOCKS proxy                            |
| ------------------ | ------------------------------ | -------------------------------------- |
| axios (node agent) | `HttpsProxyAgent`              | `SocksProxyAgent`                      |
| fetch (undici)     | undici `ProxyAgent`            | custom undici `Agent` + socks connector |
| Playwright         | `server` + username/password   | `socks5://` server (no auth)           |

For the **Test button**, the intuition for "did it really go through the proxy?" is
simple: ask an IP-echo service *through the proxy* what IP it sees. If that exit IP
differs from the API server's own public IP, egress is proven. Then geo-locate the exit
IP to show the country.

> 🧪 **Toy example:** the server's own IP is `9.9.9.9`. Through a German SOCKS5 proxy,
> `ipify` reports `5.6.7.8`. Because `5.6.7.8 ≠ 9.9.9.9`, we mark `egress_verified: true`,
> then geolocate `5.6.7.8` → 🇩🇪 Germany.

---

## Code

### 1. One factory, three transports (`proxyManager.js`)

```js
// node http.Agent for axios — http/https/socks
export function createHttpAgent(rawProxy) {
  const normalized = parseProxyUrl(rawProxy);
  if (!normalized) return null;
  const type = detectProxyType(normalized);
  if (type === 'socks4' || type === 'socks5') return new SocksProxyAgent(normalized);
  return new HttpsProxyAgent(normalized);
}

// undici Dispatcher for fetch — SOCKS via a custom connector
export async function createProxyDispatcher(rawProxy) {
  const normalized = parseProxyUrl(rawProxy);
  const type = detectProxyType(normalized);
  if (type === 'socks4' || type === 'socks5') {
    const { SocksClient } = await import('socks');
    const { Agent } = await import('undici');
    // Agent.connect opens the socket through the SOCKS server, then TLS-upgrades for https
    return new Agent({ connect: (opts, cb) => { /* SocksClient.createConnection → tls.connect */ } });
  }
  const { ProxyAgent } = await import('undici');
  return new ProxyAgent(normalized);
}
```

`createAxiosConfig`, `getProxyAgent` and `getProxyConfig` now all delegate here, so the
`none / site / custom / random` options and every protocol behave identically no matter
which route calls them.

### 2. The single Test routine

```js
export async function checkProxyConnectivity(rawProxy, opts = {}) {
  // 1) hit an IP echo THROUGH the proxy (works for http+socks via proxyFetch)
  const res = await proxyFetch(echoUrl, normalized, { signal: AbortSignal.timeout(timeoutMs) });
  const exitIp = (await res.json()).ip;
  // 2) geolocate exit IP + read server IP in parallel
  const [geo, serverIp] = await Promise.all([lookupIpGeo(exitIp), getServerPublicIp()]);
  // 3) egress proven when exit IP != server IP
  return { success: true, proxy_info: { type, ip: exitIp, country: geo.country,
    countryCode: geo.countryCode, city: geo.city, isp: geo.isp,
    egress_verified: exitIp && serverIp && exitIp !== serverIp } };
}
```

### 3. Token + browser paths joined the union

- `fbFetch` (the `getSession` HTTP fallback) now normalises the proxy and uses
  `createProxyDispatcher` → SOCKS works for token extraction.
- `playwrightSession.launchBrowser` and `metaCardAdder.parseProxy` both use the shared
  `buildPlaywrightProxy`.
- `invite.ts` / `permissions.ts` read an optional `proxy` off the request body and route
  both the session extraction and the GraphQL mutation through it via `proxyFetch`.

### 4. Routes

`POST /api/proxy/quick-check` now returns the full `proxy_info` (type + country + latency
+ egress). A new `POST /api/proxy/check` runs the same routine in a small concurrency pool
for the Proxy Tools "Checker" tab.

### 5. Shared UI (`ProxySelector.jsx`)

A **Test** button sits next to the custom-proxy input. Because every tool modal already
renders `ProxySelector`, the button appears everywhere automatically. It calls
`quick-check` and renders a live badge: status dot, protocol, `host:port`, 🏳️ country flag
+ name, latency in ms, and a `✓ egress` marker.

---

## Verification

> ✅ **Automated:** `pnpm run typecheck` and both builds are green. A 20-assertion
> integration test spins up throwaway local **HTTP-CONNECT** and **SOCKS5** servers and
> drives real traffic through `checkProxyConnectivity` — both return the forwarded exit IP
> and correct type. Dead/invalid paths return the expected `disconnected` / `invalid_url`.

Also smoke-tested against the running server:

```text
POST /api/proxy/quick-check {"proxy":"socks5://127.0.0.1:9"}
→ disconnected, type=socks5, "Connection refused — proxy server may be down or unreachable"
POST /api/proxy/check {"proxies":[{host,port,protocol:"socks5"}]}
→ {success:true, results:[{status:"dead", country:null, latencyMs:2, ...}]}
```

### Manual QA

1. Run the API server (`pnpm --filter @workspace/api-server dev`) and the Vortex app
   (`pnpm --filter vortex dev`). Vite proxies `/api` to `127.0.0.1:8080`.
2. Open any tool (e.g. Cards, Funds, Ads). Pick **Custom Proxy** and paste a real proxy —
   try each of `http://`, `socks5://`, and the legacy `host:port:user:pass`.
3. Click **🔌 Test**. Expect a green **Connected** badge with protocol, country flag,
   latency, and `✓ egress`.
4. Paste a bogus proxy → red **Disconnected** with a reason.

> 🌐 The sandbox used for automated testing blocks outbound geo/IP endpoints (`ipify`,
> `ipwho.is`, `ip-api`) via an egress allowlist, so country/egress fields resolve to null
> there. They populate normally in a deployment that can reach those hosts. The tunnels
> themselves were verified locally end-to-end.

---

## Alternatives

| A. Route everything through axios agents (drop undici/fetch) | B. Require callers to pre-normalise proxies |
| --- | --- |
| **Pros:** one agent type for all transports; `socks-proxy-agent` covers SOCKS with no custom connector. | **Pros:** factories stay tiny; no repeated parsing. |
| **Cons:** large rewrite of the fetch-based token/`meta`/`ccTools` paths; loses undici's streaming `Response` ergonomics those routes rely on. | **Cons:** every route must remember to normalise → the exact drift we're removing; legacy `host:port:user:pass` bugs would keep reappearing. |

The chosen approach keeps each transport's native client but centralises **parsing + agent
selection**, the smallest change that removes the drift.

---

## Suggested people to talk to

- **beshoyyy1986-bot** — authored the previous "unify proxy architecture" pass and owns
  `proxyManager.js`, `ProxySelector.jsx`, and the Meta token extraction in `metaTokens.js`.
  Best person for how proxies feed the Playwright-first `getSession` flow and the intended
  UX of the status badge.

Most prior history on these files is from an AI agent (Replit Agent / this change), so a
quick human review with the owner above is the highest-value conversation.

---

## Quiz

<details>
<summary>1. Why did SOCKS proxies silently fail before this change?</summary>

- **A.** SOCKS was blocked by Meta — ❌ unrelated to the client code.
- **B.** Both `HttpsProxyAgent` and `undici.ProxyAgent` only speak HTTP CONNECT, and no
  SOCKS agent existed — ✅ correct; SOCKS needs `socks-proxy-agent` / a custom connector.
- **C.** The UI never sent the proxy — ❌ the string was sent; the transport couldn't use it.
</details>

<details>
<summary>2. How does the Test button prove traffic actually egressed through the proxy?</summary>

- **A.** It pings the proxy host — ❌ that only checks reachability, not egress.
- **B.** It compares the exit IP seen by an echo service (fetched through the proxy) to the
  server's own public IP — ✅ different IPs ⇒ `egress_verified`.
- **C.** It trusts the proxy's advertised country — ❌ nothing is verified that way.
</details>

<details>
<summary>3. For a SOCKS5 proxy used with native fetch, what does createProxyDispatcher return?</summary>

- **A.** An `HttpsProxyAgent` — ❌ that's the axios path and HTTP-only.
- **B.** An undici `ProxyAgent` — ❌ that's the HTTP-CONNECT branch.
- **C.** A custom undici `Agent` whose `connect` opens the socket via `SocksClient` (then
  TLS-upgrades for https) — ✅ correct.
</details>

<details>
<summary>4. Why read the proxy off req.body directly in invite.ts / permissions.ts instead of the zod schema?</summary>

- **A.** zod can't parse strings — ❌ it can.
- **B.** The generated zod object strips unknown keys, so adding `proxy` without
  regenerating the OpenAPI client would drop it; reading raw avoids a client regen — ✅ correct.
- **C.** It's faster — ❌ not the reason.
</details>

<details>
<summary>5. What is the role of buildPlaywrightProxy and its main limitation?</summary>

- **A.** It creates an axios agent — ❌ that's `createHttpAgent`.
- **B.** It builds Playwright's `{server, username?, password?}` from any raw proxy, but
  cannot authenticate SOCKS (Playwright limitation) and treats socks4 as socks5 best-effort
  — ✅ correct.
- **C.** It geolocates the proxy — ❌ that's `lookupIpGeo`.
</details>
