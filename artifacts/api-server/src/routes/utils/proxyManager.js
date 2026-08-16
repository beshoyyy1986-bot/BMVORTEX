import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '..', '..', '..', 'data');
const PROXIES_FILE = path.join(DATA_DIR, 'proxies.json');
const FAILED_PROXIES_FILE = path.join(DATA_DIR, 'failed-proxies.json');
const SITE_PROXIES_FILE = path.join(DATA_DIR, 'site-proxies.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readJsonSafe(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, 'utf8');
    if (!raw || !raw.trim()) return fallback;
    return JSON.parse(raw);
  } catch (err) {
    console.error(`[ProxyManager] Failed to read ${filePath}:`, err.message);
    return fallback;
  }
}

function writeJsonSafe(filePath, data) {
  try {
    ensureDataDir();
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error(`[ProxyManager] Failed to write ${filePath}:`, err.message);
  }
}

/**
 * Parses a proxy string in any of the commonly supported shapes into a
 * normalized proxy URL:
 *   - scheme://user:pass@host:port  (http, https, socks4, socks5)
 *   - scheme://host:port
 *   - user:pass@host:port                (defaults to http)
 *   - host:port:user:pass                (legacy format, defaults to http)
 *   - host:port                          (defaults to http, no auth)
 *
 * Returns null if the string cannot be interpreted as a proxy at all.
 */
export function parseProxyUrl(input) {
  if (!input || typeof input !== 'string') return null;
  const s = input.trim();
  if (!s) return null;

  // Already has a scheme.
  if (/^[a-zA-Z0-9]+:\/\//.test(s)) {
    return s;
  }

  // user:pass@host:port (no scheme)
  if (s.includes('@')) {
    return `http://${s}`;
  }

  const parts = s.split(':');

  // Legacy "host:port:user:pass" format.
  if (parts.length === 4) {
    const [host, port, user, pass] = parts;
    if (host && port) {
      return `http://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}`;
    }
  }

  // Bare "host:port".
  if (parts.length >= 2) {
    return `http://${s}`;
  }

  return null;
}

/**
 * Detects the proxy protocol type from a normalized proxy URL, falling back
 * to a port-based heuristic when no scheme is present.
 */
