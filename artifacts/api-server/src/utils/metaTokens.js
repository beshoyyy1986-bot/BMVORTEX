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
 *   extractAdAccountId(input)        — smart ID from link, act_/asset_id/account_id param, or bare number
 *   extractBusinessId(input)         — smart Business/BM ID from link, business_id/bid/bm_id param, or bare number
 *   extractAll(cookieRaw, html?)     — convenience: run everything in one call
 *   buildFbHeaders(cookieHeader, x)  — standard Facebook fetch headers
 *   fetchAndExtract(cookieHeader, url, opts?) — fetch a FB page + extractAll
 *   getSession(cookieRaw, url?)      — HTTP fetch first, auto-falls back to a real
 *                                       headless browser (Playwright) when FB blocks/redirects
 *                                       the plain request. Returns {dtsg,userId,bizId,cookieHeader,origin,viaBrowser?}
 *   getSessionViaBrowser(cookieRaw, url?) — force the Playwright path directly
 *   cookiesToPlaywrightArray(raw)    — any cookie format → Playwright context.addCookies() array
 *
 * ID EXTRACTION — used by every tool that accepts a business ID or ad account ID:
 * the user may paste a raw numeric ID, an ID with the "act_" prefix, or a full
 * Facebook/Business-Manager URL containing the ID under ANY of several possible
 * query param names (act, act_id, ad_account_id, account_id, asset_id, aaid for
 * ad accounts; business_id, biz_id, bid, bm_id for businesses). Both extractors
 * share the same underlying `_extractId` logic so behavior is identical everywhere.
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
 * Shared ID-extraction engine used by extractAdAccountId() and extractBusinessId().
 *
 * Accepts a bare numeric ID, an ID with `bareprefixes` (e.g. "act_123…"), or a
 * full URL/query-string containing the ID under one of `paramNames`.
 *
 * @param {string} input
 * @param {{ paramNames: string[], bareprefixes?: string[], minLen?: number }} cfg
 * @returns {string|null}
 */
function _extractId(input, { paramNames, bareprefixes = [], minLen = 8 }) {
  if (!input || typeof input !== 'string') return null;
  const str = input.trim();

  // ── Bare numeric ID — most common case (user pastes just the ID) ───────────
  if (new RegExp(`^\\d{${minLen},}$`).test(str)) return str;

  // ── ID with a known bare prefix, no surrounding URL (e.g. "act_123456789") ─
  for (const prefix of bareprefixes) {
    const m = str.match(new RegExp(`^${prefix}[_=]?(\\d{${minLen},})$`, 'i'));
    if (m) return m[1];
  }

  // ── Try as URL / query string ───────────────────────────────────────────────
  try {
    const url = new URL(str.startsWith('http') ? str : `https://x.com/?${str}`);
    const params = url.searchParams;

    for (const name of paramNames) {
      const v = params.get(name);
      if (!v) continue;
      const clean = v.replace(/^act_/i, '').replace(/[^0-9]/g, '');
      if (clean.length >= minLen) return clean;
    }

    // Check path segments, e.g. /act_123456/, /business/123456/
    for (const prefix of bareprefixes) {
      const pathMatch = url.pathname.match(new RegExp(`${prefix}[_=]?(\\d{${minLen},})`, 'i'));
      if (pathMatch) return pathMatch[1];
    }
  } catch (_) {
    // Not a valid URL — continue to regex fallback
  }

  // ── Regex fallback on the raw string (covers malformed/partial URLs) ───────
  for (const name of paramNames) {
    const m = str.match(new RegExp(`${name}[_=](\\d{${minLen},})`, 'i'));
    if (m) return m[1];
  }
  for (const prefix of bareprefixes) {
    const m = str.match(new RegExp(`${prefix}[_=]?(\\d{${minLen},})`, 'i'));
    if (m) return m[1];
  }

  // ── Last resort: any sufficiently long number embedded in the string ───────
  const m = str.match(new RegExp(`(\\d{${minLen + 2},})`));
  return m ? m[1] : null;
}

/**
 * Extract a numeric Ad Account ID from ANY input the user might paste:
 *   - Bare number:     "1234567890"
 *   - "act_" form:     "act_1234567890"
 *   - Full FB/BM URL with the ID under act, act_id, ad_account_id, account_id,
 *     asset_id, or aaid — not always "act=", so all known param names are tried.
 *
 * Returns the raw numeric string (without "act_" prefix), or null.
 *
 * @param {string} input
 * @returns {string|null}
 */
export function extractAdAccountId(input) {
  return _extractId(input, {
    paramNames:    ['act', 'act_id', 'ad_account_id', 'account_id', 'asset_id', 'aaid', 'selected_campaign_ids'],
    bareprefixes:  ['act'],
    minLen: 8,
  });
}

/**
 * Extract a numeric Business Manager (BM) ID from ANY input the user might paste:
 *   - Bare number:     "1234567890"
 *   - Full FB/BM URL with the ID under business_id, biz_id, bid, or bm_id.
 *
 * @param {string} input
 * @returns {string|null}
 */
export function extractBusinessId(input) {
  return _extractId(input, {
    paramNames: ['business_id', 'biz_id', 'bid', 'bm_id'],
    minLen: 8,
  });
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
  // ── Fast path: plain HTTP fetch (no browser overhead) ───────────────────────
  const fast = await _getSessionViaFetch(cookieRaw, url);
  if (fast) return fast;

  // ── Strong fallback: real headless browser via Playwright ──────────────────
  // Facebook sometimes blocks/redirects plain fetch() requests (bot detection,
  // JS-rendered token pages, checkpoint interstitials) that a real browser
  // sails through because it executes JS and looks like a genuine session.
  return getSessionViaBrowser(cookieRaw, url);
}

