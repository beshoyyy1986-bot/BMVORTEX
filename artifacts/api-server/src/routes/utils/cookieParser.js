/**
 * Cookie Parser Utility
 * Extracts fb_dtsg and other tokens from Meta cookies
 */

function extractFbDtsg(cookies) {
  if (!cookies) return null;
  
  // Try to extract fb_dtsg from cookies
  const fbDtsgMatch = cookies.match(/fb_dtsg=([^;]+)/);
  if (fbDtsgMatch) {
    return decodeURIComponent(fbDtsgMatch[1]);
  }
  
  // Alternative patterns
  const patterns = [
    /dtsg=([^;]+)/,
    /fb_dtsg=([^;]+)/,
    /"fb_dtsg":"([^"]+)"/
  ];
  
  for (const pattern of patterns) {
    const match = cookies.match(pattern);
    if (match) {
      return decodeURIComponent(match[1]);
    }
  }
  
  return null;
}

function extractActorId(cookies) {
  if (!cookies) return null;
  
  // Extract c_user (user ID) from cookies
  const cUserMatch = cookies.match(/c_user=([^;]+)/);
  if (cUserMatch) {
    return decodeURIComponent(cUserMatch[1]);
  }
  
  return null;
}

function buildCookieHeader(cookies) {
  if (!cookies) return '';
  
  // Clean up cookies and ensure proper format
  return cookies.trim();
}

export { extractFbDtsg, extractActorId, buildCookieHeader };