export function detectProxyType(proxyUrl) {
  if (!proxyUrl) return 'http';
  const schemeMatch = proxyUrl.match(/^([a-zA-Z0-9]+):\/\//);
  if (schemeMatch) {
    const scheme = schemeMatch[1].toLowerCase();
    if (scheme === 'socks5' || scheme === 'socks5h') return 'socks5';
    if (scheme === 'socks4' || scheme === 'socks4a') return 'socks4';
    if (scheme === 'https') return 'https';
    return 'http';
  }
  try {
    const url = new URL(proxyUrl.includes('://') ? proxyUrl : `http://${proxyUrl}`);
    const port = Number(url.port);
    if (port === 1080) return 'socks5';
  } catch (_err) {
    // ignore
  }
  return 'http';
}

/**
 * Breaks a normalized proxy URL into its component pieces.
 */
export function parseProxyComponents(proxyUrl) {
  if (!proxyUrl) return null;
  try {
    const normalized = parseProxyUrl(proxyUrl) || proxyUrl;
    const url = new URL(normalized);
    return {
      type: detectProxyType(normalized),
      host: url.hostname,
      port: url.port ? Number(url.port) : null,
      username: url.username ? decodeURIComponent(url.username) : null,
      password: url.password ? decodeURIComponent(url.password) : null,
    };
  } catch (_err) {
    return null;
  }
}

/**
 * Builds a display-friendly proxy info object.
 */
export function buildProxyInfo(proxyUrl) {
  const components = parseProxyComponents(proxyUrl);
  if (!components) return null;
  return {
    raw: proxyUrl,
    normalized: parseProxyUrl(proxyUrl),
    ...components,
    hasAuth: !!(components.username || components.password),
  };
}

/**
 * @deprecated kept for backwards compatibility; use createProxyDispatcher instead.
 */
export async function createUndiciProxyAgent(proxyUrl) {
  return createProxyDispatcher(proxyUrl);
}

/**
 * Builds an axios-compatible agent (https-proxy-agent or socks-proxy-agent)
 * for a normalized or raw proxy string.
 */
export function createHttpAgent(proxyUrl) {
  const normalized = parseProxyUrl(proxyUrl);
  if (!normalized) return null;
  const type = detectProxyType(normalized);
  try {
    if (type === 'socks4' || type === 'socks5') {
      return new SocksProxyAgent(normalized);
    }
    return new HttpsProxyAgent(normalized);
  } catch (err) {
    console.error('[ProxyManager] Failed to build proxy agent:', err.message);
    return null;
  }
}

/**
 * Builds an undici-compatible dispatcher (for native fetch) for a raw proxy
 * string. Falls back to a SOCKS-aware custom Agent when the proxy is
 * socks4/socks5, since undici's built-in ProxyAgent only understands
 * http(s) upstream proxies.
 */
export async function createProxyDispatcher(proxyUrl) {
  const normalized = parseProxyUrl(proxyUrl);
  if (!normalized) return null;
  const type = detectProxyType(normalized);
  try {
    if (type === 'socks4' || type === 'socks5') {
      const { Agent } = await import('undici');
      const { SocksProxyAgent: SocksAgentUndici } = await import('socks-proxy-agent');
      const socksAgent = new SocksAgentUndici(normalized);
      return new Agent({ connect: (opts, cb) => socksAgent.connect(opts, cb) });
    }
    const { ProxyAgent } = await import('undici');
    return new ProxyAgent(normalized);
  } catch (err) {
    console.error('[ProxyManager] Failed to build proxy dispatcher:', err.message);
    return null;
  }
}

/**
 * Fetches a URL, transparently going through a proxy when one is supplied.
 * When no proxy is supplied, transparently falls back to the site-wide
 * admin-managed proxy pool (smart rotation + auto-retry-on-failure) instead
 * of going direct, so every proxyFetch-based tool benefits the same way
 * axios-based tools do via createAxiosConfig/createAxiosClient.
 */
export async function proxyFetch(url, proxyUrl, init = {}) {
  if (proxyUrl) {
    const dispatcher = await createProxyDispatcher(proxyUrl);
    if (!dispatcher) return fetch(url, init);
    return fetch(url, { ...init, dispatcher });
  }
  return getProxyManager().fetchWithPoolRetry(url, init);
}

/**
 * Builds a Playwright-compatible proxy config object from a raw proxy
 * string, splitting credentials out into username/password fields since
 * Playwright does not accept user:pass embedded in the server URL.
 */
export function buildPlaywrightProxy(proxyUrl) {
  const components = parseProxyComponents(proxyUrl);
  if (!components || !components.host || !components.port) return null;
  const scheme = components.type === 'socks4' || components.type === 'socks5' ? components.type : 'http';
  const config = { server: `${scheme}://${components.host}:${components.port}` };
  if (components.username) config.username = components.username;
  if (components.password) config.password = components.password;
  return config;
}

/**
 * Resolves the raw proxy string that should actually be used for a request
 * that isn't axios/fetch based (e.g. Playwright sessions): the caller's own
 * proxy if supplied, otherwise the next proxy from the site-wide pool.
 */
export function getEffectiveProxyRaw(customProxy) {
  const trimmed = typeof customProxy === 'string' ? customProxy.trim() : customProxy;
  if (trimmed) return trimmed;
  return getProxyManager().getNextProxy();
}

/**
 * Heuristic classifier for "this request failed because of the proxy" vs
 * "this request failed for an application-level reason" (bad credentials,
 * invalid ad account, rate limiting from the destination, etc). Only
 * proxy-related failures should trigger removing/rotating a pool proxy.
 */
export function isProxyRelatedError(error) {
  if (!error) return false;
  const code = error.code || error.cause?.code;
  const proxyCodes = new Set([
    'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EPROXYAUTH', 'ENOTFOUND',
    'EHOSTUNREACH', 'ENETUNREACH', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_SOCKET',
  ]);
  if (code && proxyCodes.has(code)) return true;
  if (error.response?.status === 407) return true; // proxy authentication required
  const message = String(error.message || error.cause?.message || '').toLowerCase();
  return (
    message.includes('proxy') ||
    message.includes('tunneling socket') ||
    message.includes('socket hang up') ||
    message.includes('client network socket disconnected') ||
    message.includes('econnrefused') ||
    message.includes('connect timeout')
  );
}

/**
 * Builds an axios instance bound to a resolved proxy that, when the proxy
 * came from the site-wide pool (i.e. the caller did not supply their own
 * proxy), automatically marks a proxy-related failure against that proxy
 * and retries the request with another pool proxy - up to a few attempts.
 * A user's own custom proxy is never silently swapped out.
 */
function createRetryAwareAxiosClient(manager, proxyOption, customProxy, site, axiosOptions = {}) {
  const customTrimmed = typeof customProxy === 'string' ? customProxy.trim() : customProxy;
  const usesPool = !customTrimmed;

  let currentProxy = manager.getProxyForRequest(proxyOption, customProxy, site);
  const triedFromPool = new Set();
  if (usesPool && currentProxy) triedFromPool.add(currentProxy);

  function buildProxyPart() {
    if (!currentProxy) return { proxy: false };
    const agent = createHttpAgent(currentProxy);
    if (!agent) return { proxy: false };
    return { httpsAgent: agent, httpAgent: agent, proxy: false };
  }

  const client = axios.create({ ...axiosOptions, ...buildProxyPart() });
  const maxPoolAttempts = usesPool ? Math.min(manager.getAllProxies().length || 1, 3) : 1;
  let attempts = 0;

  client.interceptors.response.use(
    (response) => response,
    async (error) => {
      attempts += 1;
      const failedProxy = currentProxy;

      if (usesPool && failedProxy && isProxyRelatedError(error)) {
        manager.markProxyFailed(failedProxy, error.message || String(error));

        if (attempts < maxPoolAttempts) {
          const nextProxy = manager.getNextProxy(triedFromPool);
          if (nextProxy) {
            triedFromPool.add(nextProxy);
            currentProxy = nextProxy;
            const cfg = buildProxyPart();
            Object.assign(client.defaults, cfg);
            return client.request({ ...(error.config || {}), ...cfg });
          }
        }
      }

      return Promise.reject(error);
    }
  );

  return client;
}

/**
 * Looks up this server's own public IP (used for "no proxy" diagnostics).
 */
export async function getServerPublicIp() {
  try {
    const res = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(8000) });
    const data = await res.json();
    return data.ip || null;
  } catch (_err) {
    return null;
  }
}

