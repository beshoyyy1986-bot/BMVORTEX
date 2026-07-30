/**
 * metaTokens.js — Unified Meta (Facebook + Instagram) token & cookie extraction
 *
 * Single source of truth for ALL tools (server routes, extract API, UI).
 *
 * getSession priority (strongest first):
 *   1. Playwright headless browser  -- PRIMARY (background)
 *   2. Multi-URL HTTP HTML regex
 *   3. Cookie-only dtsg / c_user
 *   4. Deep script-block parse
 *
 * Exports:
 *   buildCookieHeader, extractFromCookieStr, extractFromHtml,
 *   extractAdAccountId, extractBusinessId, extractAll,
 *   buildFbHeaders, cookiesToPlaywrightArray,
 *   getSession, getSessionViaBrowser, fetchAndExtract,
 *   detectPlatform, extractFbDtsg, extractLsd, extractAccessToken, extractUserId
 */

import { ProxyAgent } from 'undici';
import {
  extractWithPlaywright,
  isPlaywrightAvailable,
  captureSessionWithPlaywright,
  cookieHeaderToPlaywrightCookies,
} from './playwrightSession.js';

const FB_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// ─── 1. Cookie header builder ───────────────────────────────────────────────

/**
 * Convert cookies in ANY format → "name=value; name=value; …"
 * Accepts: raw string | JSON array (EditThisCookie/Playwright) | JSON object
 */
export function buildCookieHeader(raw) {
  if (!raw) throw new Error('الكوكيز فارغة');

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
      if (e.message && e.message.includes('كوكيز')) throw e;
    }
  }

  const pairs = str
    .split(/[;\n\r\t]+/)
    .map((s) => s.trim())
    .filter((s) => s.includes('='));

  if (!pairs.length) {
    throw new Error('لم يتم العثور على كوكيز صالحة — تحقق من الصيغة (string, JSON array, أو JSON object)');
  }

  return pairs
    .map((p) => {
      const eq = p.indexOf('=');
      return `${p.slice(0, eq).trim()}=${p.slice(eq + 1)}`;
    })
    .join('; ');
}

// ─── 2. Platform detection ──────────────────────────────────────────────────

export function detectPlatform(cookieHeader) {
  if (!cookieHeader) return 'facebook';
  const s = String(cookieHeader);
  const hasIg =
    s.includes('ds_user_id=') ||
    s.includes('sessionid=') ||
    /instagram\.com/i.test(s) ||
    s.includes('ig_did=') ||
    s.includes('csrftoken=');
  const hasFb = s.includes('c_user=') || s.includes('xs=') || /facebook\.com/i.test(s);

  // Prefer facebook for Meta Business tools when both present
  if (hasFb) return 'facebook';
  if (hasIg) return 'instagram';
  if (s.includes('.threads.net')) return 'threads';
  return 'facebook';
}

export function getPlatformUrl(platform) {
  const urls = {
    facebook: 'https://business.facebook.com/',
    instagram: 'https://www.instagram.com/',
    threads: 'https://www.threads.net/',
  };
  return urls[platform] || urls.facebook;
}

// ─── 3. Extract from cookie string ──────────────────────────────────────────

export function extractFromCookieStr(cookieStr) {
  const get = (name) => {
    const m = String(cookieStr || '').match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
    if (!m) return null;
    try {
      return decodeURIComponent(m[1].trim());
    } catch {
      return m[1].trim();
    }
  };

  return {
    cUser: get('c_user'),
    xs: get('xs'),
    fr: get('fr'),
    datr: get('datr'),
    fbDtsgCookie: get('fb_dtsg') || get('dtsg_ag') || get('dtsg'),
    igUserId: get('ds_user_id'),
    sessionid: get('sessionid'),
    csrfToken: get('csrftoken'),
  };
}

// ─── 4. Extract from HTML ───────────────────────────────────────────────────

function _first(str, patterns, filter = null) {
  if (!str) return null;
  for (const p of patterns) {
    const m = str.match(p);
    if (m?.[1]) {
      const val = m[1].trim();
      if (!filter || filter(val)) return val;
    }
  }
  return null;
}

