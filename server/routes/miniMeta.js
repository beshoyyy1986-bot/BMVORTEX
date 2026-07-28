/**
 * Mini Meta 2$ — Express API routes
 * Token extraction via unified metaTokens (Playwright-first, background).
 */
import { Router } from 'express';
import {
  buildCookieHeader, extractFbDtsg, extractLsd, extractAccessToken,
  extractActId, extractAdAccountId, extractPageId, fbFetchOpts, graphqlHeaders,
  getSession, fbFetch, fetchAndExtract,
} from '../utils/fbSession.js';

const router = Router();

// ── POST /api/mini-meta/verify-extract ───────────────────────────────────────
router.post('/verify-extract', async (req, res) => {
  const { cookies: cookiesRaw, billing_url, proxy } = req.body || {};
  if (!cookiesRaw) return res.json({ ok: false, reason: 'أدخل الكوكيز أولاً' });

  let cookieHeader;
  try { cookieHeader = buildCookieHeader(cookiesRaw); } catch (e) { return res.json({ ok: false, reason: e.message }); }

  const accountInput = billing_url?.trim() || '';
  let inputActId = extractAdAccountId(accountInput) || extractActId(accountInput);
  const targetUrl = /^https?:\/\//i.test(accountInput)
    ? accountInput
    : inputActId
      ? `https://www.facebook.com/ads/manager/account_settings/account_billing/?act=${inputActId}`
      : 'https://business.facebook.com/';

  try {
    // Unified path: Playwright primary → multi-URL HTTP → cookie tokens
    const result = await fetchAndExtract(cookieHeader, targetUrl, { proxy });
    if (!result.ok) {
      return res.json({ ok: false, reason: result.error || 'تعذر التحقق من الكوكيز' });
    }

    let token = result.accessToken || null;
    // If session has no EAA token yet, still return dtsg-based success markers
    let adAccount = inputActId
      ? `act_${inputActId}`
      : (result.adAccountId ? `act_${result.adAccountId}` : null);

    return res.json({
      ok: true,
      token,
      dtsg: result.fbDtsg || null,
      lsd: result.lsd || null,
      userId: result.userId || result.cUser || null,
      name: result.name || 'مستخدم',
      ad_account: adAccount,
      strategy: result.strategy,
      viaBrowser: !!result.viaBrowser,
    });
  } catch (e) {
    if (e.name === 'TimeoutError' || e.name === 'AbortError')
      return res.json({ ok: false, reason: 'انتهت مهلة الاتصال بفيسبوك — جرّب مرة أخرى أو استخدم بروكسي صالح' });
    return res.json({ ok: false, reason: `خطأ في الاتصال: ${e.message.slice(0, 100)}` });
  }
});

// ── POST /api/mini-meta/add-cards ────────────────────────────────────────────
router.post('/add-cards', async (req, res) => {
  const { cookies: cookiesRaw, proxy, ad_account, mode, cards_text } = req.body || {};
  if (!ad_account) return res.json({ ok: false, reason: 'أدخل الحساب الإعلاني أولاً' });

  let cookieHeader;
  try { cookieHeader = buildCookieHeader(cookiesRaw || '[]'); } catch (e) { return res.json({ ok: false, reason: e.message }); }

  let session;
  try { session = await getSession(cookieHeader, 'https://www.facebook.com/', 20000, proxy); } catch (e) { return res.json({ ok: false, reason: `خطأ في الاتصال: ${e.message.slice(0, 100)}` }); }
  if (!session?.dtsg) return res.json({ ok: false, reason: 'تعذّر استخراج fb_dtsg — تحقق من الكوكيز' });

  const actId = extractActId(ad_account);
  if (!actId) return res.json({ ok: false, reason: 'تنسيق الحساب الإعلاني غير صالح' });

  const results = [];

  if (mode === 'auto') {
    results.push({ card: 'تلقائي', status: '⚠️ الربط التلقائي يتطلب مصدر كروت — تواصل مع الدعم' });
  } else {
    const lines = (cards_text || '').split('\n').map(l => l.trim()).filter(Boolean);
    if (!lines.length) return res.json({ ok: false, reason: 'لا توجد بطاقات' });

    for (const line of lines) {
      const [cardNum, mm, yyyy, cvv] = line.split('|');
      const masked = cardNum ? cardNum.slice(0, 6) + '****' + cardNum.slice(-4) : line;

      if (!cardNum || !mm || !yyyy || !cvv) {
        results.push({ card: masked, status: '❌ تنسيق غير صالح (card|mm|yyyy|cvv)' });
        continue;
      }

      try {
        const payload = new URLSearchParams({
          fb_dtsg: session.dtsg, lsd: session.lsd,
          doc_id: '6423087354383438',
          variables: JSON.stringify({
            input: { act_id: actId, card_number: cardNum, expiration_month: parseInt(mm), expiration_year: parseInt(yyyy), cvv },
          }),
        });

        const r = await fbFetch('https://www.facebook.com/api/graphql/', cookieHeader, {
          method: 'POST',
          headers: graphqlHeaders(cookieHeader, session.lsd),
          body: payload.toString(),
          proxy,
        });

        const txt = await r.text();
        const hasErr = /error|خطأ|invalid|declined/i.test(txt);
        const hasOk  = /success|added|payment_method_id/i.test(txt);

        results.push({ card: masked, status: hasOk && !hasErr ? '✅ تم الربط بنجاح' : hasErr ? '❌ رُفضت البطاقة' : '⚠️ تحقق يدوياً' });
      } catch (e) {
        results.push({ card: masked, status: `❌ فشل: ${e.message.slice(0, 60)}` });
      }
    }
  }

  return res.json({ ok: true, results });
});

