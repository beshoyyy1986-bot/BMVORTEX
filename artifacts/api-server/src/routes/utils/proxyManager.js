import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import tls from 'tls';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Use process.cwd() so paths work after esbuild bundling
const dataDir = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const PROXIES_FILE = path.join(dataDir, 'proxies.json');
const FAILED_PROXIES_FILE = path.join(dataDir, 'failed-proxies.json');

/**
 * Robust Proxy Manager with health checks and automatic cleanup
 */
export class ProxyManager {
  constructor() {
    this.proxies = [];
    this.failedProxies = new Map(); // proxy -> {failCount, lastFail, lastCheck}
    this.proxyStats = new Map(); // proxy -> {successCount, failCount, avgResponseTime}
    this.loadProxies();
    this.loadFailedProxies();
    this.startAutoCleanup();
  }

  loadProxies() {
    try {
      if (fs.existsSync(PROXIES_FILE)) {
        const data = JSON.parse(fs.readFileSync(PROXIES_FILE, 'utf8'));
        this.proxies = Array.isArray(data) ? data : data.proxies || [];
        console.log(`[ProxyManager] Loaded ${this.proxies.length} proxies`);
      } else {
        this.proxies = [];
        this.saveProxies();
      }
    } catch (error) {
      console.error('[ProxyManager] Error loading proxies:', error.message);
      this.proxies = [];
    }
  }

  saveProxies() {
    try {
      fs.writeFileSync(PROXIES_FILE, JSON.stringify(this.proxies, null, 2));
    } catch (error) {
      console.error('[ProxyManager] Error saving proxies:', error.message);
    }
  }

  loadFailedProxies() {
    try {
      if (fs.existsSync(FAILED_PROXIES_FILE)) {
        const data = JSON.parse(fs.readFileSync(FAILED_PROXIES_FILE, 'utf8'));
        this.failedProxies = new Map(Object.entries(data));
      }
    } catch (error) {
      console.error('[ProxyManager] Error loading failed proxies:', error.message);
      this.failedProxies = new Map();
    }
  }

