import express from 'express';
import {
  getProxyManager,
  checkProxyConnectivity,
} from '../utils/proxyManager.js';

const router = express.Router();

/**
 * Get all proxies
 * GET /api/proxy/list
 */
router.get('/list', (req, res) => {
  try {
    const manager = getProxyManager();
    const stats = manager.getStats();
    res.json({ success: true, ...stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Add new proxy
 * POST /api/proxy/add
 */
router.post('/add', (req, res) => {
  try {
    const { proxy } = req.body;
    if (!proxy) {
      return res.status(400).json({ success: false, error: 'proxy URL is required' });
    }

    const manager = getProxyManager();
    const added = manager.addProxy(proxy);

    if (added) {
      res.json({ success: true, message: 'Proxy added successfully', proxy });
    } else {
      res.status(400).json({ success: false, error: 'Proxy already exists or invalid' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Remove proxy
 * POST /api/proxy/remove
 */
router.post('/remove', (req, res) => {
  try {
    const { proxy } = req.body;
    if (!proxy) {
      return res.status(400).json({ success: false, error: 'proxy URL is required' });
    }

    const manager = getProxyManager();
    const removed = manager.removeProxy(proxy);

    if (removed) {
      res.json({ success: true, message: 'Proxy removed successfully', proxy });
    } else {
      res.status(404).json({ success: false, error: 'Proxy not found' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Test single proxy
 * POST /api/proxy/test
 */
router.post('/test', async (req, res) => {
  try {
    const { proxy } = req.body;
    if (!proxy) {
      return res.status(400).json({ success: false, error: 'proxy URL is required' });
    }

    const manager = getProxyManager();
    const result = await manager.testProxy(proxy);

    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Test all proxies
 * POST /api/proxy/test-all
 */
router.post('/test-all', async (req, res) => {
  try {
    const manager = getProxyManager();
    const results = await manager.testAllProxies();

    const working = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    res.json({
      success: true,
      total: results.length,
      working: working.length,
      failed: failed.length,
      results
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Cleanup dead proxies
 * POST /api/proxy/cleanup
 */
router.post('/cleanup', (req, res) => {
  try {
    const manager = getProxyManager();
    const removed = manager.cleanupDeadProxies();

    res.json({
      success: true,
      removed,
      message: removed > 0 ? `Removed ${removed} dead proxies` : 'No dead proxies to remove'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Import proxies
 * POST /api/proxy/import
 */
router.post('/import', (req, res) => {
  try {
    const { proxies } = req.body;
    if (!Array.isArray(proxies)) {
      return res.status(400).json({ success: false, error: 'proxies must be an array' });
    }

    const manager = getProxyManager();
    const added = manager.importProxies(proxies);

    res.json({
      success: true,
      added,
      total: manager.getProxies().length,
      message: `Imported ${added} new proxies`
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Set site proxy
 * POST /api/proxy/site-proxy
 */
router.post('/site-proxy', (req, res) => {
  try {
    const { site, proxy } = req.body;
    if (!site) {
      return res.status(400).json({ success: false, error: 'site is required' });
    }

    const manager = getProxyManager();
    manager.setSiteProxy(site, proxy || null);

    res.json({
      success: true,
      site,
      proxy: proxy || null,
      message: proxy ? `Proxy set for ${site}` : `Proxy removed for ${site}`
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Get site proxy
 * GET /api/proxy/site-proxy/:site
 */
router.get('/site-proxy/:site', (req, res) => {
  try {
    const { site } = req.params;
    const manager = getProxyManager();
    const proxy = manager.getSiteProxy(site);

    res.json({
      success: true,
      site,
      proxy
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Get proxy statistics
 * GET /api/proxy/stats
 */
router.get('/stats', (req, res) => {
  try {
    const manager = getProxyManager();
    const stats = manager.getStats();

    res.json({
      success: true,
      stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Quick proxy check — the single shared "Test" routine used by the per-tool
 * Test button. Routes a request THROUGH the proxy, geo-locates the exit IP
 * (type + country + city + isp), and verifies egress actually happened.
 * POST /api/proxy/quick-check
 */
router.post('/quick-check', async (req, res) => {
  try {
    const { proxy } = req.body;
    if (!proxy) {
      return res.status(400).json({ success: false, error: 'proxy URL is required' });
    }

    const result = await checkProxyConnectivity(proxy, { timeoutMs: 15000 });
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Batch proxy connectivity check — used by the Proxy Tools "Checker" tab.
 * Accepts the { proxies: [{host, port, protocol, username, password}], ... }
 * contract and returns per-proxy status + geo (country/city/isp/latency).
 * POST /api/proxy/check
 */
router.post('/check', async (req, res) => {
  try {
    const { proxies, timeoutMs, concurrency } = req.body || {};
    if (!Array.isArray(proxies) || proxies.length === 0) {
      return res.status(400).json({ success: false, error: 'proxies must be a non-empty array' });
    }

    const perCheckTimeout = Math.min(Math.max(Number(timeoutMs) || 12000, 3000), 30000);
    const pool = Math.min(Math.max(Number(concurrency) || 10, 1), 25);

    // Rebuild a raw proxy URL from the structured entry.
    const toRawUrl = (p) => {
      if (typeof p === 'string') return p;
      if (!p || !p.host || !p.port) return null;
      const scheme = (p.protocol || 'http').toLowerCase().replace(/[^a-z0-9]/g, '') || 'http';
      const auth = p.username ? `${encodeURIComponent(p.username)}:${encodeURIComponent(p.password || '')}@` : '';
      return `${scheme}://${auth}${p.host}:${p.port}`;
    };

    const results = new Array(proxies.length);
    let cursor = 0;

    async function worker() {
      while (cursor < proxies.length) {
        const idx = cursor++;
        const entry = proxies[idx];
        const raw = toRawUrl(entry);
        const host = typeof entry === 'string' ? null : entry.host;
        const port = typeof entry === 'string' ? null : entry.port;

        if (!raw) {
          results[idx] = { host, port, status: 'invalid', error: 'invalid proxy entry' };
          continue;
        }

        const r = await checkProxyConnectivity(raw, { timeoutMs: perCheckTimeout });
        const info = r.proxy_info || {};
        results[idx] = {
          host: info.host || host,
          port: info.port || port,
          protocol: info.type || (typeof entry === 'string' ? null : entry.protocol) || null,
          status: r.success
            ? 'working'
            : r.status === 'invalid_url'
              ? 'invalid'
              : /timed out/i.test(r.reason || '')
                ? 'timeout'
                : 'dead',
          country: info.country || null,
          countryCode: info.countryCode || null,
          city: info.city || null,
          isp: info.isp || null,
          ip: info.ip || null,
          latencyMs: info.responseTime ?? null,
          egressVerified: info.egress_verified ?? null,
          lastChecked: new Date().toISOString(),
          error: r.success ? undefined : r.reason,
        };
      }
    }

    await Promise.all(Array.from({ length: pool }, worker));

    const working = results.filter((r) => r.status === 'working').length;
    res.json({ success: true, total: results.length, working, results });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
