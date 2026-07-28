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

/** @deprecated use extractFromHtml(html).fbDtsg from metaTokens */
export function extractFbDtsg(cookiesOrHtml) {
  // Legacy callers pass the raw cookie string; newer callers pass HTML.
  // Try HTML extraction first, fall back to cookie-string extraction.
  const fromHtml = extractFromHtml(cookiesOrHtml).fbDtsg;
  if (fromHtml) return fromHtml;
  return extractFromCookieStr(cookiesOrHtml).fbDtsgCookie || null;
}

/** @deprecated use extractFromCookieStr(str).cUser from metaTokens */
export function extractActorId(cookieStr) {
  return extractFromCookieStr(cookieStr).cUser || null;
}

export { buildCookieHeader };
