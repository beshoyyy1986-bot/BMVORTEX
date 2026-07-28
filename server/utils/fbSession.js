/**
 * fbSession.js — thin re-export of unified metaTokens
 *
 * All token/session logic lives in metaTokens.js + playwrightSession.js.
 * This file keeps old import paths working for every route/tool.
 */

export {
  buildCookieHeader,
  extractFromCookieStr,
  extractFromHtml,
  extractFbDtsg,
  extractFbDtsgFromCookies,
  extractFromAllScripts,
  extractLsd,
  extractAccessToken,
  extractUserId,
  extractAdAccountId,
  extractBusinessId,
  extractActId,
  extractPageId,
  extractAll,
  detectPlatform,
  getPlatformUrl,
  buildFbHeaders,
  fbFetchOpts,
  graphqlHeaders,
  graphqlBody,
  fbFetch,
  cookiesToPlaywrightArray,
  getSession,
  getSessionViaBrowser,
  extractTokensDeep,
  fetchAndExtract,
  captureSessionWithPlaywright,
  isPlaywrightAvailable,
} from './metaTokens.js';

// Alias used by some callers
export { extractUserId as extractActorId } from './metaTokens.js';
export { getSession as getSessionMeta } from './metaTokens.js';
