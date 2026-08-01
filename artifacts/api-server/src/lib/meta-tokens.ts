const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export class TokenExtractionError extends Error {}

// Patterns Meta uses (across bizweb/comet builds) to embed these tokens in page HTML.
const FB_DTSG_PATTERNS = [
  /"DTSGInitialData"\s*,\s*\[\]\s*,\s*\{\s*"token"\s*:\s*"([^"]+)"/,
  /"DTSGInitData"\s*,\s*\[\]\s*,\s*\{\s*"token"\s*:\s*"([^"]+)"/,
  /name="fb_dtsg"\s+(?:autocomplete="off"\s+)?value="([^"]+)"/,
  /"dtsg"\s*:\s*\{\s*"token"\s*:\s*"([^"]+)"/,
];

const LSD_PATTERNS = [
  /"LSD"\s*,\s*\[\]\s*,\s*\{\s*"token"\s*:\s*"([^"]+)"/,
  /name="lsd"\s+value="([^"]+)"/,
  /"lsd"\s*:\s*"([^"]+)"/,
];

function matchFirst(html: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

/**
 * Fetches a Facebook Business Manager page using the provided session cookies
 * and extracts the fb_dtsg / lsd anti-CSRF tokens embedded in the page HTML.
 * These tokens are short-lived and tied to the session, so they must be
 * pulled fresh for each request rather than stored.
 */
export async function extractFbTokens(
  cookies: string,
  businessId?: string,
): Promise<{ fbDtsg: string; lsd: string }> {
  const url = businessId
    ? `https://business.facebook.com/settings/people?business_id=${encodeURIComponent(businessId)}`
    : "https://business.facebook.com/business_locations/";

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Cookie: cookies,
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });
  } catch {
    throw new TokenExtractionError("تعذر الوصول لفيسبوك، تحقق من الاتصال بالإنترنت");
  }

  const finalUrl = response.url ?? "";
  if (finalUrl.includes("/login") || finalUrl.includes("checkpoint")) {
    throw new TokenExtractionError("الكوكيز غير صالحة أو منتهية الصلاحية");
  }

  const html = await response.text();

  const fbDtsg = matchFirst(html, FB_DTSG_PATTERNS);
  const lsd = matchFirst(html, LSD_PATTERNS);

  if (!fbDtsg || !lsd) {
    throw new TokenExtractionError(
      "تعذر استخراج fb_dtsg / lsd من الكوكيز، تأكد من صلاحية الكوكيز",
    );
  }

  return { fbDtsg, lsd };
}
