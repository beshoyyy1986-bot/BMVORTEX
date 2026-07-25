/**
 * BM Creator routes — CREATE BM, CREATE AD ACC, ADD INFO BM
 * All operations proxy Facebook Graph / Business API calls using
 * cookies supplied by the client (same pattern as ccFromBm.js).
 */
import express from 'express';

const router = express.Router();

// ── Helpers ────────────────────────────────────────────────────────────────
function cookiesToHeader(raw) {
  if (!raw) return '';
  const str = raw.trim();
  // JSON array of cookie objects
  if (str.startsWith('[')) {
    try {
      return JSON.parse(str).map(c => `${c.name}=${c.value}`).join('; ');
    } catch (_) { /* fall through */ }
  }
  return str; // already plain cookie string
}

function parseDtsg(html) {
  const m = html.match(/"DTSGInitialData".*?"token":"([^"]+)"/);
  return m ? m[1] : null;
}

function parseUserId(html) {
  const m = html.match(/"USER_ID":"(\d+)"/);
  return m ? m[1] : null;
}

function parseBusinessId(html) {
  const m = html.match(/[?&]business_id=(\d+)/);
  if (m) return m[1];
  const m2 = html.match(/"business_id":"(\d+)"/);
  return m2 ? m2[1] : null;
}

async function getSession(cookieStr) {
  const res  = await fetch('https://business.facebook.com/', {
    headers: { cookie: cookieStr, 'User-Agent': 'Mozilla/5.0' },
  });
  const html = await res.text();
  const dtsg   = parseDtsg(html);
  const userId = parseUserId(html);
  const bizId  = parseBusinessId(html);
  if (!dtsg || !userId) return null;
  return { dtsg, userId, bizId, origin: 'https://business.facebook.com' };
}

const BM_NAMES = [
  'Nexora Soluções Digitais','Vortex Mídia Online','Conecta Marketing Digital',
  'Impulso Publicidade','Pixel Criativo Studio','Radar Digital','Orbita Comunicações',
  'Zenith Soluções Web','Lumina Digital','Praxis Consultoria','Sigma Mídia Group',
  'Apex Marketing','Delta Comunicação','Nova Mídia Interativa','Prime Digital',
  'Vector Publicidade','Fusion Media','Catalyst Marketing','Horizon Digital',
  'Elevate Digital','Pulse Comunicações','CoreTech Marketing','Synergy Digital',
];

function pickName() {
  const base = BM_NAMES[Math.floor(Math.random() * BM_NAMES.length)];
  return base + ' ' + (Math.floor(Math.random() * 900) + 100);
}

