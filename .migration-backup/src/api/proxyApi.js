/**
 * Backend proxy API contracts (Vite dev server has no routes unless you add them).
 *
 * POST /api/proxy/check
 * Request JSON:
 * {
 *   proxies: Array<{
 *     host: string,
 *     port: number,
 *     protocol?: string,
 *     username?: string,
 *     password?: string
 *   }>,
 *   concurrency?: number,
 *   timeoutMs?: number,
 *   protocolMode?: 'Auto' | 'HTTP' | 'HTTPS' | 'SOCKS4' | 'SOCKS5'
 * }
 * Response JSON:
 * {
 *   results: Array<{
 *     host: string,
 *     port: number,
 *     status: 'working' | 'dead' | 'timeout' | 'invalid' | 'unknown_protocol',
 *     country?: string,
 *     city?: string,
 *     isp?: string,
 *     asn?: string,
 *     latencyMs?: number,
 *     anonymity?: string,
 *     lastChecked?: string,
 *     error?: string
 *   }>
 * }
 *
 * POST /api/proxy/fetch
 * Request JSON:
 * {
 *   urls: string[],
 *   quantityLimit?: number,
 *   timeoutMs?: number,
 *   protocolFilter?: 'All' | 'HTTP' | 'HTTPS' | 'SOCKS4' | 'SOCKS5',
 *   dedupe?: boolean,
 *   validateIpRanges?: boolean
 * }
 * Response JSON:
 * {
 *   candidates: Array<{
 *     protocol_guess: string,
 *     host: string,
 *     port: number,
 *     username?: string,
 *     password?: string,
 *     source: string,
 *     status?: string
 *   }>,
 *   errors?: Array<{ url: string, message: string }>
 * }
 */

const JSON_HEADERS = { "Content-Type": "application/json" };

function apiUrl(path) {
  const base = (import.meta.env.VITE_PROXY_API_BASE || "").replace(/\/$/, "");
  return base ? `${base}${path}` : path;
}

export async function checkProxiesViaApi(payload, fetchOptions = {}) {
  try {
    const res = await fetch(apiUrl("/api/proxy/check"), {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(payload),
      signal: fetchOptions.signal,
    });
    if (res.status === 404) {
      return { ok: false, missing: true, error: "Proxy check API route is not configured on this deployment." };
    }
    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      return { ok: false, error: text || `Invalid JSON (${res.status})` };
    }
    if (!res.ok) {
      return { ok: false, error: data?.error || data?.message || `HTTP ${res.status}`, status: res.status };
    }
    return { ok: true, data };
  } catch (e) {
    if (e?.name === "AbortError") return { ok: false, aborted: true };
    return { ok: false, error: e?.message || "Network error" };
  }
}

export async function fetchProxiesViaApi(payload, fetchOptions = {}) {
  try {
    const res = await fetch(apiUrl("/api/proxy/fetch"), {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(payload),
      signal: fetchOptions.signal,
    });
    if (res.status === 404) {
      return { ok: false, missing: true, error: "Proxy fetch API route is not configured on this deployment." };
    }
    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      return { ok: false, error: text || `Invalid JSON (${res.status})` };
    }
    if (!res.ok) {
      return { ok: false, error: data?.error || data?.message || `HTTP ${res.status}`, status: res.status };
    }
    return { ok: true, data };
  } catch (e) {
    if (e?.name === "AbortError") return { ok: false, aborted: true };
    return { ok: false, error: e?.message || "Network error" };
  }
}