  saveFailedProxies() {
    try {
      const data = Object.fromEntries(this.failedProxies);
      fs.writeFileSync(FAILED_PROXIES_FILE, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('[ProxyManager] Error saving failed proxies:', error.message);
    }
  }

  addProxy(proxyUrl) {
    if (!proxyUrl || typeof proxyUrl !== 'string') return false;
    const normalized = proxyUrl.trim();
    if (!normalized) return false;
    
    if (!this.proxies.includes(normalized)) {
      this.proxies.push(normalized);
      this.saveProxies();
      console.log(`[ProxyManager] Added proxy: ${normalized}`);
      return true;
    }
    return false;
  }

  removeProxy(proxyUrl) {
    const index = this.proxies.indexOf(proxyUrl);
    if (index > -1) {
      this.proxies.splice(index, 1);
      this.failedProxies.delete(proxyUrl);
      this.proxyStats.delete(proxyUrl);
      this.saveProxies();
      this.saveFailedProxies();
      console.log(`[ProxyManager] Removed proxy: ${proxyUrl}`);
      return true;
    }
    return false;
  }

  getProxies() {
    return this.proxies.filter(p => !this.isProxyFailed(p));
  }

  getAllProxies() {
    return [...this.proxies];
  }

  isProxyFailed(proxy) {
    const record = this.failedProxies.get(proxy);
    if (!record) return false;
    // Mark as failed if failed 3+ times and last failure within 24h
    if (record.failCount >= 3) {
      const hoursSinceFail = (Date.now() - record.lastFail) / (1000 * 60 * 60);
      if (hoursSinceFail < 24) return true;
    }
    return false;
  }

  markProxySuccess(proxy, responseTime) {
    const stats = this.proxyStats.get(proxy) || { successCount: 0, failCount: 0, totalResponseTime: 0 };
    stats.successCount++;
    stats.totalResponseTime += responseTime;
    stats.avgResponseTime = stats.totalResponseTime / stats.successCount;
    this.proxyStats.set(proxy, stats);
    
    // Clear failure record on success
    this.failedProxies.delete(proxy);
    this.saveFailedProxies();
  }

  markProxyFailed(proxy, error) {
    const record = this.failedProxies.get(proxy) || { failCount: 0, lastFail: 0, errors: [] };
    record.failCount++;
    record.lastFail = Date.now();
    record.lastError = error;
    record.errors.push({ time: Date.now(), error: error.substring(0, 200) });
    // Keep last 5 errors only
    if (record.errors.length > 5) record.errors = record.errors.slice(-5);
    this.failedProxies.set(proxy, record);
    this.saveFailedProxies();
    
    // Auto-remove if failed 5+ times
    if (record.failCount >= 5) {
      console.log(`[ProxyManager] Auto-removing dead proxy: ${proxy}`);
      this.removeProxy(proxy);
    }
  }

  getRandomProxy() {
    const working = this.getProxies();
    if (working.length === 0) return null;
    return working[Math.floor(Math.random() * working.length)];
  }

  getProxyForRequest(proxyOption, customProxy = null, site = null) {
    switch (proxyOption) {
      case 'none':
        return null;
      case 'custom':
        return customProxy || null;
      case 'site':
        return site ? this.getSiteProxy(site) : this.getRandomProxy();
      case 'random':
      default:
        return this.getRandomProxy();
    }
  }

  getSiteProxy(site) {
    try {
      const siteProxiesFile = path.join(dataDir, 'site-proxies.json');
      if (fs.existsSync(siteProxiesFile)) {
        const data = JSON.parse(fs.readFileSync(siteProxiesFile, 'utf8'));
        return data[site] || null;
      }
    } catch (error) {
      console.error('[ProxyManager] Error loading site proxy:', error.message);
    }
    return null;
  }

  setSiteProxy(site, proxy) {
    try {
      const siteProxiesFile = path.join(dataDir, 'site-proxies.json');
      let data = {};
      if (fs.existsSync(siteProxiesFile)) {
        data = JSON.parse(fs.readFileSync(siteProxiesFile, 'utf8'));
      }
      if (proxy) {
        data[site] = proxy;
      } else {
        delete data[site];
      }
      fs.writeFileSync(siteProxiesFile, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('[ProxyManager] Error saving site proxy:', error.message);
    }
  }

  createAxiosConfig(proxyOption, customProxy, site) {
    const proxy = this.getProxyForRequest(proxyOption, customProxy, site);
    if (!proxy) return {};

    const agent = createHttpAgent(proxy);
    if (!agent) return {};

    return {
      httpsAgent: agent,
      httpAgent: agent,
      proxy: false // Let agent handle it (also required so axios ignores env proxy)
    };
  }

  getProxyAgent(proxyUrl) {
    return createHttpAgent(proxyUrl);
  }

  async testProxy(proxy) {
    const axios = (await import('axios')).default;
    const startTime = Date.now();
    const type = detectProxyType(parseProxyUrl(proxy));

    try {
      const config = {
        method: 'GET',
        url: 'https://httpbin.org/ip',
        timeout: 15000,
        ...this.createAxiosConfig('custom', proxy)
      };
      
      const response = await axios(config);
      const responseTime = Date.now() - startTime;
      
      this.markProxySuccess(proxy, responseTime);
      return {
        success: true,
        proxy,
        type,
        ip: response.data?.origin,
        responseTime,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      this.markProxyFailed(proxy, error.message);
      return {
        success: false,
        proxy,
        type,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  async testAllProxies() {
    const results = [];
    for (const proxy of this.proxies) {
      const result = await this.testProxy(proxy);
      results.push(result);
      // Small delay between tests
      await new Promise(r => setTimeout(r, 500));
    }
    return results;
  }

  cleanupDeadProxies() {
    const before = this.proxies.length;
    this.proxies = this.proxies.filter(p => !this.isProxyFailed(p));
    const removed = before - this.proxies.length;
    if (removed > 0) {
      console.log(`[ProxyManager] Cleaned up ${removed} dead proxies. Remaining: ${this.proxies.length}`);
      this.saveProxies();
    }
    return removed;
  }

  startAutoCleanup() {
    // Run cleanup every 1 hour
    setInterval(() => {
      console.log('[ProxyManager] Running scheduled cleanup...');
      this.cleanupDeadProxies();
    }, 60 * 60 * 1000);
    
    // Also run once at startup
    this.cleanupDeadProxies();
  }

  getStats() {
    const working = this.getProxies();
    const failed = this.proxies.filter(p => this.isProxyFailed(p));
    
    return {
      total: this.proxies.length,
      working: working.length,
      failed: failed.length,
      workingPercentage: this.proxies.length > 0 ? Math.round((working.length / this.proxies.length) * 100) : 0,
      proxyDetails: this.proxies.map(p => ({
        proxy: p,
        status: this.isProxyFailed(p) ? 'failed' : 'working',
        stats: this.proxyStats.get(p) || { successCount: 0, failCount: 0 },
        failureRecord: this.failedProxies.get(p) || null
      }))
    };
  }

  importProxies(proxyList) {
    if (!Array.isArray(proxyList)) return 0;
    let added = 0;
    for (const proxy of proxyList) {
      if (this.addProxy(proxy)) added++;
    }
    return added;
  }
}

// Singleton instance
let instance = null;
export function getProxyManager() {
  if (!instance) {
    instance = new ProxyManager();
  }
  return instance;
}

export function getProxyConfig(proxyOption, customProxy, site = 'facebook') {
  // Delegate to the single unified path so that every option ('custom',
  // 'random', 'site', 'none') and every protocol (http/https/socks) behave
  // identically no matter which route calls this helper.
  const proxyManager = getProxyManager();
  return proxyManager.createAxiosConfig(proxyOption, customProxy, site);
}

export default getProxyManager();

// ──────────────────────────────────────────────────────────────
// Centralised Proxy Utilities — used by every route
// ──────────────────────────────────────────────────────────────

/**
 * Normalise various proxy string formats into a standard URL.
 * Supported:
 *   http(s)://host:port
 *   socks4://host:port
 *   socks5://host:port
 *   http(s)://user:pass@host:port
 *   host:port:user:pass  (legacy 4-part colon format)
 *   host:port            (bare, no scheme → default http)
 */
export function parseProxyUrl(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!s) return null;

  // Already has a recognised scheme
  if (/^(https?|socks[45]):\/\//i.test(s)) return s;

  // user:pass@host:port  (no scheme)
  if (s.includes('@')) return `http://${s}`;

  const parts = s.split(':');
  // host:port:user:pass  (legacy 4-part format used by the UI)
  if (parts.length === 4) {
    const [host, port, user, pass] = parts;
    return `http://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}`;
  }
  // host:port  (bare)
  if (parts.length >= 2) {
    return `http://${s}`;
  }
  return null;
}

/**
 * Detect the proxy protocol type from a URL string.
 * Returns one of: 'http' | 'https' | 'socks4' | 'socks5' | null
 *
 * Priority: scheme > port-based inference (fallback only).
 */
export function detectProxyType(proxyUrl) {
  if (!proxyUrl) return null;
  const s = typeof proxyUrl === 'string' ? proxyUrl : String(proxyUrl);

  // Explicit scheme — use it directly
  const schemeMatch = s.match(/^(https?|socks[45]):\/\//i);
  if (schemeMatch) return schemeMatch[1].toLowerCase();

  // Port-based inference (legacy fallback only — only when no scheme)
  const bareParts = s.split(':');
  if (bareParts.length >= 2) {
    const port = parseInt(bareParts[1], 10);
    if (!isNaN(port) && port === 1080) return 'socks5'; // common SOCKS default
  }
  // No scheme & no port hint → assume http
  return 'http';
}

/**
 * Parse a proxy URL into its components (host, port, username, password).
 */
export function parseProxyComponents(proxyUrl) {
  const normalized = parseProxyUrl(proxyUrl);
  if (!normalized) return null;

  // For SOCKS schemes, temporarily replace with http so URL can parse them
  const parseable = normalized
    .replace(/^socks5:\/\//i, 'http://')
    .replace(/^socks4:\/\//i, 'http://')
    .replace(/^https:\/\//i, 'http://');

  try {
    const url = new URL(parseable);
    return {
      host: url.hostname,
      port: url.port ? parseInt(url.port, 10) : null,
      username: url.username ? decodeURIComponent(url.username) : null,
      password: url.password ? decodeURIComponent(url.password) : null,
      authenticated: !!(url.username && url.password),
    };
  } catch {
    return null;
  }
}

/**
 * Build a proxy_info object suitable for API responses.
 * @param {string} proxyOption - 'none' | 'site' | 'custom' | 'random'
 * @param {string|null} customProxy - raw proxy string from user
 * @returns {object} proxy_info
 */
export function buildProxyInfo(proxyOption, customProxy) {
  const result = {
    status: 'no_proxy',
    type: null,
    host: null,
    port: null,
    authenticated: false,
  };

  if (proxyOption === 'none' || !proxyOption) {
    return result;
  }

  const raw = proxyOption === 'custom' ? customProxy : null;
  const normalized = raw ? parseProxyUrl(raw) : null;

  if (!normalized) {
    // Option is set but no valid proxy string (e.g., site/random with no available proxy)
    return { ...result, status: 'no_proxy' };
  }

  const components = parseProxyComponents(normalized);
  if (!components) {
    return { ...result, status: 'invalid', type: detectProxyType(normalized) };
  }

  return {
    status: 'active',
    type: detectProxyType(normalized),
    host: components.host,
    port: components.port,
    authenticated: components.authenticated,
  };
}

/**
 * Create an undici ProxyAgent for native fetch usage.
 * Returns null if proxyUrl is empty or invalid.
 *
 * @deprecated Kept for backward compatibility. Prefer {@link createProxyDispatcher},
 * which additionally supports SOCKS4/SOCKS5 proxies.
 */
export async function createUndiciProxyAgent(proxyUrl) {
  return createProxyDispatcher(proxyUrl);
}

/**
 * Proxy-aware fetch helper that routes through a proxy dispatcher when a proxy
 * is provided, otherwise falls back to native fetch. Supports HTTP(S) and
 * SOCKS4/SOCKS5 proxies via the unified {@link createProxyDispatcher}.
 */
export async function proxyFetch(url, proxyUrl, init = {}) {
  if (!proxyUrl) return fetch(url, init);

  const dispatcher = await createProxyDispatcher(proxyUrl);
  if (!dispatcher) return fetch(url, init); // fallback

  return fetch(url, { ...init, dispatcher });
}

// ──────────────────────────────────────────────────────────────
// Unified agent / dispatcher factories — the single source of truth
// used by EVERY tool for outbound proxying.
//
//   • createHttpAgent()       → node http.Agent  (used by axios routes)
//   • createProxyDispatcher() → undici Dispatcher (used by fetch routes)
//   • buildPlaywrightProxy()  → Playwright proxy  (used by browser routes)
//
// All three normalise the raw proxy string through parseProxyUrl() first, then
// pick the correct protocol implementation (HTTP / HTTPS / SOCKS4 / SOCKS5).
// ──────────────────────────────────────────────────────────────

/**
 * Create a node http(s) Agent for the given raw proxy string.
 * Supports http, https, socks4 and socks5. Used by all axios-based routes.
 * @param {string} rawProxy
 * @returns {import('http').Agent|null}
 */
export function createHttpAgent(rawProxy) {
  const normalized = parseProxyUrl(rawProxy);
  if (!normalized) return null;

  try {
    const type = detectProxyType(normalized);
    if (type === 'socks4' || type === 'socks5') {
      return new SocksProxyAgent(normalized);
    }
    return new HttpsProxyAgent(normalized);
  } catch (error) {
    console.error('[ProxyManager] Error creating http proxy agent:', error.message);
    return null;
  }
}

/**
 * Create an undici Dispatcher for the given raw proxy string, for use with the
 * native global fetch(). Supports http, https, socks4 and socks5.
 *
 * HTTP(S) proxies use undici's built-in ProxyAgent (HTTP CONNECT). SOCKS
 * proxies use a custom undici Agent whose connector opens the socket through
 * the SOCKS server (and performs the TLS upgrade for https destinations).
 *
 * @param {string} rawProxy
 * @returns {Promise<import('undici').Dispatcher|null>}
 */
export async function createProxyDispatcher(rawProxy) {
  const normalized = parseProxyUrl(rawProxy);
  if (!normalized) return null;

  const type = detectProxyType(normalized);

  try {
    if (type === 'socks4' || type === 'socks5') {
      const components = parseProxyComponents(normalized);
      if (!components || !components.host || !components.port) return null;

      const { SocksClient } = await import('socks');
      const { Agent } = await import('undici');
      const socksType = type === 'socks4' ? 4 : 5;

      return new Agent({
        connect: (opts, callback) => {
          const host = opts.hostname || opts.host;
          const isTls = opts.protocol === 'https:';
          const destPort = Number(opts.port) || (isTls ? 443 : 80);

          SocksClient.createConnection({
            proxy: {
              host: components.host,
              port: components.port,
              type: socksType,
              userId: components.username || undefined,
              password: components.password || undefined,
            },
            command: 'connect',
            destination: { host, port: destPort },
          })
            .then(({ socket }) => {
              if (isTls) {
                const tlsSocket = tls.connect(
                  { socket, servername: opts.servername || host },
                  () => callback(null, tlsSocket),
                );
                tlsSocket.on('error', (err) => callback(err, null));
              } else {
                callback(null, socket);
              }
            })
            .catch((err) => callback(err, null));
        },
      });
    }

    // HTTP / HTTPS proxy → undici's native ProxyAgent (HTTP CONNECT tunnel)
    const { ProxyAgent } = await import('undici');
    return new ProxyAgent(normalized);
  } catch (error) {
    console.error('[ProxyManager] Error creating proxy dispatcher:', error.message);
    return null;
  }
}

/**
 * Build a Playwright launch `proxy` config from a raw proxy string.
 * Supports http, https and socks5 (Playwright cannot authenticate SOCKS, and
 * has no SOCKS4 support, so socks4 is best-effort routed as socks5).
 * @param {string} rawProxy
 * @returns {{server:string, username?:string, password?:string}|null}
 */
export function buildPlaywrightProxy(rawProxy) {
  const normalized = parseProxyUrl(rawProxy);
  if (!normalized) return null;

  const components = parseProxyComponents(normalized);
  if (!components || !components.host) return null;

  const type = detectProxyType(normalized);
  const isSocks = type === 'socks4' || type === 'socks5';
  const scheme = isSocks ? 'socks5' : type === 'https' ? 'https' : 'http';

  const proxy = {
    server: `${scheme}://${components.host}${components.port ? `:${components.port}` : ''}`,
  };
  // Playwright only supports proxy authentication for HTTP(S), never SOCKS.
  if (components.authenticated && !isSocks) {
    proxy.username = components.username;
    proxy.password = components.password;
  }
  return proxy;
}

// ──────────────────────────────────────────────────────────────
// Connectivity check with geo lookup — the single "test proxy" routine
// used by the /api/proxy/quick-check and /api/proxy/check endpoints and,
// through them, the "Test" button that every tool shares.
// ──────────────────────────────────────────────────────────────

let _serverPublicIp = null;
let _serverPublicIpFetchedAt = 0;

/**
 * Best-effort lookup of this server's own public IP (cached for 10 minutes).
 * Used to prove that a proxied request actually egressed through the proxy
 * (exit IP must differ from the server's direct IP).
 */
export async function getServerPublicIp() {
  const TEN_MIN = 10 * 60 * 1000;
  if (_serverPublicIp && Date.now() - _serverPublicIpFetchedAt < TEN_MIN) {
    return _serverPublicIp;
  }
  try {
    const res = await fetch('https://api.ipify.org?format=json', {
      signal: AbortSignal.timeout(8000),
    });
    const data = await res.json();
    _serverPublicIp = data?.ip || null;
    _serverPublicIpFetchedAt = Date.now();
  } catch {
    _serverPublicIp = null;
  }
  return _serverPublicIp;
}

/**
 * Geo-locate an IP address (country / city / ISP). Tries ipwho.is (https) first,
 * then falls back to ip-api.com. Never throws — returns nulls on failure.
 * @param {string} ip
 */
export async function lookupIpGeo(ip) {
  const empty = { country: null, countryCode: null, city: null, isp: null };
  if (!ip) return empty;

  // Primary: ipwho.is (https, no key)
  try {
    const res = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`, {
      signal: AbortSignal.timeout(8000),
    });
    const d = await res.json();
    if (d && d.success !== false) {
      return {
        country: d.country || null,
        countryCode: d.country_code || null,
        city: d.city || null,
        isp: d.connection?.isp || d.connection?.org || null,
      };
    }
  } catch {
    /* fall through to fallback provider */
  }

  // Fallback: ip-api.com (http, no key)
  try {
    const res = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,countryCode,city,isp`,
      { signal: AbortSignal.timeout(8000) },
    );
    const d = await res.json();
    if (d && d.status === 'success') {
      return {
        country: d.country || null,
        countryCode: d.countryCode || null,
        city: d.city || null,
        isp: d.isp || null,
      };
    }
  } catch {
    /* ignore */
  }

  return empty;
}

/**
 * Run a real connectivity test for a single proxy: send a request THROUGH the
 * proxy to an IP-echo service, geo-locate the exit IP, and verify egress by
 * comparing the exit IP to the server's own public IP.
 *
 * Works for HTTP/HTTPS/SOCKS4/SOCKS5 because it uses {@link proxyFetch}.
 *
 * @param {string} rawProxy
 * @param {{ timeoutMs?: number, echoUrl?: string }} [opts]
 * @returns {Promise<object>} unified result with a `proxy_info` payload
 */
export async function checkProxyConnectivity(rawProxy, opts = {}) {
  const timeoutMs = opts.timeoutMs || 15000;
  // Echo endpoint is overridable for tests; production uses a public IP echo.
  const echoUrl = opts.echoUrl || 'https://api.ipify.org?format=json';
  const normalized = parseProxyUrl(rawProxy);

  if (!normalized) {
    return {
      success: false,
      status: 'invalid_url',
      reason: 'Proxy URL format is not recognised',
      proxy_info: {
        status: 'invalid',
        type: null,
        host: null,
        port: null,
        authenticated: false,
      },
    };
  }

  const components = parseProxyComponents(normalized);
  const type = detectProxyType(normalized);

  if (!components || !components.host || !components.port) {
    return {
      success: false,
      status: 'invalid_url',
      reason: 'Could not parse proxy host/port',
      proxy_info: {
        status: 'invalid',
        type,
        host: components?.host || null,
        port: components?.port || null,
        authenticated: components?.authenticated || false,
      },
    };
  }

  const startTime = Date.now();

  try {
    // 1) Route an IP-echo request THROUGH the proxy.
    const res = await proxyFetch(echoUrl, normalized, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'User-Agent': 'VORTEX-ProxyCheck/1.0' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const exitIp = data?.ip || data?.origin || null;
    const responseTime = Date.now() - startTime;

    // 2) Geo-locate the exit IP + fetch the server's own IP (in parallel).
    const [geo, serverIp] = await Promise.all([
      lookupIpGeo(exitIp),
      getServerPublicIp(),
    ]);

    // 3) Egress verified when the observed exit IP differs from the server IP.
    const egressVerified = !!(exitIp && serverIp && exitIp !== serverIp);

    return {
      success: true,
      status: 'active',
      proxy_info: {
        status: 'active',
        type,
        host: components.host,
        port: components.port,
        authenticated: components.authenticated,
        ip: exitIp,
        country: geo.country,
        countryCode: geo.countryCode,
        city: geo.city,
        isp: geo.isp,
        responseTime,
        egress_verified: egressVerified,
        server_ip: serverIp,
      },
    };
  } catch (error) {
    // Native fetch wraps the real failure in `error.cause` and reports a
    // generic "fetch failed" message, so unwrap it for a useful reason.
    const cause = error.cause;
    const code = error.code || cause?.code;
    const rawMsg =
      (error.message && error.message !== 'fetch failed' ? error.message : null) ||
      cause?.message ||
      error.message ||
      'Connection failed';

    const isTimeout =
      error.name === 'TimeoutError' ||
      code === 'UND_ERR_CONNECT_TIMEOUT' ||
      code === 'ECONNABORTED' ||
      code === 'ETIMEDOUT';
    const isRefused = code === 'ECONNREFUSED' || /refused/i.test(rawMsg);
    const isAuth =
      code === 'ERR_PROXY_AUTH' ||
      /407/.test(rawMsg) ||
      /authentication|auth failed|not allowed/i.test(rawMsg);

    let reason = rawMsg;
    if (isTimeout) reason = 'Connection timed out';
    else if (isRefused) reason = 'Connection refused — proxy server may be down or unreachable';
    else if (isAuth) reason = 'Authentication failed — check username/password';

    return {
      success: false,
      status: 'disconnected',
      reason,
      proxy_info: {
        status: 'disconnected',
        type,
        host: components.host,
        port: components.port,
        authenticated: components.authenticated,
        responseTime: Date.now() - startTime,
      },
    };
  }
}