/**
 * Looks up rough geo/ISP info for an IP, trying a couple of free providers.
 */
export async function lookupIpGeo(ip) {
  if (!ip) return null;
  try {
    const res = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`, {
      signal: AbortSignal.timeout(8000),
    });
    const data = await res.json();
    if (data && data.success !== false) {
      return { ip, country: data.country, countryCode: data.country_code, city: data.city, isp: data.connection?.isp };
    }
  } catch (_err) {
    // fall through to secondary provider
  }
  try {
    const res = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,countryCode,city,isp`,
      { signal: AbortSignal.timeout(8000) }
    );
    const data = await res.json();
    if (data && data.status === 'success') {
      return { ip, country: data.country, countryCode: data.countryCode, city: data.city, isp: data.isp };
    }
  } catch (_err) {
    // ignore
  }
  return null;
}

/**
 * Quick connectivity + IP check through a given proxy, used by the
 * quick-check/check endpoints and by testProxy/testAllProxies.
 */
export async function checkProxyConnectivity(proxyUrl, timeoutMs = 10000) {
  const normalized = parseProxyUrl(proxyUrl);
  if (!normalized) {
    return { success: false, error: 'Could not parse proxy string' };
  }
  const start = Date.now();
  try {
    const res = await proxyFetch('https://api.ipify.org?format=json', normalized, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      return { success: false, error: `Echo endpoint returned HTTP ${res.status}` };
    }
    const data = await res.json();
    const responseTime = Date.now() - start;
    return { success: true, ip: data.ip, responseTime, type: detectProxyType(normalized) };
  } catch (err) {
    return { success: false, error: err.message, responseTime: Date.now() - start };
  }
}