export function extractFromHtml(html) {
  if (!html) {
    return { fbDtsg: null, lsd: null, accessToken: null, userId: null, bizId: null, igUserId: null };
  }

  const notEaa = (v) => v && !v.startsWith('EAA');

  // ── fbDtsg ── من الأعلى confidence للأقل
  const fbDtsg = _first(
    html,
    [
      // 1) DTSGInitialData structure الأوضح — أعلى confidence
      /DTSGInitialData[^}]{0,300}"token"\s*:\s*"([^"]{8,100})"/,
      /"DTSGInitialData"[^}]{0,300}"token"\s*:\s*"([^"]{8,100})"/,
      // 2) dtsg object مباشر
      /"dtsg"\s*:\s*\{\s*"token"\s*:\s*"([^"]+)"/,
      // 3) HTML form field
      /name="fb_dtsg"\s+value="([^"]+)"/,
      /name="fb_dtsg"\s+value='([^']+)'/,
      // 4) Relay store / server data
      /"fb_dtsg"\s*,\s*"[^"]*"\s*,\s*"([^"]+)"/,
      /"s"\s*:\s*"fb_dtsg"\s*,\s*"v"\s*:\s*"([^"]+)"/,
      // 5) prefixes معروفة — شاملة
      /"token"\s*:\s*"(NAf[A-Za-z0-9_-]+)"/,
      /"token"\s*:\s*"(NACP[A-Za-z0-9_-]+)"/,
      /"token"\s*:\s*"(NAfw[A-Za-z0-9_-]+)"/,
      /"token"\s*:\s*"(NAcP[A-Za-z0-9_-]+)"/,
      /"token"\s*:\s*"(NAbb[A-Za-z0-9_-]+)"/,
      // 6) مفتاح مباشر
      /"fb_dtsg"\s*:\s*"([A-Za-z0-9_-]{8,})"/,
      // 7) global variable
      /__DTSG\s*=\s*['"]([A-Za-z0-9_-]+)['"]/,
      // 8) fallback فضفاض — آخر ملجأ
      /"token"\s*:\s*"([A-Za-z0-9_-]{12,80})"/,
    ],
    notEaa
  );

  // ── lsd ──
  const lsd = _first(html, [
    /"LSD",\[\d+\],\{"token":"([^"]+)"\}/,
    /"LSD",\[\d+\],\{token:"([^"]+)"\}/,
    /"lsd"\s*:\s*"([^"]+)"/,
    /name="lsd"\s+value="([^"]+)"/,
    /"lsdToken"\s*:\s*"([^"]+)"/,
    // relay store array format
    /\["LSD",[^\]]*,"([A-Za-z0-9_-]{4,20})"\]/,
  ]);

  // ── accessToken — context-aware أولاً ──
  const accessToken = _first(html, [
    /"accessToken"\s*:\s*"(EAA[A-Za-z0-9]+)"/,
    /"access_token"\s*:\s*"(EAA[A-Za-z0-9]+)"/,
    /"act_access_token"\s*:\s*"(EAA[A-Za-z0-9]+)"/,
    /"token"\s*:\s*"(EAA[A-Za-z0-9]{40,})"/,
    // bare match — آخر ملجأ بطول أكبر لتقليل false positives
    /(EAA[Bb][A-Za-z0-9]{60,})/,
    /(EAAG[A-Za-z0-9]{60,})/,
  ]);

  // ── userId — يشمل uid كـ string وكـ number ──
  const userId = _first(html, [
    /"actorID"\s*:\s*"(\d{6,})"/,
    /"userID"\s*:\s*"(\d{6,})"/,
    /"USER_ID"\s*:\s*"(\d{6,})"/,
    /"viewer_actor_id"\s*:\s*"(\d{6,})"/,
    // uid بدون quotes (JSON number)
    /"uid"\s*:\s*(\d{6,})/,
    // uid بـ quotes (JSON string) — كان مفقوداً
    /"uid"\s*:\s*"(\d{6,})"/,
    // viewer / profile_owner contexts
    /"profile_owner"\s*:\s*\{[^}]{0,200}"id"\s*:\s*"(\d{6,})"/,
    /"viewer"\s*:\s*\{[^}]{0,200}"id"\s*:\s*"(\d{6,})"/,
  ]);

  // ── bizId — شامل Business Suite params ──
  const bizId = _first(html, [
    /"business_id"\s*:\s*"(\d{6,})"/,
    /"businessID"\s*:\s*"(\d{6,})"/,
    /"current_business_id"\s*:\s*"(\d{6,})"/,
    /"biz_id"\s*:\s*"(\d{6,})"/,
    /"selectedBusinessId"\s*:\s*"(\d{6,})"/,
    /[?&]business_id=(\d{6,})/,
  ]);

  // ── igUserId ──
  const igUserId = _first(html, [
    /"viewerId"\s*:\s*"(\d{6,})"/,
    /"ids"\s*:\s*\{\s*"(\d{6,})"/,
    /"ds_user_id"\s*:\s*"(\d{6,})"/,
    /"userId"\s*:\s*(\d{6,})/,
  ]);

  return { fbDtsg, lsd, accessToken, userId, bizId, igUserId };
}