// ── POST /api/mini-meta/fetch-page-posts ─────────────────────────────────────
router.post('/fetch-page-posts', async (req, res) => {
  const { cookies: cookiesRaw, proxy, page_id: pageInput, token } = req.body || {};
  if (!pageInput?.trim()) return res.json({ ok: false, reason: 'أدخل معرّف أو رابط الصفحة' });

  let pageId = extractPageId(pageInput);

  if (!pageId && token) {
    const slug = pageInput.trim().replace(/\/+$/, '').split('/').pop().split('?')[0];
    if (slug) {
      try {
        const r = await fetch(`https://graph.facebook.com/v19.0/${slug}?fields=id&access_token=${token}`);
        const d = await r.json();
        if (d.id) pageId = d.id;
      } catch (_) {}
    }
  }

  if (!pageId) return res.json({ ok: false, reason: 'لم يُستخرج معرّف الصفحة — أدخل الـ ID مباشرةً' });

  if (token) {
    try {
      const gr = await fetch(`https://graph.facebook.com/v19.0/${pageId}/posts?fields=id,message,story,created_time&limit=20&access_token=${token}`);
      const gd = await gr.json();
      if (gd.data?.length) {
        return res.json({
          ok: true,
          page_id: pageId,
          posts: gd.data.map(p => ({
            post_id: p.id.split('_').pop(),
            story_id: p.id,
            title: (p.message || p.story || `منشور ${p.id.split('_').pop()}`).slice(0, 80),
            date: p.created_time,
          })),
        });
      }
    } catch (_) {}
  }

  let cookieHeader = '';
  try { cookieHeader = buildCookieHeader(cookiesRaw || '[]'); } catch (_) {}
  if (!cookieHeader) return res.json({ ok: false, reason: 'استخرج التوكن أولاً أو أدخل كوكيز صالحة' });

  let session;
  try { session = await getSession(cookieHeader, 'https://business.facebook.com/', 20000, proxy); } catch (e) { return res.json({ ok: false, reason: `خطأ في الاتصال: ${e.message.slice(0, 100)}` }); }
  if (!session?.dtsg) return res.json({ ok: false, reason: 'تعذّر استخراج fb_dtsg — تحقق من الكوكيز' });

  try {
    const gqlRes = await fbFetch('https://www.facebook.com/api/graphql/', cookieHeader, {
      method: 'POST',
      headers: graphqlHeaders(cookieHeader, session.lsd),
      body: new URLSearchParams({
        fb_dtsg: session.dtsg, lsd: session.lsd,
        doc_id: '7678108775563460',
        variables: JSON.stringify({ pageID: pageId }),
      }).toString(),
      proxy,
    });

    let result;
    try { result = JSON.parse(await gqlRes.text()); } catch { result = {}; }

    const posts = [];
    function deepFind(obj, depth = 0) {
      if (!obj || typeof obj !== 'object' || depth > 10) return;
      if (Array.isArray(obj.edges)) {
        for (const edge of obj.edges) {
          const node = edge.node || edge;
          const pid = node.entity_id || node.id || node.node_id;
          const title = node.title || node.text || node.message || (pid ? `منشور ${pid}` : null);
          if (pid) {
            const pidStr = String(pid).includes('_') ? String(pid).split('_').pop() : String(pid);
            if (!posts.find(p => p.post_id === pidStr))
              posts.push({ post_id: pidStr, story_id: `${pageId}_${pidStr}`, title: String(title || `منشور ${pidStr}`).slice(0, 80), date: node.created_time || null });
          }
        }
      }
      for (const v of Object.values(obj)) deepFind(v, depth + 1);
    }
    if (result.data) deepFind(result.data);

    if (!posts.length) return res.json({ ok: false, reason: 'لم يُعثر على منشورات — جرب توكن بدلاً من الكوكيز' });
    return res.json({ ok: true, posts, page_id: pageId });
  } catch (e) {
    return res.json({ ok: false, reason: `خطأ: ${e.message.slice(0, 150)}` });
  }
});

