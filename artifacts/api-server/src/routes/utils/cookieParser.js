/**
 * Cookie Parser Utility
 *
 * Thin shim over utils/metaTokens.js so every tool resolves tokens the same way.
 *
 * fb_dtsg is NOT a cookie — it is a per-session CSRF token that Facebook embeds
 * in the page HTML. Scanning the cookie string for it (what this file used to
 * do) returns null for every real login, which is why the tools that imported
 * from here failed with "تعذّر استخراج fb_dtsg". Resolving it requires an
 * actual page fetch, so resolveFbDtsg is async.
 */

import {
  buildCookieHeader as buildHeader,
  extractFromCookieStr,
  getSession,
} from '../../utils/metaTokens.js';

/** Resolve fb_dtsg for a cookie blob. Async — needs a page fetch. */
async function resolveFbDtsg(cookies, url, proxy) {
  if (!cookies) return null;
  let header;
  try {
    header = buildHeader(cookies);
  } catch {
    return null;
  }
  const session = await getSession(header, url, 20000, proxy);
  return session?.dtsg || null;
}

function extractActorId(cookies) {
  if (!cookies) return null;
  try {
    return extractFromCookieStr(buildHeader(cookies)).cUser;
  } catch {
    return null;
  }
}

function buildCookieHeader(cookies) {
  if (!cookies) return '';
  try {
    return buildHeader(cookies);
  } catch {
    return String(cookies).trim();
  }
}

export { resolveFbDtsg, extractActorId, buildCookieHeader };