// Compat aliases used by older routes
export function extractFbDtsg(html) {
  return extractFromHtml(html).fbDtsg;
}

export function extractLsd(html) {
  return extractFromHtml(html).lsd;
}

export function extractAccessToken(html) {
  return extractFromHtml(html).accessToken;
}

export function extractUserId(cookieHeader) {
  return extractFromCookieStr(cookieHeader).cUser;
}

export function extractFbDtsgFromCookies(cookieHeader) {
  return extractFromCookieStr(cookieHeader).fbDtsgCookie;
}

export function extractFromAllScripts(html) {
  if (!html) return null;
  const scriptBlocks = html.match(/<script[^>]*>([\s\S]*?)<\/script>/gi);
  if (scriptBlocks) {
    const allText = scriptBlocks
      .map((s) => {
        const m = s.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
        return m ? m[1] : '';
      })
      .join('\n');
    const fromScripts = extractFbDtsg(allText);
    if (fromScripts) return fromScripts;
  }
  return extractFbDtsg(html);
}

// ─── 5. Smart ID extraction ─────────────────────────────────────────────────

function _extractId(input, { paramNames, bareprefixes = [], minLen = 6 }) {
  if (!input || typeof input !== 'string') return null;
  const str = input.trim();

  if (new RegExp(`^\\d{${minLen},}$`).test(str)) return str;

  for (const prefix of bareprefixes) {
    const m = str.match(new RegExp(`^${prefix}[_=]?(\\d{${minLen},})$`, 'i'));
    if (m) return m[1];
  }

  try {
    const url = new URL(str.startsWith('http') ? str : `https://x.com/?${str}`);
    const params = url.searchParams;
    for (const name of paramNames) {
      const v = params.get(name);
      if (!v) continue;
      const clean = v.replace(/^act_/i, '').replace(/[^0-9]/g, '');
      if (clean.length >= minLen) return clean;
    }
    for (const prefix of bareprefixes) {
      const pathMatch = url.pathname.match(new RegExp(`${prefix}[_=]?(\\d{${minLen},})`, 'i'));
      if (pathMatch) return pathMatch[1];
    }
  } catch (_) {}

  for (const name of paramNames) {
    const m = str.match(new RegExp(`${name}[_=](\\d{${minLen},})`, 'i'));
    if (m) return m[1];
  }
  for (const prefix of bareprefixes) {
    const m = str.match(new RegExp(`${prefix}[_=]?(\\d{${minLen},})`, 'i'));
    if (m) return m[1];
  }

  const m = str.match(new RegExp(`(\\d{${Math.max(minLen, 8)},})`));
  return m ? m[1] : null;
}

export function extractAdAccountId(input) {
  return _extractId(input, {
    paramNames: [
      'act',
      'act_id',
      'ad_account_id',
      'account_id',
      'asset_id',
      'aaid',
      'payment_account_id',
      'selected_campaign_ids',
      'selectedAdAccountId',
      'adAccountId',
    ],
    bareprefixes: ['act'],
    minLen: 6,
  });
}

