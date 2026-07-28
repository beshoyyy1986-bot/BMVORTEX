/**
 * metaTokens.js — Unified Meta/Facebook token & cookie extraction
 *
 * Single source of truth for ALL tools in the project.
 * No more duplicated buildCookieHeader / extractFbDtsg across files.
 *
 * Exports:
 *   buildCookieHeader(raw)           — raw string | JSON array | JSON object → "name=val; …"
 *   extractFromCookieStr(str)        — pull c_user, xs, fr, datr … from cookie string
 *   extractFromHtml(html)            — pull fb_dtsg, lsd, accessToken, userId, bizId from page HTML
 *   extractAdAccountId(input)        — smart ID from URL params (act, asset, account_id …) or bare number
 *   extractAll(cookieRaw, html?)     — convenience: run everything in one call
 *   buildFbHeaders(cookieHeader, x)  — standard Facebook fetch headers
 *   fetchAndExtract(cookieHeader, url, opts?) — fetch a FB page + extractAll
 *   getSession(cookieRaw, url?)      — fetch business.facebook.com, return {dtsg,userId,bizId,cookieHeader,origin}
 */

// ─── 1. Cookie header builder ───────────────────────────────────────────────

/**
 * Convert cookies in ANY format → "name=value; name=value; …" header string.
 *
 * Accepted formats
 *   1. Raw string  →  "c_user=123; xs=abc; …"   (semicolons / newlines / spaces)
 *   2. JSON array  →  [{"name":"c_user","value":"123"}, …]   (EditThisCookie / Playwright)
 *   3. JSON object →  {"c_user":"123","xs":"abc"}
 *
 * @param {string|Array|Object} raw
 * @returns {string}
 * @throws {Error} with Arabic message if input is empty or unparseable
 */
export function buildCookieHeader(raw) {
  if (!raw) throw new Error('الكوكيز فارغة');

  // If already an array/object (passed programmatically from Playwright)
  if (typeof raw !== 'string') {
    if (Array.isArray(raw)) {
      const h = raw
        .filter((c) => c && c.name && c.value != null)
        .map((c) => `${c.name}=${c.value}`)
        .join('; ');
      if (!h) throw new Error('مصفوفة الكوكيز لا تحتوي على عناصر صالحة');
      return h;
    }
    if (typeof raw === 'object') {
      const h = Object.entries(raw)
        .filter(([k, v]) => k && v != null)
        .map(([k, v]) => `${k}=${v}`)
        .join('; ');
      if (!h) throw new Error('كائن الكوكيز لا يحتوي على عناصر صالحة');
      return h;
    }
  }

  const str = raw.trim();

  // ── Try JSON first ─────────────────────────────────────────────────────────
  if (str.startsWith('[') || str.startsWith('{')) {
    try {
      const parsed = JSON.parse(str);

      if (Array.isArray(parsed)) {
        const h = parsed
          .filter((c) => c && c.name && c.value != null)
          .map((c) => `${c.name}=${c.value}`)
          .join('; ');
        if (!h) throw new Error('مصفوفة الكوكيز لا تحتوي على عناصر صالحة');
        return h;
      }

      if (typeof parsed === 'object' && parsed !== null) {
        const h = Object.entries(parsed)
          .filter(([k, v]) => k && v != null)
          .map(([k, v]) => `${k}=${v}`)
          .join('; ');
        if (!h) throw new Error('كائن الكوكيز لا يحتوي على عناصر صالحة');
        return h;
      }
    } catch (e) {
      if (e.message.includes('كوكيز')) throw e; // re-throw our own errors
      // Not valid JSON — fall through to raw-string
    }
  }

  // ── Raw cookie string (semicolon / newline / tab separated) ────────────────
  const pairs = str
    .split(/[;\n\r\t]+/)
    .map((s) => s.trim())
    .filter((s) => s.includes('='));

  if (!pairs.length) throw new Error('لم يتم العثور على كوكيز صالحة — تحقق من الصيغة (string, JSON array, أو JSON object)');

  return pairs
    .map((p) => {
      const eq = p.indexOf('=');
      const name  = p.slice(0, eq).trim();
      const value = p.slice(eq + 1);          // preserve raw value (may contain '=')
      return `${name}=${value}`;
    })
    .join('; ');
}

// ─── 2. Extract values from a cookie header string ──────────────────────────

/**
 * Pull known tokens/IDs directly from the cookie header string.
 * Does NOT make any HTTP request.
 *
 * @param {string} cookieStr — already-normalised "name=val; …" string
 * @returns {{ cUser, xs, fr, datr, fbDtsgCookie }}
 */
export function extractFromCookieStr(cookieStr) {
  const get = (name) => {
    const m = cookieStr.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
    return m ? decodeURIComponent(m[1].trim()) : null;
  };

  return {
    cUser:        get('c_user'),        // numeric user ID
    xs:           get('xs'),            // session token
    fr:           get('fr'),
    datr:         get('datr'),
    fbDtsgCookie: get('fb_dtsg'),       // sometimes present directly in cookies
  };
}

// ─── 3. Extract tokens from Facebook page HTML ──────────────────────────────

