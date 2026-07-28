/**
 * /api/extract — Unified cookie & token extraction endpoints
 *
 * POST /api/extract/from-cookies
 * POST /api/extract/playwright-capture
 * POST /api/extract/session          — full getSession (Playwright-first)
 */

import { Router } from 'express';
import {
  buildCookieHeader,
  extractAll,
  extractAdAccountId,
  extractBusinessId,
  fetchAndExtract,
  getSession,
  captureSessionWithPlaywright,
  isPlaywrightAvailable,
  detectPlatform,
} from '../utils/metaTokens.js';

const router = Router();

// ── POST /from-cookies ──────────────────────────────────────────────────────
router.post('/from-cookies', async (req, res) => {
  const { cookies, url, ad_account, business_id, proxy } = req.body || {};

  if (!cookies) {
    return res.json({ ok: false, error: 'أدخل الكوكيز أولاً' });
  }

  let cookieHeader;
  try {
    cookieHeader = buildCookieHeader(cookies);
  } catch (e) {
    return res.json({ ok: false, error: e.message });
  }

  const targetUrl = url?.trim() || 'https://business.facebook.com/';
  const result = await fetchAndExtract(cookieHeader, targetUrl, { proxy });

  return res.json({
    ...result,
    adAccountId: ad_account ? extractAdAccountId(ad_account) : null,
    businessId: business_id ? extractBusinessId(business_id) : result.bizId || null,
    platform: detectPlatform(cookieHeader),
    playwrightAvailable: await isPlaywrightAvailable(),
  });
});

// ── POST /session — explicit full session (Playwright primary) ──────────────
router.post('/session', async (req, res) => {
  const { cookies, url, proxy } = req.body || {};
  if (!cookies) return res.json({ ok: false, error: 'أدخل الكوكيز أولاً' });

  try {
    const session = await getSession(cookies, url || undefined, 30000, proxy);
    if (!session) {
      return res.json({
        ok: false,
        error: 'تعذر استخراج الجلسة — حدّث الكوكيز أو تحقق من الحساب',
        playwrightAvailable: await isPlaywrightAvailable(),
      });
    }
    return res.json({
      ok: true,
      dtsg: session.dtsg,
      lsd: session.lsd,
      accessToken: session.accessToken,
      userId: session.userId,
      bizId: session.bizId,
      igUserId: session.igUserId,
      origin: session.origin,
      platform: session.platform,
      strategy: session.strategy,
      viaBrowser: !!session.viaBrowser,
      cookieHeader: session.cookieHeader,
    });
  } catch (e) {
    return res.json({ ok: false, error: e.message?.slice(0, 200) || 'خطأ غير معروف' });
  }
});

// ── POST /playwright-capture ────────────────────────────────────────────────
router.post('/playwright-capture', async (req, res) => {
  const { email, password, url, proxy } = req.body || {};

  if (!(await isPlaywrightAvailable())) {
    return res.json({ ok: false, error: 'Playwright غير متاح على هذا السيرفر' });
  }

  const captured = await captureSessionWithPlaywright({ email, password, url, proxy });
  if (!captured.ok) return res.json(captured);

  const tokens = extractAll(captured.cookies);
  return res.json({
    ok: true,
    cookies: captured.cookies,
    cookieString: captured.cookieString,
    tokens: {
      ...tokens,
      ...(captured.tokens || {}),
      fbDtsg: captured.tokens?.dtsg || tokens.fbDtsg,
      lsd: captured.tokens?.lsd || tokens.lsd,
      accessToken: captured.tokens?.accessToken || tokens.accessToken,
      userId: captured.tokens?.userId || tokens.userId,
      bizId: captured.tokens?.bizId || tokens.bizId,
    },
  });
});

// ── GET /status ─────────────────────────────────────────────────────────────
router.get('/status', async (_req, res) => {
  res.json({
    ok: true,
    playwrightAvailable: await isPlaywrightAvailable(),
    primaryStrategy: 'playwright',
    platforms: ['facebook', 'instagram', 'threads'],
  });
});

export default router;