export function extractBusinessId(input) {
  if (!input) return null;
  if (typeof input !== 'string') return null;

  // HTML / JSON patterns أولاً
  const fromHtml =
    input.match(/"business_id"\s*:\s*"(\d{6,})"/) ||
    input.match(/"biz_id"\s*:\s*"(\d{6,})"/) ||
    input.match(/"selectedBusinessId"\s*:\s*"(\d{6,})"/) ||
    input.match(/[?&]business_id=(\d{6,})/);

  if (fromHtml) return fromHtml[1];

  return _extractId(input, {
    paramNames: ['business_id', 'biz_id', 'bid', 'bm_id', 'businessId'],
    minLen: 6,
  });
}

/** @deprecated prefer extractAdAccountId */
export function extractActId(input) {
  return extractAdAccountId(input) || (/^\d+$/.test(String(input || '').trim()) ? String(input).trim() : null);
}

export function extractPageId(input) {
  if (!input) return null;
  for (const rx of [/profile\.php\?id=(\d+)/, /\/pages\/[^/]+\/(\d+)/, /[?&]page_id=(\d+)/]) {
    const m = String(input).match(rx);
    if (m) return m[1];
  }
  if (/^\d+$/.test(String(input).trim())) return String(input).trim();
  return null;
}

// ─── 6. extractAll convenience ──────────────────────────────────────────────

export function extractAll(cookieRaw, html = '') {
  let cookieHeader;
  try {
    cookieHeader = buildCookieHeader(cookieRaw);
  } catch (e) {
    return { error: e.message };
  }

  const fromCookie = extractFromCookieStr(cookieHeader);
  const fromHtml = extractFromHtml(html);

  return {
    cookieHeader,
    cUser: fromCookie.cUser || fromHtml.userId || null,
    xs: fromCookie.xs || null,
    fr: fromCookie.fr || null,
    datr: fromCookie.datr || null,
    fbDtsg: fromCookie.fbDtsgCookie || fromHtml.fbDtsg || null,
    lsd: fromHtml.lsd || null,
    accessToken: fromHtml.accessToken || null,
    userId: fromHtml.userId || fromCookie.cUser || fromCookie.igUserId || null,
    bizId: fromHtml.bizId || null,
    igUserId: fromCookie.igUserId || fromHtml.igUserId || null,
    platform: detectPlatform(cookieHeader),
  };
}

// ─── 7. HTTP helpers ────────────────────────────────────────────────────────

export function buildFbHeaders(cookieHeader, extra = {}) {
  return {
    method: 'GET',
    headers: {
      Cookie: cookieHeader,
      'User-Agent': FB_UA,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'ar,en-US;q=0.7,en;q=0.3',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Upgrade-Insecure-Requests': '1',
    },
    redirect: 'follow',
    ...extra,
  };
}

export function fbFetchOpts(cookieHeader, extra = {}) {
  return buildFbHeaders(cookieHeader, extra);
}

export function graphqlHeaders(cookieHeader, lsd = '') {
  return {
    Cookie: cookieHeader,
    'Content-Type': 'application/x-www-form-urlencoded',
    'X-FB-LSD': lsd,
    'User-Agent': FB_UA,
  };
}

export function graphqlBody(params) {
  return new URLSearchParams(params).toString();
}

export function fbFetch(url, cookieHeader, extra = {}) {
  const { proxy, ...rest } = extra;
  const opts = buildFbHeaders(cookieHeader, rest);
  if (proxy) {
    opts.dispatcher = new ProxyAgent(proxy);
  }
  return fetch(url, opts);
}

// ─── 8. Cookies → Playwright array ──────────────────────────────────────────