/**
 * Pull fb_dtsg, LSD, access token, and user ID from raw HTML of any FB page.
 *
 * @param {string} html
 * @returns {{ fbDtsg, lsd, accessToken, userId }}
 */
export function extractFromHtml(html) {
  if (!html) return { fbDtsg: null, lsd: null, accessToken: null, userId: null };

  // ── fb_dtsg ────────────────────────────────────────────────────────────────
  const fbDtsg = _first(html, [
    /DTSGInitialData[^}]*"token":"([^"]+)"/,
    /"dtsg":\{"token":"([^"]+)"/,
    /name="fb_dtsg"\s+value="([^"]+)"/,
    /"fb_dtsg","[^"]*","([^"]+)"/,
    /"token":"([^"]{8,60})"/,             // generic — last resort
  ], (v) => v && !v.startsWith('EAA'));

  // ── LSD ────────────────────────────────────────────────────────────────────
  const lsd = _first(html, [
    /"LSD",\[\d+\],\{"token":"([^"]+)"\}/,
    /"LSD",\[\d+\],\{token:"([^"]+)"\}/,
    /"lsd":"([^"]+)"/,
    /name="lsd"\s+value="([^"]+)"/,
  ]);

  // ── Access token (EAA…) ────────────────────────────────────────────────────
  const accessToken = _first(html, [
    /"accessToken":"(EAA[A-Za-z0-9]+)"/,
    /"token":"(EAA[A-Za-z0-9]+)"/,
    /(EAA[A-Za-z0-9]{60,})/,
  ]);

  // ── User ID ────────────────────────────────────────────────────────────────
  const userId = _first(html, [
    /"actorID":"(\d+)"/,
    /"userID":"(\d+)"/,
    /"USER_ID":"(\d+)"/,
    /"viewer_actor_id":"(\d+)"/,
    /"uid":(\d+)/,
  ]);

  // ── Business / BM ID ───────────────────────────────────────────────────────
  const bizId = _first(html, [
    /"business_id":"(\d+)"/,
    /"businessID":"(\d+)"/,
    /"current_business_id":"(\d+)"/,
  ]);

  return { fbDtsg, lsd, accessToken, userId, bizId };
}

/** Helper: try patterns in order, return first match that passes optional filter */
function _first(str, patterns, filter = null) {
  for (const p of patterns) {
    const m = str.match(p);
    if (m && m[1]) {
      const val = m[1].trim();
      if (!filter || filter(val)) return val;
    }
  }
  return null;
}

// ─── 4. Smart ad account ID extraction ──────────────────────────────────────

/**
 * Extract the numeric ad account ID from any input:
 *   - URL query params: act, act_, ad_account_id, account_id, asset_id, selected_campaign_ids
 *   - URL path segments: /act_123456/
 *   - Plain string: "act_123456", "act=123456", "123456789012"
 *
 * Returns the raw numeric string (without "act_" prefix), or null.
 *
 * @param {string} input
 * @returns {string|null}
 */
export function extractAdAccountId(input) {
  if (!input || typeof input !== 'string') return null;
  const str = input.trim();

  // ── Try as URL ─────────────────────────────────────────────────────────────
  try {
    const url = new URL(str.startsWith('http') ? str : `https://x.com/?${str}`);
    const params = url.searchParams;

    const candidates = [
      params.get('act'),
      params.get('act_id'),
      params.get('ad_account_id'),
      params.get('account_id'),
      params.get('asset_id'),
      params.get('business_id'),       // sometimes the same as act
      params.get('selected_campaign_ids'),
    ].filter(Boolean);

    for (const c of candidates) {
      const clean = c.replace(/^act_/i, '').replace(/[^0-9]/g, '');
      if (clean.length >= 8) return clean;
    }

    // Check path for act_XXXX pattern
    const pathMatch = url.pathname.match(/act[_=](\d{8,})/i);
    if (pathMatch) return pathMatch[1];
  } catch (_) {
    // Not a valid URL — continue to regex
  }

  // ── Regex patterns on raw string ───────────────────────────────────────────
  const patterns = [
    /act[_=](\d{8,})/i,        // act=123, act_123
    /asset[_=](\d{8,})/i,      // asset_id=123
    /account[_=](\d{8,})/i,    // account_id=123
    /^(\d{8,})$/,              // bare number
    /[^0-9](\d{10,})/,         // long number inside string
  ];

  for (const p of patterns) {
    const m = str.match(p);
    if (m) return m[1];
  }

  return null;
}

// ─── 5. Convenience: extract everything at once ──────────────────────────────

/**
 * Run all extractors on raw cookie input + optional HTML.
 * Returns a merged object with all known tokens.
 *
 * @param {string|Array|Object} cookieRaw — user-provided cookie (any format)
 * @param {string} [html]                 — FB page HTML (optional)
 * @returns {{ cookieHeader, cUser, xs, fbDtsg, lsd, accessToken, userId, error? }}
 */
