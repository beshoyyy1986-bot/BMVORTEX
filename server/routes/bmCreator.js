/**
 * BM Creator routes — CREATE BM, CREATE AD ACC, ADD INFO BM
 */
import express from 'express';
import { buildCookieHeader, getSession, extractBusinessId } from '../utils/fbSession.js';

const router = express.Router();

// Normalize bm_id — accepts a link, business_id/bid/bm_id param, or bare ID
const normBiz = (v) => (v ? (extractBusinessId(v) || v) : v);

const BM_NAMES = [
  'Nexora Soluções Digitais','Vortex Mídia Online','Conecta Marketing Digital',
  'Impulso Publicidade','Pixel Criativo Studio','Radar Digital','Orbita Comunicações',
  'Zenith Soluções Web','Lumina Digital','Praxis Consultoria','Sigma Mídia Group',
  'Apex Marketing','Delta Comunicação','Nova Mídia Interativa','Prime Digital',
  'Vector Publicidade','Fusion Media','Catalyst Marketing','Horizon Digital',
  'Elevate Digital','Pulse Comunicações','CoreTech Marketing','Synergy Digital',
];

function pickName() {
  return BM_NAMES[Math.floor(Math.random() * BM_NAMES.length)] + ' ' + (Math.floor(Math.random() * 900) + 100);
}

