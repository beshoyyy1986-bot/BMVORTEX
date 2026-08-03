/**
 * BM Creator routes — CREATE BM, CREATE AD ACC, ADD INFO BM
 * All operations proxy Facebook Graph / Business API calls using
 * cookies supplied by the client (same pattern as ccFromBm.js).
 */
import express from 'express';
import { buildCookieHeader, getSession, extractBusinessId } from '../../utils/metaTokens.js';

const router = express.Router();

// cookiesToHeader kept as thin shim for any internal callers
const cookiesToHeader = (raw) => { try { return buildCookieHeader(raw); } catch (_) { return ''; } };
// normalize bm_id — accepts a link, business_id/bid/bm_id param, or bare ID
const normBiz = (v) => (v ? (extractBusinessId(v) || v) : v);

// Facebook prefixes JSON responses with `for (;;);` to block JSON hijacking,
// which makes res.json() throw. Responses that use server_timestamps/@defer also
// arrive as several JSON documents separated by newlines, so parsing the body as
// one object throws and a successful call gets misread as a failure.
async function fbJson(fbRes) {
  const text = await fbRes.text().catch(() => '');
  if (!text) return { json: null, chunks: [], text: '' };

  const strip = (s) => s.replace(/^\s*for\s*\(;;\);\s*/, '').replace(/^\s*\)\]\}'?,?\s*/, '');
  const chunks = [];
  for (const line of text.split('\n')) {
    const cleaned = strip(line).trim();
    if (!cleaned) continue;
    try { chunks.push(JSON.parse(cleaned)); } catch (_) { /* partial chunk */ }
  }
  if (!chunks.length) {
    try { chunks.push(JSON.parse(strip(text))); } catch (_) { /* not JSON */ }
  }
  return { json: chunks[0] || null, chunks, text };
}