class ProxyManager {
  constructor() {
    this.proxies = [];
    this.failedProxies = new Map();
    this.siteProxies = {};
    this.rotationIndex = 0;
    // The site-wide pool is admin-curated: a proxy that fails twice is
    // removed automatically so the pool stays healthy without manual pruning.
    this.maxFailuresBeforeRemoval = 2;
    this.loadProxies();
    this.loadFailedProxies();
    this.loadSiteProxies();
    this.startAutoCleanup();
  }

  loadProxies() {
    this.proxies = readJsonSafe(PROXIES_FILE, []);
  }

  saveProxies() {
    writeJsonSafe(PROXIES_FILE, this.proxies);
  }

  loadFailedProxies() {
    const raw = readJsonSafe(FAILED_PROXIES_FILE, {});
    this.failedProxies = new Map(Object.entries(raw));
  }

  saveFailedProxies() {
    writeJsonSafe(FAILED_PROXIES_FILE, Object.fromEntries(this.failedProxies));
  }

  loadSiteProxies() {
    this.siteProxies = readJsonSafe(SITE_PROXIES_FILE, {});
  }

  saveSiteProxies() {
    writeJsonSafe(SITE_PROXIES_FILE, this.siteProxies);
  }

  /**
   * Adds a proxy to the site-wide pool. Accepts any recognizable format
   * (scheme://user:pass@host:port, scheme://host:port, user:pass@host:port,
   * host:port:user:pass, or bare host:port) - with or without a password.
   */
  addProxy(proxyUrl) {
    if (!proxyUrl || typeof proxyUrl !== 'string') return false;
    const normalizedInput = proxyUrl.trim();
    if (!normalizedInput) return false;
    const parsed = parseProxyUrl(normalizedInput);
    const components = parsed ? parseProxyComponents(parsed) : null;
    if (!components || !components.host || !components.port) return false;
    if (this.proxies.includes(normalizedInput)) return false;
    this.proxies.push(normalizedInput);
    this.saveProxies();
    console.log(`[ProxyManager] Added proxy to site pool: ${normalizedInput}`);
    return true;
  }

  removeProxy(proxyUrl) {
    const index = this.proxies.indexOf(proxyUrl);
    if (index === -1) return false;
    this.proxies.splice(index, 1);
    this.saveProxies();
    this.failedProxies.delete(proxyUrl);
    this.saveFailedProxies();
    if (this.rotationIndex > this.proxies.length) this.rotationIndex = 0;
    console.log(`[ProxyManager] Removed proxy from site pool: ${proxyUrl}`);
    return true;
  }

  importProxies(list) {
    let added = 0;
    for (const entry of list) {
      if (this.addProxy(entry)) added += 1;
    }
    return added;
  }

  getAllProxies() {
    return [...this.proxies];
  }

  /** Returns only proxies that are not currently marked as failed-out. */
  getProxies() {
    return this.proxies.filter((p) => !this.isProxyFailed(p));
  }

  isProxyFailed(proxyUrl) {
    const record = this.failedProxies.get(proxyUrl);
    return !!(record && record.failCount >= this.maxFailuresBeforeRemoval);
  }

  markProxySuccess(proxyUrl, responseTime = 0) {
    if (this.failedProxies.has(proxyUrl)) {
      this.failedProxies.delete(proxyUrl);
      this.saveFailedProxies();
    }
    const record = this._statsFor(proxyUrl);
    record.successCount = (record.successCount || 0) + 1;
    record.lastSuccess = Date.now();
    record.avgResponseTime = record.avgResponseTime
      ? Math.round((record.avgResponseTime + responseTime) / 2)
      : responseTime;
    this._stats.set(proxyUrl, record);
  }