// ── POST /api/bm-creator/create-bm ────────────────────────────────────────
router.post('/create-bm', async (req, res) => {
  const { cookies, timezone_id = '1', name } = req.body || {};
  let cookieStr;
  try { cookieStr = buildCookieHeader(cookies); } catch (e) { return res.json({ ok: false, reason: e.message }); }

  try {
    const auth = await getSession(cookieStr);
    if (!auth) return res.json({ ok: false, reason: 'No valid Facebook session found' });

    const bmName = name || pickName();
    const email  = Math.random().toString(36).substring(2, 10) + '@mailto.plus';

    const body = new URLSearchParams({
      brand_name: bmName, first_name: 'Carlos', last_name: 'Silva',
      email, timezone_id, business_category: 'ADVERTISING',
      is_b2b: 'false', __a: '1', fb_dtsg: auth.dtsg,
    }).toString();

    const fbRes = await fetch('https://business.facebook.com/business/create_account', {
      method: 'POST',
      headers: { cookie: cookieStr, 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Mozilla/5.0' },
      body,
    });
    const json = await fbRes.json().catch(() => null);

    const payload = json?.payload;
    let bmId = null;
    if (payload && typeof payload === 'string' && payload.includes('business.facebook.com')) {
      const m = payload.match(/[?&](?:bid|business_id|id)=(\d+)/);
      if (m) bmId = m[1];
    } else if (payload?.id) {
      bmId = payload.id;
    } else if (payload?.business?.id) {
      bmId = payload.business.id;
    }

    if (bmId) return res.json({ ok: true, bm_id: bmId, name: bmName });
    return res.json({ ok: false, reason: json?.errorSummary || json?.error?.message || 'Unknown error' });
  } catch (e) {
    return res.json({ ok: false, reason: e.message });
  }
});

// ── POST /api/bm-creator/create-ad-acc ────────────────────────────────────
router.post('/create-ad-acc', async (req, res) => {
  const { cookies, bm_id: bmRaw, currency = 'USD', name } = req.body || {};
  let cookieStr;
  try { cookieStr = buildCookieHeader(cookies); } catch (e) { return res.json({ ok: false, reason: e.message }); }

  try {
    const auth = await getSession(cookieStr);
    if (!auth) return res.json({ ok: false, reason: 'No valid Facebook session found' });

    const bmId = normBiz(bmRaw) || auth.bizId;
    if (!bmId) return res.json({ ok: false, reason: 'Business ID not found — enter manually' });

    const accName = name || ('BM AD ACC ' + (Math.floor(Math.random() * 9000) + 1000));
    const body = new URLSearchParams({
      av: auth.userId, __user: auth.userId, __a: '1',
      fb_dtsg: auth.dtsg,
      fb_api_caller_class: 'RelayModern',
      fb_api_req_friendly_name: 'BizKitSettingsCreateAdAccountMutation',
      server_timestamps: 'true',
      variables: JSON.stringify({ businessID: bmId, adAccountName: accName, timezoneID: '1', currency, endAdvertiserID: bmId }),
      doc_id: '9236789956426634',
    }).toString();

    const fbRes = await fetch('https://business.facebook.com/api/graphql/', {
      method: 'POST',
      headers: { cookie: cookieStr, 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Mozilla/5.0' },
      body,
    });
    const json = await fbRes.json().catch(() => null);
    const newAcc = json?.data?.create_ad_account_in_business || json?.data?.business_create_ad_account || json?.data?.createAdAccount;
    const accId  = newAcc?.ad_account?.id || newAcc?.adAccount?.id || newAcc?.id;

    if (accId) return res.json({ ok: true, acc_id: accId.replace('act_', ''), name: accName });
    if (json?.errors) return res.json({ ok: false, reason: json.errors[0]?.message || 'API Error' });
    return res.json({ ok: false, reason: 'Unknown response — check Ad Accounts' });
  } catch (e) {
    return res.json({ ok: false, reason: e.message });
  }
});

// ── POST /api/bm-creator/upload-picture ───────────────────────────────────
router.post('/upload-picture', async (req, res) => {
  const { cookies, bm_id: bmRaw } = req.body || {};
  let cookieStr;
  try { cookieStr = buildCookieHeader(cookies); } catch (e) { return res.json({ ok: false, reason: e.message }); }
  const bm_id = normBiz(bmRaw);
  if (!bm_id) return res.json({ ok: false, reason: 'Business ID required' });

  try {
    const auth = await getSession(cookieStr);
    if (!auth) return res.json({ ok: false, reason: 'No valid Facebook session found' });

    const imgRes = await fetch('https://i.ibb.co/yqhKsqH/conselho.jpg');
    if (!imgRes.ok) return res.json({ ok: false, reason: 'Could not fetch profile image' });
    const imgBuf = Buffer.from(await imgRes.arrayBuffer());

    const boundary = '----FormBoundary' + Math.random().toString(36).substring(2);
    const parts = [
      `--${boundary}\r\nContent-Disposition: form-data; name="fb_dtsg"\r\n\r\n${auth.dtsg}`,
      `--${boundary}\r\nContent-Disposition: form-data; name="av"\r\n\r\n${auth.userId}`,
      `--${boundary}\r\nContent-Disposition: form-data; name="business_id"\r\n\r\n${bm_id}`,
      `--${boundary}\r\nContent-Disposition: form-data; name="profile_picture"; filename="photo.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`,
    ];
    const bodyBuf = Buffer.concat([Buffer.from(parts.join('\r\n')), imgBuf, Buffer.from(`\r\n--${boundary}--\r\n`)]);

    const fbRes = await fetch('https://business.facebook.com/business/profile_picture/upload/', {
      method: 'POST',
      headers: { cookie: cookieStr, 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'User-Agent': 'Mozilla/5.0' },
      body: bodyBuf,
    });
    const json = await fbRes.json().catch(() => null);
    if (json?.payload || json?.success) return res.json({ ok: true });
    return res.json({ ok: false, reason: json?.errorSummary || 'Upload may have failed' });
  } catch (e) {
    return res.json({ ok: false, reason: e.message });
  }
});

// ── POST /api/bm-creator/update-info ──────────────────────────────────────
router.post('/update-info', async (req, res) => {
  const { cookies, bm_id: bmRaw } = req.body || {};
  let cookieStr;
  try { cookieStr = buildCookieHeader(cookies); } catch (e) { return res.json({ ok: false, reason: e.message }); }
  const bm_id = normBiz(bmRaw);
  if (!bm_id) return res.json({ ok: false, reason: 'Business ID required' });

  try {
    const auth = await getSession(cookieStr);
    if (!auth) return res.json({ ok: false, reason: 'No valid Facebook session found' });

    const body = new URLSearchParams({
      variables: JSON.stringify({
        input: {
          actor_id: auth.userId, client_mutation_id: '8', business_id: bm_id,
          business_profile: {
            legal_name: 'CONSELHO ESCOLAR VICE',
            address: { street1: 'S/N CENTRO', street2: 'RUA AQUILINO CORREA E SILVA', city: 'Guarani', state: 'Goiás', postal_code: '73910000', country: 'BR' },
            phone_number: '(62) 98765-4321',
            website_url: `https://www.facebook.com/profile.php?id=${auth.userId}`,
            tax_id_number: '00658805000127',
          },
        },
      }),
      doc_id: '10022067921177501',
      fb_dtsg: auth.dtsg,
      fb_api_caller_class: 'RelayModern',
      fb_api_req_friendly_name: 'BizKitSettingsUpdateBusinessDetailsMutation',
      server_timestamps: 'true',
    }).toString();

    const fbRes = await fetch('https://business.facebook.com/api/graphql/', {
      method: 'POST',
      headers: { cookie: cookieStr, 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Mozilla/5.0' },
      body,
    });
    const json = await fbRes.json().catch(() => null);
    if (json?.errors) return res.json({ ok: false, reason: json.errors[0]?.message || 'GraphQL Error' });
    return res.json({ ok: true });
  } catch (e) {
    return res.json({ ok: false, reason: e.message });
  }
});

export default router;
