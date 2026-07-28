/**
 * cookieParser.js — backward-compat re-export
 *
 * All logic has moved to metaTokens.js.
 * Existing imports of this file continue to work unchanged.
 */

import {
  buildCookieHeader,
  extractFromCookieStr,
  extractFromHtml,
} from './metaTokens.js';

/**
 * @deprecated use extractFromHtml(html).fbDtsg / extractFromCookieStr(header).fbDtsgCookie
 *
 * IMPORTANT: callers (ads.js, funds.js, partnership.js) pass the RAW cookie
 * input exactly as the user typed/pasted it — a plain "name=value; …" string,
 * a JSON array, or a JSON object. It must be normalised via buildCookieHeader()
 * BEFORE running the cookie-string regexes, otherwise JSON-format cookies
 * silently fail to extract anything (this was a real regression — fixed here).
 */
export function extractFbDtsg(cookiesOrHtml) {
  // Looks like actual page HTML (not user-pasted cookies) — extract directly.
  if (typeof cookiesOrHtml === 'string' && /<html|<!doctype|<body|DTSGInitialData/i.test(cookiesOrHtml)) {
    return extractFromHtml(cookiesOrHtml).fbDtsg;
  }

  // Otherwise treat as raw cookie input (string / JSON array / JSON object) —
  // normalise first so the extraction works no matter what format was pasted.
  try {
    const header = buildCookieHeader(cookiesOrHtml);
    const fromCookie = extractFromCookieStr(header).fbDtsgCookie;
    if (fromCookie) return fromCookie;
  } catch (_) {
    // fall through
  }

  // Last resort — maybe it actually was HTML after all.
  return extractFromHtml(cookiesOrHtml).fbDtsg;
}

/** @deprecated use extractFromCookieStr(buildCookieHeader(raw)).cUser from metaTokens */
export function extractActorId(cookieRaw) {
  try {
    const header = buildCookieHeader(cookieRaw);
    return extractFromCookieStr(header).cUser || null;
  } catch (_) {
    return null;
  }
}

export { buildCookieHeader };
