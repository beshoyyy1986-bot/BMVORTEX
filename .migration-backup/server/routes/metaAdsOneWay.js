/**
 * Meta Ads One Way — image-based ad creation via Graph API
 * Uses the token extracted in the frontend (via /api/mini-meta/verify-extract)
 * and creates a campaign + adset + creative + ad using the Facebook Graph API.
 */
import { Router } from 'express';
import multer from 'multer';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

const GV   = 'v18.0';
const BASE = `https://graph.facebook.com/${GV}`;

/** Extract act_XXXXXXX numeric id from various input forms */
function extractActId(input = '') {
  const m = input.match(/act_(\d+)/);
  if (m) return m[1];
  const digits = input.match(/(\d{6,})/);
  if (digits) return digits[1];
  return input.replace(/\D/g, '');
}

/** Helper: POST to Graph API as JSON */
async function graphPost(endpoint, body) {
  const res = await fetch(`${BASE}/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

// ── POST /api/meta-one-way/create-image-ad ────────────────────────────────
router.post('/create-image-ad', upload.single('image'), async (req, res) => {
  const { token, ad_account, content, budget, days, country, gender, age_min, age_max } = req.body;
  const imageBuffer = req.file?.buffer;
  const imageMime   = req.file?.mimetype || 'image/jpeg';

  if (!token)       return res.json({ ok: false, reason: 'التوكن مطلوب — استخرج التوكن أولاً' });
  if (!ad_account)  return res.json({ ok: false, reason: 'الحساب الإعلاني مطلوب' });
  if (!imageBuffer) return res.json({ ok: false, reason: 'الصورة مطلوبة' });

  const actId = extractActId(ad_account);
  if (!actId) return res.json({ ok: false, reason: 'تعذّر استخراج معرّف الحساب الإعلاني' });

  try {
    // ── 1. Fetch currency ────────────────────────────────────────────────
    let currency = 'USD';
    try {
      const accInfo = await fetch(
        `${BASE}/act_${actId}?fields=currency&access_token=${encodeURIComponent(token)}`
      ).then(r => r.json());
      if (accInfo.currency) currency = accInfo.currency;
    } catch (_) { /* fallback USD */ }

    // ── 2. Upload image (bytes as base64 via URL-encoded form) ───────────
    const imageB64 = imageBuffer.toString('base64');
    const imgParams = new URLSearchParams({
      bytes: imageB64,
      access_token: token,
    });
    const imgRes = await fetch(`${BASE}/act_${actId}/adimages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: imgParams.toString(),
    }).then(r => r.json());

    if (imgRes.error) {
      return res.json({ ok: false, reason: `فشل رفع الصورة: ${imgRes.error.message}` });
    }

    const imageHash = Object.values(imgRes.images || {})[0]?.hash;
    if (!imageHash) {
      return res.json({ ok: false, reason: 'لم يتم استخراج hash الصورة من استجابة فيسبوك' });
    }

    // ── 3. Create campaign ───────────────────────────────────────────────
    const campaignRes = await graphPost(`act_${actId}/campaigns`, {
      name:       `Meta One Way — ${Date.now()}`,
      objective:  'OUTCOME_ENGAGEMENT',
      status:     'PAUSED',
      access_token: token,
    });
    if (campaignRes.error) {
      return res.json({ ok: false, reason: `فشل إنشاء الحملة: ${campaignRes.error.message}` });
    }
    const campaignId = campaignRes.id;

    // ── 4. Build targeting ───────────────────────────────────────────────
    const targeting = {
      age_min: parseInt(age_min) || 18,
      age_max: parseInt(age_max) || 65,
      geo_locations: { countries: [(country || 'EG').toUpperCase()] },
    };
    if (parseInt(gender) > 0) targeting.genders = [parseInt(gender)];

    const budgetCents = Math.round(parseFloat(budget || 10) * 100);
    const nowSec      = Math.floor(Date.now() / 1000);

    // ── 5. Create ad set ─────────────────────────────────────────────────
    const adSetRes = await graphPost(`act_${actId}/adsets`, {
      name:              `AdSet — ${Date.now()}`,
      campaign_id:       campaignId,
      billing_event:     'IMPRESSIONS',
      optimization_goal: 'POST_ENGAGEMENT',
      daily_budget:      budgetCents,
      start_time:        nowSec + 1800,           // +30 min
      end_time:          nowSec + 1800 + (parseInt(days) || 1) * 86400,
      targeting,
      status:            'PAUSED',
      access_token:      token,
    });
    if (adSetRes.error) {
      return res.json({ ok: false, reason: `فشل إنشاء المجموعة الإعلانية: ${adSetRes.error.message}` });
    }

    // ── 6. Get page_id for creative ──────────────────────────────────────
    // Try to fetch linked pages; fall back to actId
    let pageId = actId;
    try {
      const pagesRes = await fetch(
        `${BASE}/me/accounts?access_token=${encodeURIComponent(token)}&limit=1`
      ).then(r => r.json());
      if (pagesRes.data?.[0]?.id) pageId = pagesRes.data[0].id;
    } catch (_) { /* keep actId */ }

    // ── 7. Create ad creative ────────────────────────────────────────────
    const creativeRes = await graphPost(`act_${actId}/adcreatives`, {
      name: `Creative — ${Date.now()}`,
      object_story_spec: {
        page_id:   pageId,
        link_data: {
          message:    content || '',
          image_hash: imageHash,
          link:       'https://www.facebook.com',
        },
      },
      access_token: token,
    });
    if (creativeRes.error) {
      return res.json({ ok: false, reason: `فشل إنشاء التصميم الإبداعي: ${creativeRes.error.message}` });
    }

    // ── 8. Create ad ─────────────────────────────────────────────────────
    const adRes = await graphPost(`act_${actId}/ads`, {
      name:     `Ad — ${Date.now()}`,
      adset_id: adSetRes.id,
      creative: { creative_id: creativeRes.id },
      status:   'ACTIVE',
      access_token: token,
    });
    if (adRes.error) {
      return res.json({ ok: false, reason: `فشل إنشاء الإعلان: ${adRes.error.message}` });
    }

    return res.json({
      ok:          true,
      message:     'تم إنشاء الإعلان بنجاح ✅',
      ad_id:       adRes.id,
      adset_id:    adSetRes.id,
      campaign_id: campaignId,
      currency,
    });

  } catch (err) {
    return res.json({ ok: false, reason: err.message });
  }
});

export default router;