export function extractAll(cookieRaw, html = '') {
  let cookieHeader;
  try {
    cookieHeader = buildCookieHeader(cookieRaw);
  } catch (e) {
    return { error: e.message };
  }

  const fromCookie = extractFromCookieStr(cookieHeader);
  const fromHtml   = extractFromHtml(html);

  return {
    cookieHeader,
    cUser:       fromCookie.cUser        || fromHtml.userId || null,
    xs:          fromCookie.xs           || null,
    fr:          fromCookie.fr           || null,
    datr:        fromCookie.datr         || null,
    fbDtsg:      fromCookie.fbDtsgCookie || fromHtml.fbDtsg || null,
    lsd:         fromHtml.lsd            || null,
    accessToken: fromHtml.accessToken    || null,
    userId:      fromHtml.userId         || fromCookie.cUser || null,
    bizId:       fromHtml.bizId          || null,
  };
}

// ─── 6. Standard Facebook fetch headers ─────────────────────────────────────

/**
 * Build a fetch options object pre-loaded with Facebook headers.
 *
 * @param {string} cookieHeader
 * @param {Object} [extra]        — merged into the returned options
 * @returns {Object}
 */
export function buildFbHeaders(cookieHeader, extra = {}) {
  return {
    method: 'GET',
    headers: {
      Cookie:           cookieHeader,
      'User-Agent':     'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Accept:           'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language':'ar,en-US;q=0.7,en;q=0.3',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Upgrade-Insecure-Requests': '1',
    },
    redirect: 'follow',
    ...extra,
  };
}

// ─── 7. Get a full Facebook/Business session ─────────────────────────────────

/**
 * Fetch a Facebook page, extract all session tokens, and return a ready-to-use
 * session object.  This is the single shared helper used by ALL tools that need
 * to make authenticated GraphQL calls.
 *
 * By default fetches `business.facebook.com/` (best source for bizId + dtsg).
 * Pass a different `url` if the tool needs tokens from another FB surface.
 *
 * @param {string|Array|Object} cookieRaw — user-provided cookies (any format)
 * @param {string} [url]                  — FB page to fetch (default: business.facebook.com)
 * @returns {{ dtsg, userId, bizId, cookieHeader, origin } | null}
 *   Returns null when cookies are invalid/expired (redirected to login).
 */
export async function getSession(cookieRaw, url = 'https://business.facebook.com/') {
  let cookieHeader;
  try {
    cookieHeader = buildCookieHeader(cookieRaw);
  } catch (_) {
    return null;
  }

  let res, html;
  try {
    res  = await fetch(url, {
      headers: {
        cookie: cookieHeader,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ar,en-US;q=0.7',
      },
      redirect: 'follow',
    });
    html = await res.text();
  } catch (_) {
    return null;
  }

  // Login / checkpoint redirect → cookies expired or account blocked
  if (res.url.includes('login') || res.url.includes('checkpoint')) return null;

  const { fbDtsg, userId, bizId } = extractFromHtml(html);
  // Also pull userId from cookies as fallback
  const cUser = extractFromCookieStr(cookieHeader).cUser;

  const resolvedUserId = userId || cUser;
  if (!fbDtsg || !resolvedUserId) return null;

  const origin = new URL(res.url).origin; // e.g. "https://business.facebook.com"
  return { dtsg: fbDtsg, userId: resolvedUserId, bizId: bizId || null, cookieHeader, origin };
}

// ─── 8. Fetch a Facebook page and extract all tokens ─────────────────────────

/**
 * Fetch a Facebook page with the user's cookies and extract all tokens from it.
 *
 * @param {string} cookieHeader — normalised cookie header
 * @param {string} url          — Facebook URL to fetch (default: ads manager)
 * @param {Object} [opts]
 * @param {string} [opts.method]    — HTTP method (default: 'GET')
 * @param {Object} [opts.extraHeaders] — additional headers
 * @returns {{ ok, finalUrl, name, ...extractAll result, rawHtml?, error? }}
 */
export async function fetchAndExtract(cookieHeader, url = 'https://www.facebook.com/ads/manager/', opts = {}) {
  const { method = 'GET', extraHeaders = {} } = opts;

  const fetchOpts = {
    ...buildFbHeaders(cookieHeader),
    method,
    headers: {
      ...buildFbHeaders(cookieHeader).headers,
      ...extraHeaders,
    },
  };

  let resp, html;
  try {
    resp = await fetch(url, fetchOpts);
    html = await resp.text();
  } catch (e) {
    return { ok: false, error: `خطأ في الاتصال: ${e.message.slice(0, 120)}` };
  }

  // Login redirect = invalid/expired cookies
  if (resp.url.includes('login') || resp.url.includes('checkpoint')) {
    return { ok: false, error: 'كوكيز منتهية أو الحساب محظور — حدّث الكوكيز وحاول مجدداً', finalUrl: resp.url };
  }

  const tokens = extractAll(cookieHeader, html);

  // Extract page title as name
  const titleMatch = html.match(/<title>([^<]+)<\/title>/);
  const name = titleMatch
    ? titleMatch[1].replace(/\s*[\|\-–]\s*facebook/gi, '').replace(/facebook/gi, '').trim()
    : null;

  return {
    ok: true,
    finalUrl: resp.url,
    name,
    ...tokens,
  };
}
