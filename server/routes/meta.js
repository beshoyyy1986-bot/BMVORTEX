import express from 'express';

const router = express.Router();

// ── Proxy URL parser ─────────────────────────────────────────────
function parseProxyUrl(raw) {
  const s = raw.trim();
  if (!s) return null;
  if (/^https?:\/\/|^socks[45]:\/\//i.test(s)) return s;
  if (s.includes('@')) return `http://${s}`;
  const parts = s.split(':');
  if (parts.length === 4) {
    const [host, port, user, pass] = parts;
    return `http://${user}:${pass}@${host}:${port}`;
  }
  return `http://${s}`;
}

// ── Proxy-aware fetch ────────────────────────────────────────────
async function proxyFetch(url, proxyUrl, init = {}) {
  if (!proxyUrl) return fetch(url, init);
  try {
    const { ProxyAgent } = await import('undici');
    const dispatcher = new ProxyAgent(proxyUrl);
    return fetch(url, { ...init, dispatcher });
  } catch {
    return fetch(url, init);
  }
}

// ── Connect via access token ─────────────────────────────────────
router.post('/connect', async (req, res) => {
  const { token, proxy } = req.body || {};
  if (!token) {
    return res.status(400).json({ ok: false, reason: 'أدخل Access Token' });
  }

  const GRAPH = 'https://graph.facebook.com/v21.0';
  const proxyUrl = proxy ? parseProxyUrl(proxy) : null;

  try {
    const [accsRes, pagesRes] = await Promise.all([
      proxyFetch(
        `${GRAPH}/me/adaccounts?fields=id,name,account_status,currency,balance,amount_spent,account_quality,disable_reason&access_token=${encodeURIComponent(token)}&limit=50`,
        proxyUrl
      ).then(r => r.json()),
      proxyFetch(
        `${GRAPH}/me/accounts?fields=id,name,access_token,fan_count&access_token=${encodeURIComponent(token)}&limit=50`,
        proxyUrl
      ).then(r => r.json()),
    ]);

    if (accsRes?.error && pagesRes?.error) {
      return res.json({ ok: false, reason: accsRes.error?.message ?? 'توكن غير صالح' });
    }

    const accounts = Array.isArray(accsRes?.data) ? accsRes.data : [];
    const pages = Array.isArray(pagesRes?.data) ? pagesRes.data : [];

    res.json({ ok: true, accounts, pages });
  } catch (e) {
    console.error('Meta connect error:', e);
    res.json({ ok: false, reason: 'انتهت مهلة الاتصال' });
  }
});

// ── Get page posts ───────────────────────────────────────────────
router.post('/page-posts', async (req, res) => {
  const { page_id, page_token } = req.body || {};
  if (!page_id || !page_token) {
    return res.status(400).json({ ok: false, reason: 'بيانات ناقصة' });
  }

  const GRAPH = 'https://graph.facebook.com/v21.0';
  try {
    const r = await fetch(
      `${GRAPH}/${page_id}/posts?fields=id,message,story,created_time&access_token=${encodeURIComponent(page_token)}&limit=30`
    ).then(resp => resp.json());

    if (r?.error) {
      return res.json({ ok: false, reason: r.error?.message ?? String(r) });
    }

    const rawPosts = Array.isArray(r?.data) ? r.data : [];
    const posts = rawPosts.map(p => {
      const id = String(p.id ?? '');
      const msg = String(p.message ?? p.story ?? 'منشور بدون نص');
      const label = msg.length > 60 ? msg.slice(0, 60) + '...' : msg;
      const parts = id.split('_');
      return {
        id,
        label,
        post_only_id: parts[parts.length - 1] ?? id,
        page_only_id: parts[0] ?? id,
        message: String(p.message ?? ''),
        created_time: String(p.created_time ?? ''),
      };
    });

    res.json({ ok: true, posts });
  } catch (e) {
    console.error('Get page posts error:', e);
    res.json({ ok: false, reason: 'انتهت مهلة الاتصال' });
  }
});

// ── Create ad ────────────────────────────────────────────────────
router.post('/create-ad', async (req, res) => {
  const {
    token, ad_account, page_id, post_id,
    budget = 10, days = 0,
    objective = 'OUTCOME_ENGAGEMENT',
    traffic_url, publish_status = 'PAUSED',
    country = 'EG', age_min = 18, age_max = 65,
    gender = 0, custom_audience_id,
  } = req.body || {};

  if (!token || !ad_account || !page_id || !post_id) {
    return res.status(400).json({ ok: false, reason: 'بيانات ناقصة' });
  }

  const actId = ad_account.replace('act_', '');
  const base = `https://graph.facebook.com/v21.0/act_${actId}`;

  const metaPost = (url, fields) => {
    const body = new URLSearchParams();
    body.append('access_token', token);
    for (const [k, v] of Object.entries(fields)) {
      if (v === undefined || v === null) continue;
      body.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
    }
    return fetch(url, { method: 'POST', body }).then(r => r.json());
  };

  const objectiveConfig = {
    OUTCOME_ENGAGEMENT: { goal: 'REACH',               billing: 'IMPRESSIONS', dest: 'ON_POST'  },
    OUTCOME_TRAFFIC:    { goal: 'LANDING_PAGE_VIEWS',  billing: 'IMPRESSIONS', dest: 'WEBSITE'  },
    OUTCOME_AWARENESS:  { goal: 'REACH',               billing: 'IMPRESSIONS', dest: 'ON_POST'  },
    OUTCOME_LEADS:      { goal: 'LEAD_GENERATION',     billing: 'IMPRESSIONS', dest: 'ON_AD'    },
    OUTCOME_SALES:      { goal: 'OFFSITE_CONVERSIONS', billing: 'IMPRESSIONS', dest: 'WEBSITE'  },
  };
  const objCfg = objectiveConfig[objective] ?? objectiveConfig['OUTCOME_ENGAGEMENT'];
  const ts = Date.now().toString().slice(-6);

  try {
    // 1. Campaign
    const campRes = await metaPost(`${base}/campaigns`, {
      name: `Camp_${ts}`,
      objective,
      status: publish_status,
      special_ad_categories: JSON.stringify([]),
      is_adset_budget_sharing_enabled: false,
    });

    if (!campRes?.id) {
      const e = campRes?.error;
      return res.json({ ok: false, reason: `خطأ الحملة: ${e?.error_user_msg ?? e?.message ?? JSON.stringify(campRes)}` });
    }
    const campId = String(campRes.id);

    // 2. Targeting
    const targeting = custom_audience_id
      ? { custom_audiences: [{ id: custom_audience_id }] }
      : { geo_locations: { countries: [country.toUpperCase()] }, age_min: Number(age_min), age_max: Number(age_max) };
    if (!custom_audience_id && Number(gender) > 0) targeting.genders = [Number(gender)];
    targeting.targeting_automation = { advantage_audience: 0 };

    // 3. AdSet
    const now = new Date();
    const promotedObject = { page_id };
    if (objective === 'OUTCOME_TRAFFIC' && traffic_url) {
      promotedObject.object_store_url = traffic_url;
    }

    const adsetFields = {
      name: `AdSet_${ts}`,
      campaign_id: campId,
      billing_event: objCfg.billing,
      optimization_goal: objCfg.goal,
      destination_type: objCfg.dest,
      bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
      targeting,
      promoted_object: promotedObject,
      status: publish_status,
    };

    let scheduleInfo = '';
    if (Number(days) > 0) {
      adsetFields.lifetime_budget = Math.round(Number(budget) * Number(days) * 100);
      const endDate = new Date(now.getTime() + Number(days) * 86400000);
      adsetFields.end_time = endDate.toISOString().replace(/\.\d{3}Z$/, '+0000');
    } else {
      adsetFields.daily_budget = Math.round(Number(budget) * 100);
    }

    const startDt = new Date(now.getTime() + 30 * 60000);
    adsetFields.start_time = startDt.toISOString().replace(/\.\d{3}Z$/, '+0000');
    scheduleInfo = ' | مجدول بعد 30 د';

    const adsetRes = await metaPost(`${base}/adsets`, adsetFields);
    if (!adsetRes?.id) {
      const e = adsetRes?.error;
      return res.json({ ok: false, reason: `خطأ المجموعة: ${e?.error_user_msg ?? e?.message ?? JSON.stringify(adsetRes)}` });
    }
    const adsetId = String(adsetRes.id);

    // 4. Ad Creative
    const creativeFields = { object_story_id: post_id };
    if (objective === 'OUTCOME_TRAFFIC' && traffic_url) creativeFields.link_url = traffic_url;

    const creativeRes = await metaPost(`${base}/adcreatives`, creativeFields);
    if (!creativeRes?.id) {
      const e = creativeRes?.error;
      return res.json({ ok: false, reason: `خطأ الإعلان الإبداعي: ${e?.error_user_msg ?? e?.message ?? JSON.stringify(creativeRes)}` });
    }
    const creativeId = String(creativeRes.id);

    // 5. Ad
    const adRes = await metaPost(`${base}/ads`, {
      name: `Ad_${ts}`,
      adset_id: adsetId,
      creative: { creative_id: creativeId },
      status: publish_status,
    });

    if (!adRes?.id) {
      const e = adRes?.error;
      return res.json({ ok: false, reason: `خطأ إنشاء الإعلان: ${e?.error_user_msg ?? e?.message ?? JSON.stringify(adRes)}` });
    }

    const statusAr = publish_status === 'PAUSED' ? 'متوقف ⏸' : 'نشط ▶️';
    res.json({
      ok: true,
      campaign_id: campId,
      adset_id: adsetId,
      ad_id: String(adRes.id),
      publish_status,
      message: `تم الإنشاء (${statusAr})${scheduleInfo} ✅`,
    });
  } catch (e) {
    console.error('Create ad error:', e);
    res.json({ ok: false, reason: 'انتهت مهلة الاتصال' });
  }
});

// ── Activate ad ──────────────────────────────────────────────────
router.post('/activate-ad', async (req, res) => {
  const { token, ad_id, campaign_id, adset_id } = req.body || {};
  if (!token || !ad_id) {
    return res.status(400).json({ ok: false, reason: 'بيانات ناقصة' });
  }

  const GRAPH = 'https://graph.facebook.com/v21.0';
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  try {
    for (const entityId of [campaign_id, adset_id, ad_id]) {
      if (!entityId) continue;
      const r = await fetch(`${GRAPH}/${entityId}`, {
        method: 'POST', headers,
        body: JSON.stringify({ status: 'ACTIVE' }),
      }).then(resp => resp.json());

      if (r?.error) {
        return res.json({ ok: false, reason: r.error?.message ?? String(r) });
      }
    }
    res.json({ ok: true, message: 'تم التنشيط ✅' });
  } catch (e) {
    res.json({ ok: false, reason: 'انتهت مهلة الاتصال' });
  }
});

// ── Create dark post ─────────────────────────────────────────────
router.post('/dark-post', async (req, res) => {
  const { page_id, page_token, message, image_base64, image_name } = req.body || {};
  if (!page_id || !page_token) {
    return res.status(400).json({ ok: false, reason: 'بيانات ناقصة' });
  }

  const GRAPH = 'https://graph.facebook.com/v21.0';
  try {
    let photo_id = null;

    if (image_base64) {
      const imgBuffer = Buffer.from(image_base64, 'base64');
      const formData = new FormData();
      formData.append('access_token', page_token);
      formData.append('published', 'false');
      formData.append('source', new Blob([imgBuffer], { type: 'image/jpeg' }), image_name ?? 'image.jpg');
      const photoRes = await fetch(`${GRAPH}/${page_id}/photos`, { method: 'POST', body: formData }).then(r => r.json());

      if (photoRes?.error) {
        return res.json({ ok: false, reason: photoRes.error?.message ?? 'فشل رفع الصورة' });
      }
      photo_id = photoRes?.id ?? null;
    }

    const feedBody = { message, published: false };
    if (photo_id) feedBody.attached_media = JSON.stringify([{ media_fbid: photo_id }]);

    const params = new URLSearchParams({ access_token: page_token });
    for (const [k, v] of Object.entries(feedBody)) {
      params.append(k, String(v));
    }

    const r = await fetch(`${GRAPH}/${page_id}/feed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    }).then(resp => resp.json());

    if (r?.error) {
      return res.json({ ok: false, reason: r.error?.message ?? String(r) });
    }

    res.json({ ok: true, post_id: r?.id ?? null });
  } catch (e) {
    res.json({ ok: false, reason: 'انتهت مهلة الاتصال' });
  }
});

// ── Delete post ──────────────────────────────────────────────────
router.post('/delete-post', async (req, res) => {
  const { post_id, page_token } = req.body || {};
  if (!post_id || !page_token) {
    return res.status(400).json({ ok: false, reason: 'بيانات ناقصة' });
  }

  const GRAPH = 'https://graph.facebook.com/v21.0';
  try {
    const r = await fetch(
      `${GRAPH}/${post_id}?access_token=${encodeURIComponent(page_token)}`,
      { method: 'DELETE' }
    ).then(resp => resp.json());

    if (r?.error) {
      return res.json({ ok: false, reason: r.error?.message ?? String(r) });
    }
    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false, reason: 'انتهت مهلة الاتصال' });
  }
});

// ── Toggle post visibility ───────────────────────────────────────
router.post('/toggle-page-publish', async (req, res) => {
  const { post_id, page_token, action } = req.body || {};
  if (!post_id || !page_token) {
    return res.status(400).json({ ok: false, reason: 'بيانات ناقصة' });
  }

  const GRAPH = 'https://graph.facebook.com/v21.0';
  try {
    const r = await fetch(
      `${GRAPH}/${post_id}?access_token=${encodeURIComponent(page_token)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_published: action !== 'hide' }),
      }
    ).then(resp => resp.json());

    if (r?.error) {
      const e = r.error;
      const reason = (e?.code === 200 || e?.message?.toLowerCase().includes('permission'))
        ? 'خطأ في الصلاحيات: يحتاج توكن الصفحة صلاحية pages_manage_posts.'
        : (e?.error_user_msg ?? e?.message ?? String(r));
      return res.json({ ok: false, reason });
    }

    const msg = action === 'hide' ? 'تم إلغاء نشر المنشور ✅' : 'تم نشر المنشور ✅';
    res.json({ ok: true, message: msg });
  } catch (e) {
    res.json({ ok: false, reason: 'انتهت مهلة الاتصال' });
  }
});