export function cookiesToPlaywrightArray(raw) {
  if (!raw) return [];
  try {
    const header = typeof raw === 'string' && !raw.trim().startsWith('[') && !raw.trim().startsWith('{')
      ? (raw.includes('=') ? raw : buildCookieHeader(raw))
      : buildCookieHeader(raw);
    return cookieHeaderToPlaywrightCookies(header);
  } catch {
    // Best-effort raw string parse
    if (typeof raw === 'string') return cookieHeaderToPlaywrightCookies(raw);
    if (Array.isArray(raw)) {
      return raw
        .filter((c) => c?.name && c.value != null)
        .map((c) => ({
          name: c.name,
          value: String(c.value),
          domain: c.domain || '.facebook.com',
          path: c.path || '/',
        }));
    }
    return [];
  }
}

// ─── 9. Session extraction — Playwright PRIMARY ─────────────────────────────

/**
 * Force Playwright path (background headless).
 */
export async function getSessionViaBrowser(cookieRaw, url, proxy) {
  let cookieHeader;
  try {
    cookieHeader = buildCookieHeader(cookieRaw);
  } catch {
    return null;
  }

  const platform = detectPlatform(cookieHeader);
  const target = url || getPlatformUrl(platform);

  if (!(await isPlaywrightAvailable())) return null;

  const result = await extractWithPlaywright(cookieHeader, target, proxy, { platform });
  if (!result) return null;

  const fromCookie = extractFromCookieStr(cookieHeader);
  const userId = result.userId || fromCookie.cUser || fromCookie.igUserId || null;
  if (!result.dtsg && !result.accessToken) return null;

  return {
    dtsg: result.dtsg,
    lsd: result.lsd || '',
    accessToken: result.accessToken || null,
    userId,
    bizId: result.bizId || null,
    igUserId: result.igUserId || fromCookie.igUserId || null,
    cookieHeader,
    origin: result.origin || 'https://business.facebook.com',
    platform,
    viaBrowser: true,
    strategy: result.strategy || 'playwright',
    html: result.html || '',
  };
}

/** HTTP multi-URL fallback (no browser) */
async function _getSessionViaFetch(cookieHeader, url, timeoutMs = 20000, proxy) {
  const platform = detectPlatform(cookieHeader);
  const urls = [
    url || getPlatformUrl(platform),
    'https://business.facebook.com/',
    'https://www.facebook.com/',
    'https://www.facebook.com/adsmanager/manage/campaigns',
    'https://adsmanager.facebook.com/adsmanager/',
    platform === 'instagram' ? 'https://www.instagram.com/' : null,
  ].filter(Boolean);

  for (const attemptUrl of [...new Set(urls)]) {
    try {
      const res = await fbFetch(attemptUrl, cookieHeader, {
        signal: AbortSignal.timeout(timeoutMs),
        proxy,
      });
      if (res.url.includes('login') || res.url.includes('checkpoint')) continue;
      const html = await res.text();
      const fromHtml = extractFromHtml(html);
      const deep = extractFromAllScripts(html);
      const dtsg = fromHtml.fbDtsg || deep;
      if (!dtsg) continue;

      const fromCookie = extractFromCookieStr(cookieHeader);
      return {
        dtsg,
        lsd: fromHtml.lsd || '',
        accessToken: fromHtml.accessToken || null,
        userId: fromHtml.userId || fromCookie.cUser || fromCookie.igUserId,
        bizId: fromHtml.bizId || null,
        igUserId: fromHtml.igUserId || fromCookie.igUserId || null,
        cookieHeader,
        origin: new URL(res.url).origin,
        platform,
        viaBrowser: false,
        strategy: 'html_regex',
        html,
      };
    } catch {
      continue;
    }
  }

  // Cookie-only last resort (weak — no lsd)
  const fromCookie = extractFromCookieStr(cookieHeader);
  if (fromCookie.fbDtsgCookie && (fromCookie.cUser || fromCookie.igUserId)) {
    return {
      dtsg: fromCookie.fbDtsgCookie,
      lsd: '',
      accessToken: null,
      userId: fromCookie.cUser || fromCookie.igUserId,
      bizId: null,
      igUserId: fromCookie.igUserId,
      cookieHeader,
      origin: getPlatformUrl(platform).replace(/\/$/, ''),
      platform,
      viaBrowser: false,
      strategy: 'cookie_dtsg',
      html: '',
    };
  }

  return null;
}