/** Internal: fast HTTP-only session fetch (no browser). Returns null on any failure. */
async function _getSessionViaFetch(cookieRaw, url) {
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
  const cUser = extractFromCookieStr(cookieHeader).cUser;

  const resolvedUserId = userId || cUser;
  if (!fbDtsg || !resolvedUserId) return null;

  const origin = new URL(res.url).origin; // e.g. "https://business.facebook.com"
  return { dtsg: fbDtsg, userId: resolvedUserId, bizId: bizId || null, cookieHeader, origin };
}

/**
 * Force-fetch a Facebook session through a real headless browser (Playwright).
 * Loads the page with the user's cookies injected into a fresh browser context,
 * lets it fully render (networkidle), then extracts fb_dtsg/userId/bizId from
 * the rendered HTML — far more resilient than a raw fetch() against anti-bot
 * checks, redirects, and JS-only token placement.
 *
 * Returns null (never throws) when Playwright is unavailable, cookies are
 * invalid/expired, or the required tokens still can't be found.
 *
 * @param {string|Array|Object} cookieRaw
 * @param {string} [url]
 * @returns {Promise<{dtsg,userId,bizId,cookieHeader,origin,viaBrowser:true}|null>}
 */
export async function getSessionViaBrowser(cookieRaw, url = 'https://business.facebook.com/') {
  const cookieArray = cookiesToPlaywrightArray(cookieRaw);
  if (!cookieArray.length) return null;

  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch (_) {
    return null; // Playwright not installed in this environment
  }

  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled', '--disable-gpu',
        '--window-size=1366,768',
      ],
    });

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      locale: 'ar-EG',
      viewport: { width: 1366, height: 768 },
    });
    await context.addCookies(cookieArray);

    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 })
      .catch(() => page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20_000 }));
    await page.waitForTimeout(1000); // let late-injected DTSG/lsd scripts settle

    const finalUrl = page.url();
    if (finalUrl.includes('login') || finalUrl.includes('checkpoint')) {
      await browser.close();
      return null;
    }

    const html = await page.content();
    const cookieHeader = cookieArray.map((c) => `${c.name}=${c.value}`).join('; ');
    const { fbDtsg, userId, bizId } = extractFromHtml(html);
    const cUser = extractFromCookieStr(cookieHeader).cUser;
    await browser.close();

    const resolvedUserId = userId || cUser;
    if (!fbDtsg || !resolvedUserId) return null;

    const origin = new URL(finalUrl).origin;
    return { dtsg: fbDtsg, userId: resolvedUserId, bizId: bizId || null, cookieHeader, origin, viaBrowser: true };
  } catch (_) {
    if (browser) await browser.close().catch(() => {});
    return null;
  }
}

// ─── 8. Cookies → Playwright context.addCookies() array ─────────────────────

/**
 * Convert cookies in ANY format (raw string, JSON array, JSON object) into the
 * array-of-objects shape Playwright's `context.addCookies()` expects.
 * Shared by any tool that drives a real browser instead of raw HTTP calls.
 *
 * @param {string|Array|Object} raw
 * @returns {Array<{name:string,value:string,domain:string,path:string}>}
 */
export function cookiesToPlaywrightArray(raw) {
  if (!raw) return [];

  const toEntries = (parsed) => {
    if (Array.isArray(parsed)) {
      return parsed
        .filter((c) => c && c.name && c.value != null)
        .map((c) => ({ name: c.name, value: String(c.value), domain: c.domain || '.facebook.com', path: c.path || '/' }));
    }
    if (typeof parsed === 'object' && parsed !== null) {
      return Object.entries(parsed)
        .filter(([k, v]) => k && v != null)
        .map(([k, v]) => ({ name: k, value: String(v), domain: '.facebook.com', path: '/' }));
    }
    return null;
  };

  if (typeof raw !== 'string') {
    const entries = toEntries(raw);
    if (entries) return entries;
  }

  const str = typeof raw === 'string' ? raw.trim() : '';
  if (str.startsWith('[') || str.startsWith('{')) {
    try {
      const entries = toEntries(JSON.parse(str));
      if (entries) return entries;
    } catch (_) {
      // fall through to raw-string parsing
    }
  }

  return str
    .split(/[;\n\r\t]+/)
    .map((s) => s.trim())
    .filter((s) => s.includes('='))
    .map((p) => {
      const eq = p.indexOf('=');
      return { name: p.slice(0, eq).trim(), value: p.slice(eq + 1), domain: '.facebook.com', path: '/' };
    });
}

// ─── 9. Fetch a Facebook page and extract all tokens ─────────────────────────

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

  let resp, html, connectionFailed = false;
  try {
    resp = await fetch(url, fetchOpts);
    html = await resp.text();
  } catch (e) {
    connectionFailed = true;
  }

  // Login redirect / connection failure → try the strong Playwright fallback
  // before giving up, since Facebook sometimes blocks plain fetch() requests
  // that a real rendered browser session handles fine.
  if (connectionFailed || resp.url.includes('login') || resp.url.includes('checkpoint')) {
    const viaBrowser = await getSessionViaBrowser(cookieHeader, url);
    if (viaBrowser) {
      return {
        ok: true,
        finalUrl: viaBrowser.origin,
        name: null,
        cookieHeader: viaBrowser.cookieHeader,
        cUser: viaBrowser.userId,
        fbDtsg: viaBrowser.dtsg,
        userId: viaBrowser.userId,
        bizId: viaBrowser.bizId,
        viaBrowser: true,
      };
    }
    return connectionFailed
      ? { ok: false, error: 'خطأ في الاتصال بفيسبوك' }
      : { ok: false, error: 'كوكيز منتهية أو الحساب محظور — حدّث الكوكيز وحاول مجدداً', finalUrl: resp.url };
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