// Meta validates fb_dtsg with a companion `jazoest` token: the literal "2"
// followed by the sum of the dtsg's char codes. Requests without it are
// rejected on some endpoints.
function jazoest(dtsg) {
  let sum = 0;
  for (const ch of String(dtsg || '')) sum += ch.charCodeAt(0);
  return '2' + sum;
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

// BM profile pictures — rotated at random so every business does not end up
// with an identical photo, which is what gets them flagged as a batch.
const PROFILE_IMAGES = [
  'https://i.postimg.cc/c1TKxNRp/Chat-GPT-Image-Jul-31-2026-08-30-00-PM.png',
  'https://i.postimg.cc/5yZW40n7/Chat-GPT-Image-Jul-29-2026-09-42-50-AM.png',
  'https://i.postimg.cc/DyLwWkLX/Chat-GPT-Image-Jul-31-2026-08-36-55-PM.png',
  'https://i.postimg.cc/VLQYPGpw/Chat-GPT-Image-Jul-31-2026-08-35-20-PM.png',
  'https://i.postimg.cc/mD4gNd4B/Chat-GPT-Image-Jul-31-2026-08-57-07-PM.png',
];

// Recursively hunt for an ad-account id anywhere in a GraphQL response. Meta
// changes the mutation's result shape frequently, so keying off fixed paths
// reports failure on responses that actually succeeded.
function findAccountId(node, depth = 0) {
  if (!node || depth > 6) return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findAccountId(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof node !== 'object') return null;

  for (const key of ['account_id', 'accountID', 'adAccountID', 'ad_account_id']) {
    const v = node[key];
    if (typeof v === 'string' || typeof v === 'number') {
      const digits = String(v).replace(/^act_/, '');
      if (/^\d{6,}$/.test(digits)) return digits;
    }
  }
  if (typeof node.id === 'string' && /^act_\d{6,}$/.test(node.id)) {
    return node.id.replace('act_', '');
  }

  for (const value of Object.values(node)) {
    const found = findAccountId(value, depth + 1);
    if (found) return found;
  }
  return null;
}

// Ask Facebook which ad accounts the business owns. Used to confirm a creation
// whose mutation response was unreadable, and to skip ones already counted.
// The Graph API path needs an access token, which a dtsg-only session does not
// have, so fall back to the same internal endpoint the Business UI uses.
async function listBusinessAdAccounts(auth, cookieStr, bmId) {
  const token = auth.accessToken;
  if (token) {
    try {
      const url = `https://graph.facebook.com/v19.0/${bmId}/owned_ad_accounts`
        + `?fields=account_id,name&limit=200&access_token=${encodeURIComponent(token)}`;
      const r = await fetch(url, { headers: { cookie: cookieStr, 'User-Agent': 'Mozilla/5.0' } });
      const j = await r.json().catch(() => null);
      if (Array.isArray(j?.data)) {
        return j.data.map(a => ({ id: String(a.account_id || '').replace('act_', ''), name: a.name || '' }));
      }
    } catch (_) { /* fall through to the cookie-only path */ }
  }

  try {
    const r = await fetch(
      `${auth.origin}/business/adaccounts/?business_id=${encodeURIComponent(bmId)}&__a=1`,
      {
        headers: {
          cookie: cookieStr,
          'User-Agent': 'Mozilla/5.0',
          'x-requested-with': 'XMLHttpRequest',
          referer: `${auth.origin}/settings/ad-accounts?business_id=${encodeURIComponent(bmId)}`,
        },
      },
    );
    const { text } = await fbJson(r);
    // The payload shape shifts between releases; scrape id/name pairs instead.
    const found = [];
    const rx = /"(?:account_id|id)"\s*:\s*"(?:act_)?(\d{6,})"[\s\S]{0,400}?"name"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
    let m;
    while ((m = rx.exec(text))) {
      let name = m[2];
      try { name = JSON.parse(`"${name}"`); } catch (_) { /* keep raw */ }
      found.push({ id: m[1], name });
    }
    return found.length ? found : null;
  } catch (_) {
    return null;
  }
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
      is_b2b: 'false', __a: '1', fb_dtsg: auth.dtsg, jazoest: jazoest(auth.dtsg),
    }).toString();

    const fbRes = await fetch(`${auth.origin}/business/create_account`, {
      method: 'POST',
      headers: { cookie: cookieStr, 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Mozilla/5.0' },
      body,
    });
    const { json } = await fbJson(fbRes);

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
  const { cookies, currency = 'USD', name } = req.body || {};
  const bm_id = normBiz((req.body || {}).bm_id);
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
      av: auth.userId, __user: auth.userId, __a: '1', __comet_req: '11',
      fb_dtsg: auth.dtsg,
      jazoest: jazoest(auth.dtsg),
      lsd: auth.lsd || '',
      fb_api_caller_class: 'RelayModern',
      fb_api_req_friendly_name: 'BizKitSettingsCreateAdAccountMutation',
      server_timestamps: 'true',
      variables: JSON.stringify(variables),
      doc_id: '9236789956426634',
    }).toString();

    const fbRes = await fetch(`${auth.origin}/api/graphql/`, {
      method: 'POST',
      headers: {
        cookie: cookieStr,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0',
        'x-fb-lsd': auth.lsd || '',
        'x-fb-friendly-name': 'BizKitSettingsCreateAdAccountMutation',
        referer: `${auth.origin}/settings/ad-accounts?business_id=${encodeURIComponent(bmId)}`,
      },
      body,
    });
    const { chunks } = await fbJson(fbRes);

    // The id can land in any deferred chunk, not just the first document.
    let accId = null;
    for (const chunk of chunks) {
      accId = findAccountId(chunk?.data ?? chunk);
      if (accId) break;
    }
    if (accId) return res.json({ ok: true, acc_id: accId, name: accName });

    // Hard errors that mean the account really was not created.
    const errMsg = chunks.map(c => c?.errors?.[0]?.message || c?.errorSummary || '').find(Boolean) || '';
    const isHardError = /limit|permission|not allowed|disabled|restricted|denied|verify/i.test(errMsg);
    if (isHardError) return res.json({ ok: false, reason: errMsg });

    // Otherwise the mutation may well have succeeded with a response shape we
    // could not parse. Confirm against the business's actual ad account list
    // before reporting a failure the user can see is wrong.
    await new Promise(r => setTimeout(r, 2500));
    const accounts = await listBusinessAdAccounts(auth, cookieStr, bmId);
    const match = accounts?.find(a => a.name === accName);
    if (match) return res.json({ ok: true, acc_id: match.id, name: accName, verified: true });

    if (errMsg) return res.json({ ok: false, reason: errMsg });
    return res.json({ ok: false, reason: 'Unknown response — check Ad Accounts' });
  } catch (e) {
    return res.json({ ok: false, reason: e.message });
  }
});