// ── Get ad status ────────────────────────────────────────────────
router.post('/get-ad-status', async (req, res) => {
  const { token, ad_id, adset_id, campaign_id } = req.body || {};
  if (!token || !ad_id) {
    return res.status(400).json({ ok: false, reason: 'بيانات ناقصة' });
  }

  const GRAPH = 'https://graph.facebook.com/v21.0';
  const headers = { Authorization: `Bearer ${token}` };

  try {
    const adRes = await fetch(
      `${GRAPH}/${ad_id}?fields=name,status,effective_status,campaign_id,adset_id,creative{object_story_id}`,
      { headers }
    ).then(r => r.json());

    if (adRes?.error) {
      return res.json({ ok: false, reason: adRes.error?.message ?? 'تعذّر جلب بيانات الإعلان' });
    }

    const resolvedAdsetId = String(adRes.adset_id ?? adset_id ?? '');
    const resolvedCampaignId = String(adRes.campaign_id ?? campaign_id ?? '');

    const [adsetRes, campRes] = await Promise.all([
      resolvedAdsetId
        ? fetch(`${GRAPH}/${resolvedAdsetId}?fields=status,effective_status,daily_budget,lifetime_budget,start_time,end_time`, { headers }).then(r => r.json())
        : Promise.resolve(null),
      resolvedCampaignId
        ? fetch(`${GRAPH}/${resolvedCampaignId}?fields=status,effective_status`, { headers }).then(r => r.json())
        : Promise.resolve(null),
    ]);

    const postId = adRes.creative?.object_story_id ?? null;

    res.json({
      ok: true,
      ad_id,
      adset_id: resolvedAdsetId || null,
      campaign_id: resolvedCampaignId || null,
      ad_status: String(adRes.effective_status ?? adRes.status ?? ''),
      adset_status: adsetRes ? String(adsetRes.effective_status ?? adsetRes.status ?? '') : null,
      campaign_status: campRes ? String(campRes.effective_status ?? campRes.status ?? '') : null,
      daily_budget: adsetRes ? String(adsetRes.daily_budget ?? '') || null : null,
      lifetime_budget: adsetRes ? String(adsetRes.lifetime_budget ?? '') || null : null,
      start_time: adsetRes ? String(adsetRes.start_time ?? '') || null : null,
      end_time: adsetRes ? String(adsetRes.end_time ?? '') || null : null,
      post_id: postId,
    });
  } catch (e) {
    res.json({ ok: false, reason: 'انتهت مهلة الاتصال' });
  }
});

