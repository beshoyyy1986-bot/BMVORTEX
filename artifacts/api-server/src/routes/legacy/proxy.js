import express from 'express';
import { getProxyManager, parseProxyUrl, detectProxyType, parseProxyComponents } from '../utils/proxyManager.js';

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
 * Quick proxy check — test if a proxy actually works
 * POST /api/proxy/quick-check
 */
router.post('/quick-check', async (req, res) => {
  try {
    const { proxy } = req.body;
    if (!proxy) {
      return res.status(400).json({ success: false, error: 'proxy URL is required' });
    }

    const normalized = parseProxyUrl(proxy);
    if (!normalized) {
      return res.json({
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
      });
    }

    const components = parseProxyComponents(normalized);
    if (!components) {
      return res.json({
        success: false,
        status: 'invalid_url',
        reason: 'Could not parse proxy URL',
        proxy_info: {
          status: 'invalid',
          type: detectProxyType(normalized),
          host: null,
          port: null,
          authenticated: false,
        },
      });
    }

    const manager = getProxyManager();
    const startTime = Date.now();

    try {
      const config = manager.createAxiosConfig('custom', normalized);
      const axios = (await import('axios')).default;

      const response = await axios.get('https://httpbin.org/ip', {
        ...config,
        timeout: 15000,
      });

      const responseTime = Date.now() - startTime;
      const ip = response.data?.origin || null;

      res.json({
        success: true,
        status: 'active',
        proxy_info: {
          status: 'active',
          type: detectProxyType(normalized),
          host: components.host,
          port: components.port,
          authenticated: components.authenticated,
          ip,
          responseTime,
        },
      });
    } catch (error) {
      const errorMsg = error.message || 'Connection failed';
      const isTimeout = error.code === 'ECONNABORTED' || error.code === 'ERR_SOCKET_CONNECTION_TIMEOUT';
      const isRefused = error.code === 'ECONNREFUSED';
      const isAuth = error.response?.status === 407;

      let status = 'disconnected';
      let reason = errorMsg;

      if (isTimeout) {
        status = 'disconnected';
        reason = 'Connection timed out';
      } else if (isRefused) {
        status = 'disconnected';
        reason = 'Connection refused — proxy server may be down';
      } else if (isAuth) {
        status = 'disconnected';
        reason = 'Authentication failed — check username/password';
      }

      res.json({
        success: false,
        status,
        reason,
        proxy_info: {
          status: 'disconnected',
          type: detectProxyType(normalized),
          host: components.host,
          port: components.port,
          authenticated: components.authenticated,
          responseTime: Date.now() - startTime,
        },
      });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