// ── POST /api/bm-creator/upload-picture ───────────────────────────────────
router.post('/upload-picture', async (req, res) => {
  // Meta moved profile-picture upload off /business/profile_picture/upload/ and
  // onto a Relay mutation: a multipart POST to /api/graphql/ where the file part
  // is named "file" and referenced from variables as the string "file".
  const { cookies } = req.body || {};
  const bm_id = normBiz((req.body || {}).bm_id);
  const cookieStr = cookiesToHeader(cookies);
  if (!cookieStr) return res.json({ ok: false, reason: 'No cookies provided' });
  if (!bm_id)    return res.json({ ok: false, reason: 'Business ID required' });

  try {
    const auth = await getSession(cookieStr);
    if (!auth) return res.json({ ok: false, reason: 'No valid Facebook session found' });

    // Try the images in random order so repeated runs do not reuse one photo,
    // and so a single dead host does not fail the whole step.
    const order = PROFILE_IMAGES
      .map(url => ({ url, k: Math.random() }))
      .sort((a, b) => a.k - b.k)
      .map(x => x.url);

    let imgBuf = null, usedUrl = null, contentType = 'image/png';
    for (const url of order) {
      try {
        const imgRes = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (!imgRes.ok) continue;
        const buf = Buffer.from(await imgRes.arrayBuffer());
        if (buf.length < 1024) continue;
        imgBuf = buf;
        usedUrl = url;
        contentType = imgRes.headers.get('content-type') || (url.endsWith('.jpg') ? 'image/jpeg' : 'image/png');
        break;
      } catch (_) { /* try the next mirror */ }
    }
    if (!imgBuf) return res.json({ ok: false, reason: 'Could not fetch any profile image' });

    const ext  = contentType.includes('jpeg') ? 'jpg' : 'png';
    const form = new FormData();
    form.append('file', new Blob([imgBuf], { type: contentType }), `photo.${ext}`);
    form.append('av', String(auth.userId));
    form.append('__user', String(auth.userId));
    form.append('__bid', String(bm_id));
    form.append('__a', '1');
    form.append('__comet_req', '11');
    form.append('dpr', '1');
    form.append('fb_dtsg', auth.dtsg);
    form.append('jazoest', jazoest(auth.dtsg));
    form.append('lsd', auth.lsd || '');
    form.append('fb_api_caller_class', 'RelayModern');
    form.append('fb_api_req_friendly_name', 'BizKitSettingsUpdateBusinessProfilePictureMutation');
    form.append('server_timestamps', 'true');
    form.append('variables', JSON.stringify({ businessID: String(bm_id), file: 'file' }));
    form.append('doc_id', '24069914029272386');

    const fbRes = await fetch(`${auth.origin}/api/graphql/`, {
      method: 'POST',
      headers: {
        cookie: cookieStr,
        'User-Agent': 'Mozilla/5.0',
        'x-fb-lsd': auth.lsd || '',
        'x-fb-friendly-name': 'BizKitSettingsUpdateBusinessProfilePictureMutation',
        referer: `${auth.origin}/settings/info?business_id=${encodeURIComponent(bm_id)}`,
        origin: auth.origin,
      },
      body: form,
    });
    const { chunks, text } = await fbJson(fbRes);

    const errMsg = chunks
      .map(c => c?.errors?.[0]?.message || c?.errorSummary || c?.error?.message || '')
      .find(Boolean) || '';
    const hasData = chunks.some(c => c?.data && Object.keys(c.data).length > 0);
    if (hasData && !errMsg) return res.json({ ok: true, image: usedUrl });

    return res.json({ ok: false, reason: errMsg || `Upload rejected (HTTP ${fbRes.status})`, detail: text.slice(0, 200) });
  } catch (e) {
    return res.json({ ok: false, reason: e.message });
  }
});

// ── POST /api/bm-creator/update-info ──────────────────────────────────────
router.post('/update-info', async (req, res) => {
  const { cookies } = req.body || {};
  const bm_id = normBiz((req.body || {}).bm_id);
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
      av: auth.userId, __user: auth.userId, __a: '1', __comet_req: '11',
      variables: JSON.stringify(variables),
      doc_id: '10022067921177501',
      fb_dtsg: auth.dtsg,
      jazoest: jazoest(auth.dtsg),
      lsd: auth.lsd || '',
      fb_api_caller_class: 'RelayModern',
      fb_api_req_friendly_name: 'BizKitSettingsUpdateBusinessDetailsMutation',
      server_timestamps: 'true',
    }).toString();

    const fbRes = await fetch(`${auth.origin}/api/graphql/`, {
      method: 'POST',
      headers: {
        cookie: cookieStr,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0',
        'x-fb-lsd': auth.lsd || '',
        'x-fb-friendly-name': 'BizKitSettingsUpdateBusinessDetailsMutation',
        referer: `${auth.origin}/settings/info?business_id=${encodeURIComponent(bm_id)}`,
      },
      body,
    });
    const { chunks } = await fbJson(fbRes);
    const errMsg = chunks.map(c => c?.errors?.[0]?.message || c?.errorSummary || '').find(Boolean);
    if (errMsg) return res.json({ ok: false, reason: errMsg });
    return res.json({ ok: true });
  } catch (e) {
    return res.json({ ok: false, reason: e.message });
  }
});

export default router;