  /**
   * Records a failure against a pool proxy. Since the site pool is
   * admin-curated, a proxy that fails twice is removed immediately - no
   * temporary grace window.
   */
  markProxyFailed(proxyUrl, error) {
    const record = this.failedProxies.get(proxyUrl) || { failCount: 0, lastFail: 0, errors: [] };
    record.failCount = (record.failCount || 0) + 1;
    record.lastFail = Date.now();
    record.lastError = String(error || '').slice(0, 300);
    record.errors = [...(record.errors || []), { time: Date.now(), error: record.lastError }].slice(-5);
    this.failedProxies.set(proxyUrl, record);

    const stats = this._statsFor(proxyUrl);
    stats.failCount = (stats.failCount || 0) + 1;
    this._stats.set(proxyUrl, stats);

    if (record.failCount >= this.maxFailuresBeforeRemoval) {
      console.log(`[ProxyManager] Removing proxy after ${record.failCount} failures: ${proxyUrl}`);
      this.removeProxy(proxyUrl);
      return;
    }
    this.saveFailedProxies();
  }

  get _stats() {
    if (!this.__statsMap) this.__statsMap = new Map();
    return this.__statsMap;
  }

  _statsFor(proxyUrl) {
    return this._stats.get(proxyUrl) || { successCount: 0, failCount: 0, avgResponseTime: 0 };
  }

  getRandomProxy() {
    const pool = this.getProxies();
    if (pool.length === 0) return null;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  /**
   * Smart rotation: returns the next proxy in the pool using a round-robin
   * cursor so load is spread evenly across every configured proxy, skipping
   * any proxy in `exclude` (used by retry loops so a request never reuses a
   * proxy that just failed in the same attempt chain). With exactly one
   * proxy in the pool this naturally always returns that same proxy.
   */
  getNextProxy(exclude = new Set()) {
    const pool = this.proxies;
    if (pool.length === 0) return null;
    if (pool.length === 1) return exclude.has(pool[0]) ? null : pool[0];
    for (let i = 0; i < pool.length; i += 1) {
      if (this.rotationIndex >= pool.length) this.rotationIndex = 0;
      const candidate = pool[this.rotationIndex];
      this.rotationIndex = (this.rotationIndex + 1) % pool.length;
      if (!exclude.has(candidate)) return candidate;
    }
    return null;
  }

  setSiteProxy(site, proxyUrl) {
    if (!site) return false;
    if (proxyUrl) {
      this.siteProxies[site] = proxyUrl;
    } else {
      delete this.siteProxies[site];
    }
    this.saveSiteProxies();
    return true;
  }

  getSiteProxy(site) {
    if (!site) return null;
    return this.siteProxies[site] || null;
  }

  /**
   * Resolves the proxy that should be used for a single request:
   *   1. The caller's own custom proxy always wins, regardless of proxyOption.
   *   2. 'random' explicitly asks for a random pool proxy.
   *   3. A pinned per-service override (setSiteProxy) is used if present.
   *   4. Otherwise the general site-wide pool is used via smart rotation.
   * This means that whenever a user doesn't supply their own proxy - including
   * when proxyOption is 'none' - requests transparently flow through the
   * admin-managed site proxies instead of going direct.
   */
  getProxyForRequest(proxyOption, customProxy, site = null) {
    const trimmedCustom = typeof customProxy === 'string' ? customProxy.trim() : customProxy;
    if (trimmedCustom) {
      return trimmedCustom;
    }
    if (proxyOption === 'random') {
      return this.getRandomProxy();
    }
    if (site) {
      const pinned = this.getSiteProxy(site);
      if (pinned) return pinned;
    }
    return this.getNextProxy();
  }

  createAxiosConfig(proxyOption, customProxy, site) {
    const proxy = this.getProxyForRequest(proxyOption, customProxy, site);
    if (!proxy) return {};
    const agent = createHttpAgent(proxy);
    if (!agent) return {};
    return { httpsAgent: agent, httpAgent: agent, proxy: false };
  }

  /**
   * Builds an axios instance that automatically retries a proxy-related
   * failure with another pool proxy when no custom proxy was supplied.
   */
  createAxiosClient(proxyOption, customProxy, site, axiosOptions = {}) {
    return createRetryAwareAxiosClient(this, proxyOption, customProxy, site, axiosOptions);
  }

  getProxyAgent(proxyUrl) {
    return createHttpAgent(proxyUrl);
  }

  /**
   * Performs a plain fetch through the site-wide pool with smart rotation
   * and automatic retry-on-failure. Used by proxyFetch() whenever the caller
   * did not supply their own proxy. Falls back to a direct request if the
   * pool is empty or every pool proxy fails for a proxy-related reason.
   */
  async fetchWithPoolRetry(url, init = {}) {
    const maxAttempts = Math.min(this.getAllProxies().length || 1, 3);
    const tried = new Set();
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const proxy = this.getNextProxy(tried);
      if (!proxy) break;
      tried.add(proxy);
      const start = Date.now();
      try {
        const dispatcher = await createProxyDispatcher(proxy);
        const res = dispatcher ? await fetch(url, { ...init, dispatcher }) : await fetch(url, init);
        this.markProxySuccess(proxy, Date.now() - start);
        return res;
      } catch (err) {
        if (!isProxyRelatedError(err)) throw err;
        this.markProxyFailed(proxy, err.message || String(err));
      }
    }
    // No pool proxies available/left - still return a real response/error
    // instead of silently hanging.
    return fetch(url, init);
  }

