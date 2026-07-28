/**
 * /api/extract — Unified cookie & token extraction endpoints
 *
 * POST /api/extract/from-cookies
 *   — Validate cookies + fetch a FB page + return all extracted tokens
 *
 * POST /api/extract/playwright-capture
 *   — Launch headless Chromium, navigate to Facebook, return session cookies
 */

import { Router } from 'express';
import {
  buildCookieHeader,
  extractAll,
  extractAdAccountId,
  fetchAndExtract,
} from '../../utils/metaTokens.js';

const router = Router();

// ── POST /api/extract/from-cookies ─────────────────────────────────────────
/**
 * Body:
 *   cookies     {string|array|object}  — raw cookie (any format)
 *   url?        {string}               — FB page to fetch (default: ads manager)
 *   ad_account? {string}               — URL/string to extract act ID from
 *
 * Returns:
 *   { ok, cookieHeader, cUser, fbDtsg, lsd, accessToken, userId, adAccountId, name, error? }
 */
router.post('/from-cookies', async (req, res) => {
  const { cookies, url, ad_account } = req.body;

  if (!cookies) {
    return res.json({ ok: false, error: 'أدخل الكوكيز أولاً' });
  }

  // Validate + normalise cookies
  let cookieHeader;
  try {
    cookieHeader = buildCookieHeader(cookies);
  } catch (e) {
    return res.json({ ok: false, error: e.message });
  }

  // Fetch page and extract tokens
  const targetUrl = url?.trim() || 'https://www.facebook.com/ads/manager/';
  const result = await fetchAndExtract(cookieHeader, targetUrl);

  // Extract ad account ID from the supplied input (URL or plain string)
  const adAccountId = ad_account ? extractAdAccountId(ad_account) : null;

  return res.json({
    ...result,
    adAccountId,
  });
});

// ── POST /api/extract/playwright-capture ───────────────────────────────────
/**
 * Launch a headless browser, optionally log in, capture session cookies.
 *
 * Body:
 *   email?    {string}   — Facebook email (optional — skips login if omitted)
 *   password? {string}   — Facebook password (optional)
 *   url?      {string}   — Page to navigate to before capturing (default: facebook.com)
 *
 * Returns:
 *   { ok, cookies: [...], cookieString, tokens }
 *   cookies  = Playwright format [{name, value, domain, path, ...}]
 *   cookieString = ready-to-use "name=val; name=val; …" header
 *   tokens   = extracted tokens from cookies + page HTML
 */
router.post('/playwright-capture', async (req, res) => {
  const { email, password, url } = req.body;

  let browser;
  try {
    const { chromium } = await import('playwright');

    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });

    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      locale: 'ar',
      timezoneId: 'Africa/Cairo',
    });

    const page = await context.newPage();

    // ── Step 1: Navigate to Facebook ─────────────────────────────────────────
    await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 30_000 });

    // ── Step 2: Log in (if credentials provided) ──────────────────────────────
    if (email && password) {
      try {
        await page.fill('#email', email, { timeout: 8_000 });
        await page.fill('#pass', password, { timeout: 4_000 });
        await page.click('[name="login"]', { timeout: 4_000 });
        // Wait for navigation after login
        await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20_000 }).catch(() => {});
      } catch (loginErr) {
        // Login form not found — maybe already on a post-login page
      }
    }

    // ── Step 3: Navigate to target URL ────────────────────────────────────────
    const targetUrl = url?.trim() || 'https://www.facebook.com/';
    if (targetUrl !== 'https://www.facebook.com/') {
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 20_000 });
    }

    // ── Step 4: Capture all cookies ───────────────────────────────────────────
    const cookies = await context.cookies();
    await browser.close();

    if (!cookies.length) {
      return res.json({ ok: false, error: 'لم يتم التقاط أي كوكيز' });
    }

    // Build cookie header + extract tokens
    const cookieString = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
    const tokens = extractAll(cookies);   // pass array directly

    return res.json({
      ok: true,
      cookies,           // full Playwright format (array of objects)
      cookieString,      // ready-to-paste string
      tokens,
    });
  } catch (e) {
    if (browser) await browser.close().catch(() => {});
    return res.json({ ok: false, error: `خطأ في Playwright: ${e.message.slice(0, 200)}` });
  }
});

export default router;
