import { HttpsProxyAgent } from 'https-proxy-agent';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROXIES_FILE = path.join(__dirname, '..', 'data', 'proxies.json');
const FAILED_PROXIES_FILE = path.join(__dirname, '..', 'data', 'failed-proxies.json');

// Ensure data directory exists
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

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
      const siteProxiesFile = path.join(__dirname, '..', 'data', 'site-proxies.json');
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
      const siteProxiesFile = path.join(__dirname, '..', 'data', 'site-proxies.json');
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
    
    try {
      const agent = new HttpsProxyAgent(proxy);
      return {
        httpsAgent: agent,
        httpAgent: agent,
        proxy: false // Let agent handle it
      };
    } catch (error) {
      console.error('[ProxyManager] Error creating proxy agent:', error.message);
      return {};
    }
  }

  getProxyAgent(proxyUrl) {
    if (!proxyUrl) return null;
    try {
      return new HttpsProxyAgent(proxyUrl);
    } catch (error) {
      console.error('[ProxyManager] Error creating proxy agent:', error.message);
      return null;
    }
  }

  async testProxy(proxy) {
    const axios = (await import('axios')).default;
    const startTime = Date.now();
    
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
        ip: response.data?.origin,
        responseTime,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      this.markProxyFailed(proxy, error.message);
      return {
        success: false,
        proxy,
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

export function getProxyConfig(proxyOption, customProxy) {
  const proxyManager = getProxyManager();
  let agent = null;

  if (proxyOption === 'custom' && customProxy) {
    try {
      agent = new HttpsProxyAgent(customProxy);
    } catch (e) {
      console.warn('Invalid custom proxy:', e.message);
    }
  } else if (proxyOption === 'random') {
    const proxy = proxyManager.getRandomProxy();
    if (proxy) {
      try {
        agent = new HttpsProxyAgent(proxy);
      } catch (e) {
        console.warn('Invalid random proxy:', e.message);
      }
    }
  }

  return agent ? { httpsAgent: agent, proxy: false } : {};
}

export default getProxyManager();