  async testProxy(proxyUrl) {
    const result = await checkProxyConnectivity(proxyUrl);
    if (result.success) {
      this.markProxySuccess(proxyUrl, result.responseTime);
      return { success: true, proxy: proxyUrl, type: result.type, ip: result.ip, responseTime: result.responseTime, timestamp: Date.now() };
    }
    this.markProxyFailed(proxyUrl, result.error);
    return { success: false, proxy: proxyUrl, error: result.error, timestamp: Date.now() };
  }

  async testAllProxies() {
    const results = [];
    for (const proxy of this.getAllProxies()) {
      results.push(await this.testProxy(proxy));
    }
    return results;
  }

  /**
   * Removes proxies that have been marked as failed for a while and never
   * recovered. With the strict 2-strike policy, markProxyFailed already
   * removes a proxy immediately once it reaches the threshold, so this is
   * mostly a safety net for stale failedProxies bookkeeping.
   */
  cleanupDeadProxies() {
    let cleaned = 0;
    for (const proxyUrl of [...this.failedProxies.keys()]) {
      if (!this.proxies.includes(proxyUrl)) {
        this.failedProxies.delete(proxyUrl);
        cleaned += 1;
        continue;
      }
      if (this.isProxyFailed(proxyUrl)) {
        this.removeProxy(proxyUrl);
        cleaned += 1;
      }
    }
    if (cleaned > 0) {
      this.saveFailedProxies();
      console.log(`[ProxyManager] Cleanup removed ${cleaned} dead proxies`);
    }
    return cleaned;
  }

  startAutoCleanup() {
    if (this._cleanupInterval) return;
    this._cleanupInterval = setInterval(() => {
      try {
        this.cleanupDeadProxies();
      } catch (err) {
        console.error('[ProxyManager] Auto cleanup error:', err.message);
      }
    }, 60 * 60 * 1000);
  }

  getStats() {
    const proxyDetails = this.proxies.map((proxy) => {
      const failureRecord = this.failedProxies.get(proxy) || null;
      return {
        proxy,
        status: this.isProxyFailed(proxy) ? 'failed' : 'working',
        stats: this._statsFor(proxy),
        failureRecord,
      };
    });
    const total = this.proxies.length;
    const failed = proxyDetails.filter((p) => p.status === 'failed').length;
    const working = total - failed;
    return {
      total,
      working,
      failed,
      workingPercentage: total > 0 ? Math.round((working / total) * 100) : 0,
      proxyDetails,
    };
  }
}

let singleton = null;

export function getProxyManager() {
  if (!singleton) {
    singleton = new ProxyManager();
  }
  return singleton;
}

export function getProxyConfig(proxyOption, customProxy, site) {
  return getProxyManager().createAxiosConfig(proxyOption, customProxy, site);
}

export default ProxyManager;