// ── Update ad ────────────────────────────────────────────────────
router.post('/update-ad', async (req, res) => {
  const { token, ad_id, adset_id, campaign_id, status, daily_budget, lifetime_budget, end_time, post_id, page_id, ad_account } = req.body || {};
  if (!token) {
    return res.status(400).json({ ok: false, reason: 'بيانات ناقصة' });
  }

  const GRAPH = 'https://graph.facebook.com/v21.0';
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const patchEntity = async (id, body) => {
    const r = await fetch(`${GRAPH}/${id}`, {
      method: 'POST', headers,
      body: JSON.stringify(body),
    }).then(resp => resp.json());
    if (r?.error) throw new Error(r.error?.message ?? String(r.error));
    return r;
  };

  try {
    const ops = [];

    if (status) {
      for (const id of [campaign_id, adset_id, ad_id]) {
        if (id) ops.push(patchEntity(id, { status }));
      }
    }

    if ((daily_budget || lifetime_budget || end_time) && adset_id) {
      const adsetBody = {};
      if (daily_budget) adsetBody.daily_budget = Math.round(Number(daily_budget) * 100);
      if (lifetime_budget) adsetBody.lifetime_budget = Math.round(Number(lifetime_budget) * 100);
      if (end_time) adsetBody.end_time = end_time;
      if (Object.keys(adsetBody).length) ops.push(patchEntity(adset_id, adsetBody));
    }

    if (post_id && ad_id && ad_account) {
      const actId = ad_account.replace('act_', '');
      const creativeBody = new URLSearchParams();
      creativeBody.append('access_token', token);
      creativeBody.append('object_story_id', post_id);
      const creativeRes = await fetch(`${GRAPH}/act_${actId}/adcreatives`, {
        method: 'POST', body: creativeBody,
      }).then(r => r.json());
      if (creativeRes?.error) throw new Error(creativeRes.error?.message ?? 'فشل تحديث الإبداعية');
      const newCreativeId = String(creativeRes.id ?? '');
      if (newCreativeId) {
        ops.push(patchEntity(ad_id, { creative: JSON.stringify({ creative_id: newCreativeId }) }));
      }
    }

    if (ops.length === 0) {
      return res.json({ ok: false, reason: 'لم يتم تحديد أي تعديل' });
    }

    await Promise.all(ops);

    const actions = [];
    if (status) actions.push(status === 'ACTIVE' ? 'تنشيط' : 'إيقاف');
    if (daily_budget) actions.push('تحديث الميزانية');
    if (end_time) actions.push('تحديث تاريخ الانتهاء');
    if (post_id) actions.push('نقل المنشور');

    res.json({ ok: true, message: `تم: ${actions.join(' + ')} ✅` });
  } catch (e) {
    res.json({ ok: false, reason: e.message ?? 'انتهت مهلة الاتصال' });
  }
});