// ── POST /api/bm-creator/create-bm ────────────────────────────────────────
router.post('/create-bm', async (req, res) => {
  const { cookies, timezone_id = '1', name } = req.body || {};
  const cookieStr = cookiesToHeader(cookies);
  if (!cookieStr) return res.json({ ok: false, reason: 'No cookies provided' });

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

    const fbRes = await fetch(`${auth.origin}/business/create_account`, {
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
    const errMsg = json?.errorSummary || json?.error?.message || 'Unknown error';
    return res.json({ ok: false, reason: errMsg });
  } catch (e) {
    return res.json({ ok: false, reason: e.message });
  }
});

// ── POST /api/bm-creator/create-ad-acc ────────────────────────────────────
router.post('/create-ad-acc', async (req, res) => {
  const { cookies, bm_id, currency = 'USD', name } = req.body || {};
  const cookieStr = cookiesToHeader(cookies);
  if (!cookieStr) return res.json({ ok: false, reason: 'No cookies provided' });

  try {
    const auth = await getSession(cookieStr);
    if (!auth) return res.json({ ok: false, reason: 'No valid Facebook session found' });

    const bmId = bm_id || auth.bizId;
    if (!bmId) return res.json({ ok: false, reason: 'Business ID not found — enter manually' });

    const accName = name || ('BM AD ACC ' + (Math.floor(Math.random() * 9000) + 1000));
    const variables = { businessID: bmId, adAccountName: accName, timezoneID: '1', currency, endAdvertiserID: bmId };

    const body = new URLSearchParams({
      av: auth.userId, __user: auth.userId, __a: '1',
      fb_dtsg: auth.dtsg,
      fb_api_caller_class: 'RelayModern',
      fb_api_req_friendly_name: 'BizKitSettingsCreateAdAccountMutation',
      server_timestamps: 'true',
      variables: JSON.stringify(variables),
      doc_id: '9236789956426634',
    }).toString();

    const fbRes = await fetch(`${auth.origin}/api/graphql/`, {
      method: 'POST',
      headers: { cookie: cookieStr, 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Mozilla/5.0' },
      body,
    });
    const json = await fbRes.json().catch(() => null);

    const data   = json?.data;
    const newAcc = data?.create_ad_account_in_business || data?.business_create_ad_account || data?.createAdAccount;
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
  // Picture upload requires multipart with the image file pulled from a URL.
  // This endpoint fetches the standard BM profile image and uploads it.
  const { cookies, bm_id } = req.body || {};
  const cookieStr = cookiesToHeader(cookies);
  if (!cookieStr) return res.json({ ok: false, reason: 'No cookies provided' });
  if (!bm_id)    return res.json({ ok: false, reason: 'Business ID required' });

  try {
    const auth = await getSession(cookieStr);
    if (!auth) return res.json({ ok: false, reason: 'No valid Facebook session found' });

    // Fetch profile image (standard placeholder image used for BM setup)
    const imgUrl = 'https://i.ibb.co/yqhKsqH/conselho.jpg';
    const imgRes = await fetch(imgUrl);
    if (!imgRes.ok) return res.json({ ok: false, reason: 'Could not fetch profile image' });
    const imgBuf = Buffer.from(await imgRes.arrayBuffer());

    // Build multipart form
    const boundary = '----FormBoundary' + Math.random().toString(36).substring(2);
    const parts = [
      `--${boundary}\r\nContent-Disposition: form-data; name="fb_dtsg"\r\n\r\n${auth.dtsg}`,
      `--${boundary}\r\nContent-Disposition: form-data; name="av"\r\n\r\n${auth.userId}`,
      `--${boundary}\r\nContent-Disposition: form-data; name="business_id"\r\n\r\n${bm_id}`,
      `--${boundary}\r\nContent-Disposition: form-data; name="profile_picture"; filename="photo.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`,
    ];
    const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
    const bodyBuf = Buffer.concat([
      Buffer.from(parts.join('\r\n')),
      imgBuf,
      tail,
    ]);

    const fbRes = await fetch(`${auth.origin}/business/profile_picture/upload/`, {
      method: 'POST',
      headers: {
        cookie: cookieStr,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'User-Agent': 'Mozilla/5.0',
      },
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
  const { cookies, bm_id } = req.body || {};
  const cookieStr = cookiesToHeader(cookies);
  if (!cookieStr) return res.json({ ok: false, reason: 'No cookies provided' });
  if (!bm_id)    return res.json({ ok: false, reason: 'Business ID required' });

  try {
    const auth = await getSession(cookieStr);
    if (!auth) return res.json({ ok: false, reason: 'No valid Facebook session found' });

    const variables = {
      input: {
        actor_id: auth.userId,
        client_mutation_id: '8',
        business_id: bm_id,
        business_profile: {
          legal_name: 'CONSELHO ESCOLAR VICE',
          address: { street1: 'S/N CENTRO', street2: 'RUA AQUILINO CORREA E SILVA', city: 'Guarani', state: 'Goiás', postal_code: '73910000', country: 'BR' },
          phone_number: '(62) 98765-4321',
          website_url: `https://www.facebook.com/profile.php?id=${auth.userId}`,
          tax_id_number: '00658805000127',
        },
      },
    };
    const body = new URLSearchParams({
      variables: JSON.stringify(variables),
      doc_id: '10022067921177501',
      fb_dtsg: auth.dtsg,
      fb_api_caller_class: 'RelayModern',
      fb_api_req_friendly_name: 'BizKitSettingsUpdateBusinessDetailsMutation',
      server_timestamps: 'true',
    }).toString();

    const fbRes = await fetch(`${auth.origin}/api/graphql/`, {
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