// ── POST /api/mini-meta/boost-ad ─────────────────────────────────────────────
const BOOST_DOC_IDS = ['9955578997835249', '7678108775563460', '6423087354383438'];

router.post('/boost-ad', async (req, res) => {
  const {
    cookies: cookiesRaw, proxy, token, page_id, post_id,
    budget = '10', days = 1, objective = 'POST_ENGAGEMENT',
    countries = ['EG'], age_min, age_max, gender = 0, ad_account,
  } = req.body || {};

  if (!page_id || !post_id) return res.json({ ok: false, reason: 'page_id و post_id مطلوبين' });

  let cookieHeader;
  try { cookieHeader = buildCookieHeader(cookiesRaw || '[]'); } catch (e) { return res.json({ ok: false, reason: e.message }); }
  if (!cookieHeader) return res.json({ ok: false, reason: 'أدخل الكوكيز أولاً' });

  const actId = ad_account ? extractActId(ad_account) : null;

  let currency = 'USD';
  if (token && actId) {
    try {
      const r = await fetch(`https://graph.facebook.com/v18.0/act_${actId}?fields=currency&access_token=${token}`);
      const d = await r.json();
      if (d.currency) currency = d.currency;
    } catch (_) {}
  }

  let session;
  try { session = await getSession(cookieHeader, 'https://www.facebook.com/', 20000, proxy); } catch (e) { return res.json({ ok: false, reason: `خطأ في الاتصال: ${e.message.slice(0, 100)}` }); }
  if (!session?.dtsg) return res.json({ ok: false, reason: 'تعذّر استخراج fb_dtsg — تحقق من الكوكيز' });

  let lsd = session.lsd;
  if (!lsd) {
    try { const s2 = await getSession(cookieHeader, 'https://business.facebook.com/', 20000, proxy); lsd = s2?.lsd ?? ''; } catch (_) {}
  }

  const variables = {
    input: {
      page_id, post_id: `${page_id}_${post_id}`,
      budget: Math.round(parseFloat(budget) * 100),
      end_time: Math.floor(Date.now() / 1000) + parseInt(days) * 86400,
      objective,
      targeting: {
        geo_locations: { countries },
        age_min: age_min ? parseInt(age_min) : undefined,
        age_max: age_max ? parseInt(age_max) : undefined,
        genders: gender > 0 ? [gender] : undefined,
      },
    },
  };

  let ad_id = null, used_doc_id = null, responsePreview = '';

  for (const doc_id of BOOST_DOC_IDS) {
    try {
      const r = await fbFetch('https://www.facebook.com/api/graphql/', cookieHeader, {
        method: 'POST',
        headers: { ...graphqlHeaders(cookieHeader, lsd), 'X-FB-Friendly-Name': 'BoostPostMutation' },
        body: new URLSearchParams({ fb_dtsg: session.dtsg, lsd, doc_id, variables: JSON.stringify(variables) }).toString(),
        proxy,
      });

      const txt = await r.text();
      responsePreview = txt.slice(0, 500);
      const idMatch = txt.match(/"(?:ad_id|adId|id)"\s*:\s*"(\d{10,})"/);
      if (idMatch) { ad_id = idMatch[1]; used_doc_id = doc_id; break; }
      if (!txt.toLowerCase().includes('"error"')) { used_doc_id = doc_id; break; }
    } catch (_) {}
  }

  return res.json({
    ok: true, ad_id, used_doc_id, currency,
    fb_dtsg_present: !!session.dtsg, lsd_present: !!lsd,
    response_preview: responsePreview,
    message: ad_id ? '✅ تم إنشاء الإعلان' : '⚠️ تم الإرسال — تحقق من الإعلانات يدوياً',
  });
});

export default router;