// ── Inspect an access token ──────────────────────────────────────
// debug_token normally needs an app access token. Self-inspection works only
// when the token owner has a role on the issuing app, so /me is the fallback
// that still proves whether the token is alive.
router.post('/token-info', async (req, res) => {
  const { token, proxy } = req.body || {};
  if (!token) {
    return res.status(400).json({ ok: false, reason: 'أدخل Access Token' });
  }

  const GRAPH = 'https://graph.facebook.com/v21.0';
  const proxyUrl = proxy ? parseProxyUrl(proxy) : null;
  const qs = encodeURIComponent(token);

  try {
    const [meRes, dbgRes] = await Promise.all([
      proxyFetch(`${GRAPH}/me?fields=id,name&access_token=${qs}`, proxyUrl)
        .then(r => r.json()).catch(() => null),
      proxyFetch(`${GRAPH}/debug_token?input_token=${qs}&access_token=${qs}`, proxyUrl)
        .then(r => r.json()).catch(() => null),
    ]);

    if (meRes?.error) {
      const err = meRes.error;
      const expired = err.code === 190;
      return res.json({
        ok: true,
        valid: false,
        reason: err.message ?? 'توكن غير صالح',
        expired,
      });
    }

    const d = dbgRes?.data ?? null;
    // expires_at === 0 means the token carries no expiry (system user / long-lived).
    const expiresAt = d && typeof d.expires_at === 'number' ? d.expires_at : null;
    const dataExpiresAt = d && typeof d.data_access_expires_at === 'number'
      ? d.data_access_expires_at
      : null;

    res.json({
      ok: true,
      valid: true,
      user_id: meRes?.id ?? d?.user_id ?? null,
      name: meRes?.name ?? null,
      app_id: d?.app_id ?? null,
      app_name: d?.application ?? null,
      type: d?.type ?? null,
      scopes: Array.isArray(d?.scopes) ? d.scopes : null,
      issued_at: typeof d?.issued_at === 'number' ? d.issued_at : null,
      expires_at: expiresAt,
      data_access_expires_at: dataExpiresAt,
      // Null means debug_token was not permitted, so scope/expiry detail is unknown.
      details_available: !!d,
    });
  } catch {
    res.json({ ok: false, reason: 'انتهت مهلة الاتصال' });
  }
});

export default router;