/**
 * getSession — PRIMARY entry for ALL tools.
 *
 * Order:
 *   1) Playwright headless (background) — strongest
 *   2) Multi-URL HTTP HTML extraction
 *   3) Cookie-only tokens
 *
 * @param {string|Array|Object} cookieRaw
 * @param {string} [url]
 * @param {number} [timeoutMs]
 * @param {string} [proxy]
 */
export async function getSession(cookieRaw, url, timeoutMs = 20000, proxy) {
  let cookieHeader;
  try {
    cookieHeader = buildCookieHeader(cookieRaw);
  } catch {
    return null;
  }

  const platform = detectPlatform(cookieHeader);
  const target = typeof url === 'string' && url ? url : getPlatformUrl(platform);

  // 1) Playwright PRIMARY (background headless)
  if (await isPlaywrightAvailable()) {
    try {
      const viaPw = await getSessionViaBrowser(cookieHeader, target, proxy);
      if (viaPw?.dtsg) return viaPw;
      // If only accessToken without dtsg, still useful for Graph API tools
      if (viaPw?.accessToken) return viaPw;
    } catch (_) {}
  }

  // 2) HTTP multi-strategy fallback
  try {
    const viaFetch = await _getSessionViaFetch(cookieHeader, target, timeoutMs, proxy);
    if (viaFetch?.dtsg || viaFetch?.accessToken) return viaFetch;
  } catch (_) {}

  return null;
}

/**
 * Deep multi-strategy extract (compat name used by older code).
 */
export async function extractTokensDeep(cookieHeaderOrRaw, url, timeoutMs = 20000, proxy) {
  const session = await getSession(cookieHeaderOrRaw, url, timeoutMs, proxy);
  if (!session) return null;
  return {
    dtsg: session.dtsg,
    lsd: session.lsd || '',
    accessToken: session.accessToken || null,
    userId: session.userId,
    bizId: session.bizId,
    platform: session.platform,
    strategy: session.strategy,
    html: session.html || null,
    origin: session.origin,
  };
}

// ─── 10. fetchAndExtract ────────────────────────────────────────────────────

export async function fetchAndExtract(cookieHeaderOrRaw, url = 'https://www.facebook.com/ads/manager/', opts = {}) {
  const { proxy } = opts;
  let cookieHeader;
  try {
    cookieHeader =
      typeof cookieHeaderOrRaw === 'string' && cookieHeaderOrRaw.includes('=') && !cookieHeaderOrRaw.trim().startsWith('[')
        ? cookieHeaderOrRaw
        : buildCookieHeader(cookieHeaderOrRaw);
  } catch (e) {
    return { ok: false, error: e.message };
  }

  // Prefer full getSession (Playwright-first)
  const session = await getSession(cookieHeader, url, 25000, proxy);
  if (session?.dtsg || session?.accessToken) {
    let name = null;
    if (session.html) {
      const titleMatch = session.html.match(/<title>([^<]+)<\/title>/i);
      name = titleMatch
        ? titleMatch[1].replace(/\s*[|\-–]\s*facebook/gi, '').replace(/facebook/gi, '').trim()
        : null;
    }
    const tokens = extractAll(cookieHeader, session.html || '');
    return {
      ok: true,
      finalUrl: session.origin,
      name,
      cookieHeader: session.cookieHeader || cookieHeader,
      cUser: session.userId,
      fbDtsg: session.dtsg,
      lsd: session.lsd || tokens.lsd,
      accessToken: session.accessToken || tokens.accessToken,
      userId: session.userId,
      bizId: session.bizId,
      platform: session.platform,
      strategy: session.strategy,
      viaBrowser: !!session.viaBrowser,
    };
  }

  return {
    ok: false,
    error: 'تعذر استخراج التوكن — الكوكيز منتهية أو الحساب محظور أو Playwright غير متاح',
  };
}

export { captureSessionWithPlaywright, isPlaywrightAvailable };
