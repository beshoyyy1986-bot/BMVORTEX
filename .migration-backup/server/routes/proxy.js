import express from 'express';
import { getProxyManager } from '../utils/proxyManager.js';

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

export default router;
