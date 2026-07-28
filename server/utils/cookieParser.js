/**
 * cookieParser.js — backward-compat re-export of unified metaTokens
 */

import {
  buildCookieHeader,
  extractFromCookieStr,
  extractFromHtml,
} from './metaTokens.js';

/**
 * @deprecated use extractFromHtml / extractFromCookieStr
 */
export function extractFbDtsg(cookiesOrHtml) {
  if (typeof cookiesOrHtml === 'string' && /<html|<!doctype|<body|DTSGInitialData/i.test(cookiesOrHtml)) {
    return extractFromHtml(cookiesOrHtml).fbDtsg;
  }
  try {
    const header = buildCookieHeader(cookiesOrHtml);
    const fromCookie = extractFromCookieStr(header).fbDtsgCookie;
    if (fromCookie) return fromCookie;
  } catch (_) {}
  return extractFromHtml(String(cookiesOrHtml || '')).fbDtsg;
}

/** @deprecated use extractFromCookieStr(...).cUser */
export function extractActorId(cookieRaw) {
  try {
    return extractFromCookieStr(buildCookieHeader(cookieRaw)).cUser || null;
  } catch (_) {
    return null;
  }
}

export { buildCookieHeader, extractFromCookieStr, extractFromHtml };
