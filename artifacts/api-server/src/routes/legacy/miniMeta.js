/**
 * Mini Meta 2$ — Express API routes
 * Mirrors the Python/Playwright tool using server-side HTTP calls to Facebook.
 */
import { Router } from "express";
import {
  buildCookieHeader,
  extractFromHtml,
  extractAdAccountId,
  buildFbHeaders,
  fetchAndExtract,
  getSession,
} from "../../utils/metaTokens.js";

const router = Router();

// ── shim helpers (thin wrappers kept for internal route use) ───────────────

const fbFetchOpts = (cookieHeader, extra = {}) => buildFbHeaders(cookieHeader, extra);
const extractToken  = (html) => extractFromHtml(html).accessToken;
const extractActId  = (input) => extractAdAccountId(input);

/** Extract LSD token from HTML */
function extractLsd(html) {
  const patterns = [
    /"LSD",\[\d+\],\{"token":"([^"]+)"\}/,
    /"LSD",\[\d+\],\{token:"([^"]+)"\}/,
    /"lsd":"([^"]+)"/,
    /name="lsd"\s+value="([^"]+)"/,
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m) return m[1];
  }
  return null;
}

/** Extract page title */
function extractName(html) {
  const m = html.match(/<title>([^<]+)<\/title>/);
  return m ? m[1].replace(/facebook/gi, "").trim() : "مستخدم";
}

// ── Route 1: Verify & Extract Token ───────────────────────────────────────
// NOTE: This tool uses internal fb_dtsg for GraphQL (like all other tools),
// NOT an EAA access token. The EAA is only a bonus for optional Graph API calls.
router.post("/verify-extract", async (req, res) => {
  const { cookies: cookiesRaw, proxy, billing_url } = req.body;
  if (!cookiesRaw) return res.json({ ok: false, reason: "أدخل الكوكيز أولاً" });

  let cookieHeader;
  try {
    cookieHeader = buildCookieHeader(cookiesRaw);
  } catch (e) {
    return res.json({ ok: false, reason: e.message });
  }

  const targetUrl =
    billing_url?.trim() ||
    "https://www.facebook.com/ads/manager/";

  try {
    // Use getSession — same as ccFromBm, add-cards, boost-ad, fetch-page-posts
    const session = await getSession(cookieHeader, targetUrl, 25000, proxy);

    if (!session?.dtsg) {
      return res.json({
        ok: false,
        reason: "تعذّر استخراج fb_dtsg — الكوكيز منتهية أو الحساب موقوف",
      });
    }

    let adAccount = null;
    if (billing_url) {
      const actId = extractActId(billing_url);
      if (actId) adAccount = `act_${actId}`;
    }
    if (!adAccount && session.html) {
      const m = session.html.match(/act[_=](\d+)/);
      if (m) adAccount = `act_${m[1]}`;
    }

    const name = session.html ? extractName(session.html) : "مستخدم";

    return res.json({
      ok: true,
      token: session.dtsg,
      token_type: "dtsg",
      access_token: session.accessToken || null,
      name,
      ad_account: adAccount,
    });
  } catch (e) {
    return res.json({ ok: false, reason: `خطأ في الاتصال: ${e.message.slice(0, 100)}` });
  }
});

// ── Route 2: Add Cards ─────────────────────────────────────────────────────
router.post("/add-cards", async (req, res) => {
  const { cookies: cookiesRaw, proxy, ad_account, mode, cards_text } = req.body;
  if (!ad_account) return res.json({ ok: false, reason: "أدخل الحساب الإعلاني أولاً" });

  let cookieHeader;
  try {
    cookieHeader = buildCookieHeader(cookiesRaw || "[]");
  } catch (e) {
    return res.json({ ok: false, reason: e.message });
  }

  // Extract fb_dtsg + lsd needed for card operations
  const session = await getSession(cookieHeader, "https://www.facebook.com/", 20000, proxy);
  const fb_dtsg = session?.dtsg || "";
  const lsd = session?.lsd || "";

  if (!fb_dtsg) {
    return res.json({
      ok: false,
      reason: "تعذّر استخراج fb_dtsg — الكوكيز منتهية أو الحساب موقوف",
    });
  }

  const actId = extractActId(ad_account || "");
  if (!actId) return res.json({ ok: false, reason: "تنسيق الحساب الإعلاني غير صالح" });

  const results = [];

  // ── Flexible card parser ──────────────────────────────────────────────────
  // Accepts ANY separator (| : ; , / space tab) and ANY date format.
  // Strips names, generates random names automatically.
  // Never rejects format — best-effort extraction.
  const NAMES = [
    "Ahmed", "Mohammed", "Ali", "Omar", "Hassan", "Khaled", "Youssef",
    "Mahmoud", "Mostafa", "Ibrahim", "John", "James", "David", "Michael",
    "Sarah", "Emily", "Emma", "Sophia", "Olivia", "Liam", "Noah", "Ethan",
  ];
  function randomName() { return NAMES[Math.floor(Math.random() * NAMES.length)] + " " + NAMES[Math.floor(Math.random() * NAMES.length)]; }

  function parseCard(raw) {
    // Split by any common delimiter
    const tokens = raw
      .split(/[|:;,/\t\n\r ]+/)
      .map(t => t.trim())
      .filter(Boolean);

    let cardNum = null, mm = null, year = null, cvv = null;

    // Find card number: 15-19 consecutive digits (maybe with spaces/hyphens already removed by split)
    for (const t of tokens) {
      const digits = t.replace(/\D/g, '');
      if (digits.length >= 14 && digits.length <= 19) {
        cardNum = digits;
        break;
      }
    }

    // Find CVV: 3-4 digits, not starting with 0, not a year-like number
    for (const t of tokens) {
      const digits = t.replace(/\D/g, '');
      if (digits.length === 3 || digits.length === 4) {
        const n = parseInt(digits);
        if (n >= 1 && n <= 9999 && !(n >= 25 && n <= 99)) {
          cvv = digits;
          break;
        }
      }
    }

    // Find date tokens: could be MM/YY, MM/YYYY, or separate MM and YYYY
    // First try to find a token that looks like a date (contains digits and / or -)
    for (const t of tokens) {
      const mmyy = t.match(/^(\d{1,2})\s*[\/\-]\s*(\d{2,4})$/);
      if (mmyy) {
        const m = parseInt(mmyy[1]);
        if (m >= 1 && m <= 12) {
          mm = m;
          year = normalizeYear(parseInt(mmyy[2]));
          break;
        }
      }
    }

    // If no combined date, look for separate MM and YYYY/YY tokens
    if (!mm) {
      for (const t of tokens) {
        const digits = t.replace(/\D/g, '');
        if (!digits) continue;
        const n = parseInt(digits);
        // Month: 1-12
        if (n >= 1 && n <= 12 && digits.length <= 2 && t === digits) {
          mm = n;
          break;
        }
      }
    }
    if (!year) {
      for (const t of tokens) {
        const digits = t.replace(/\D/g, '');
        if (!digits) continue;
        const n = parseInt(digits);
        // Year: 2 digits (25-99) or 4 digits (2025-2099 or 1925-1999)
        if (digits.length === 2 && n >= 25 && n <= 99) {
          year = normalizeYear(n);
          break;
        }
        if (digits.length === 4 && n >= 1925 && n <= 2099) {
          year = n;
          break;
        }
      }
    }

    // Fallback defaults if we got a card but couldn't parse everything
    if (cardNum) {
      if (!mm) mm = 12;
      if (!year) year = new Date().getFullYear() + 3;
      if (!cvv) cvv = "123";
    }

    return { cardNum, mm, year, cvv };
  }

  function normalizeYear(y) {
    if (y >= 100) return y;
    return 2000 + y;
  }

  function masked(cardNum) {
    if (!cardNum) return "????";
    return cardNum.slice(0, 6) + "****" + cardNum.slice(-4);
  }

  function addCard(cardNum, mm, year, cvv) {
    const m = masked(cardNum);
    return addCardParsed({ cardNum, mm, year, cvv }, m);
  }

  async function addCardParsed(parsed, label) {
    if (!parsed.cardNum) {
      return { card: label, status: "❌ لم يتم العثور على رقم بطاقة" };
    }
    try {
      const payload = new URLSearchParams({
        fb_dtsg,
        lsd,
        doc_id: "6423087354383438",
        variables: JSON.stringify({
          input: {
            act_id: actId,
            card_number: parsed.cardNum,
            expiration_month: parsed.mm,
            expiration_year: parsed.year,
            cvv: parsed.cvv,
            name_on_card: randomName(),
          },
        }),
      });

      const r = await fetch("https://www.facebook.com/api/graphql/", {
        method: "POST",
        headers: {
          "Cookie": cookieHeader,
          "Content-Type": "application/x-www-form-urlencoded",
          "X-FB-LSD": lsd,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
        body: payload.toString(),
      });

      const txt = await r.text();
      const hasErr = /error|خطأ|invalid|declined/i.test(txt);
      const hasOk = /success|added|payment_method_id/i.test(txt);

      if (hasOk && !hasErr) {
        return { card: label, status: "✅ تم الربط بنجاح" };
      } else if (hasErr) {
        return { card: label, status: "❌ رُفضت البطاقة" };
      } else {
        return { card: label, status: "⚠️ تحقق يدوياً" };
      }
    } catch (e) {
      return { card: label, status: `❌ فشل: ${e.message.slice(0, 60)}` };
    }
  }

  if (mode === "auto") {
    // Fetch cards from gist source
    const gistUrl = "https://gist.githubusercontent.com/beshoyyy1986-bot/a686984181054e00c1a85774e29d4d68/raw/6475acd350623c5b9de0350efb4093e8b8890311/cards";
    try {
      const resp = await fetch(gistUrl);
      const text = await resp.text();
      const lines = text.split("\n").map(l => l.trim()).filter(Boolean);

      if (!lines.length) {
        results.push({ card: "تلقائي", status: "❌ المصدر لا يحتوي على بطاقات" });
      } else {
        for (const line of lines) {
          const parsed = parseCard(line);
          const res = await addCardParsed(parsed, masked(parsed.cardNum));
          results.push(res);
        }
      }
    } catch (e) {
      results.push({ card: "تلقائي", status: `❌ فشل تحميل المصدر: ${e.message.slice(0, 60)}` });
    }
  } else {
    const lines = (cards_text || "")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    if (!lines.length) return res.json({ ok: false, reason: "لا توجد بطاقات" });

    for (const line of lines) {
      const parsed = parseCard(line);
      const res = await addCardParsed(parsed, masked(parsed.cardNum));
      results.push(res);
    }
  }

  return res.json({ ok: true, results });
});

// ── Route 3: Fetch Page Posts ──────────────────────────────────────────────
router.post("/fetch-page-posts", async (req, res) => {
  const { cookies: cookiesRaw, proxy, page_id: pageInput, token } = req.body;

  if (!pageInput?.trim()) return res.json({ ok: false, reason: "أدخل معرّف أو رابط الصفحة" });

  // Extract page ID from URL or raw number
  let pageId = "";
  const matchers = [
    /profile\.php\?id=(\d+)/,
    /\/pages\/[^/]+\/(\d+)/,
    /[?&]page_id=(\d+)/,
  ];
  for (const rx of matchers) {
    const m = pageInput.match(rx);
    if (m) { pageId = m[1]; break; }
  }
  if (!pageId && /^\d+$/.test(pageInput.trim())) pageId = pageInput.trim();

  // Try Graph API name lookup if still no ID and we have token
  if (!pageId && token) {
    const slug = pageInput.trim().replace(/\/+$/, "").split("/").pop().split("?")[0];
    if (slug) {
      try {
        const r = await fetch(
          `https://graph.facebook.com/v19.0/${slug}?fields=id&access_token=${token}`
        );
        const d = await r.json();
        if (d.id) pageId = d.id;
      } catch (_) {}
    }
  }

  if (!pageId) {
    return res.json({ ok: false, reason: "لم يُستخرج معرّف الصفحة — أدخل الـ ID مباشرةً" });
  }

  // Use Graph API if token available
  if (token) {
    try {
      const gUrl = `https://graph.facebook.com/v19.0/${pageId}/posts?fields=id,message,story,created_time&limit=20&access_token=${token}`;
      const gr = await fetch(gUrl);
      const gd = await gr.json();
      if (gd.data && gd.data.length) {
        const posts = gd.data.map((p) => ({
          post_id: p.id.split("_").pop(),
          story_id: p.id,
          title: (p.message || p.story || `منشور ${p.id.split("_").pop()}`).slice(0, 80),
          date: p.created_time,
        }));
        return res.json({ ok: true, posts, page_id: pageId });
      }
    } catch (_) {}
  }

  // Fallback: cookie-based business.facebook.com GraphQL call
  let cookieHeader = "";
  try { cookieHeader = buildCookieHeader(cookiesRaw || "[]"); } catch (_) {}

  if (!cookieHeader) {
    return res.json({ ok: false, reason: "استخرج التوكن أولاً أو أدخل كوكيز صالحة" });
  }

  try {
    // Get fb_dtsg + lsd from business.facebook.com
    const bSession = await getSession(cookieHeader, "https://business.facebook.com/", 20000, proxy);
    const fb_dtsg = bSession?.dtsg;
    const lsd = bSession?.lsd || "";

    if (!fb_dtsg) {
      return res.json({ ok: false, reason: "تعذّر استخراج fb_dtsg — الكوكيز منتهية أو الحساب موقوف" });
    }

    const payload = new URLSearchParams({
      fb_dtsg,
      lsd,
      doc_id: "7678108775563460",
      variables: JSON.stringify({ pageID: pageId }),
    });

    const gqlRes = await fetch("https://www.facebook.com/api/graphql/", {
      method: "POST",
      headers: {
        "Cookie": cookieHeader,
        "Content-Type": "application/x-www-form-urlencoded",
        "X-FB-LSD": lsd || "",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      body: payload.toString(),
    });

    const txt = await gqlRes.text();
    let result;
    try { result = JSON.parse(txt); } catch { result = {}; }

    // Deep search for post edges
    const posts = [];
    function deepFind(obj, depth = 0) {
      if (!obj || typeof obj !== "object" || depth > 10) return;
      const edges = obj.edges;
      if (Array.isArray(edges)) {
        for (const edge of edges) {
          const node = edge.node || edge;
          const pid = node.entity_id || node.id || node.node_id;
          const title = node.title || node.text || node.message || (pid ? `منشور ${pid}` : null);
          if (pid) {
            const pidStr = String(pid).includes("_") ? String(pid).split("_").pop() : String(pid);
            if (!posts.find((p) => p.post_id === pidStr)) {
              posts.push({
                post_id: pidStr,
                story_id: `${pageId}_${pidStr}`,
                title: (String(title || `منشور ${pidStr}`)).slice(0, 80),
                date: node.created_time || null,
              });
            }
          }
        }
      }
      for (const v of Object.values(obj)) deepFind(v, depth + 1);
    }
    if (result.data) deepFind(result.data);

    if (!posts.length) {
      return res.json({ ok: false, reason: "لم يُعثر على منشورات — جرب توكن بدلاً من الكوكيز" });
    }
    return res.json({ ok: true, posts, page_id: pageId });
  } catch (e) {
    return res.json({ ok: false, reason: `خطأ: ${e.message.slice(0, 150)}` });
  }
});

// ── Route 4: Boost / Create Ad ────────────────────────────────────────────
const BOOST_DOC_IDS = ["9955578997835249", "7678108775563460", "6423087354383438"];

router.post("/boost-ad", async (req, res) => {
  const {
    cookies: cookiesRaw, proxy, token, page_id, post_id,
    budget = "10", days = 1, objective = "POST_ENGAGEMENT",
    countries = ["EG"], age_min, age_max, gender = 0, ad_account,
  } = req.body;

  if (!page_id || !post_id)
    return res.json({ ok: false, reason: "page_id و post_id مطلوبين" });

  let cookieHeader = "";
  try { cookieHeader = buildCookieHeader(cookiesRaw || "[]"); } catch (e) {
    return res.json({ ok: false, reason: e.message });
  }

  if (!cookieHeader) return res.json({ ok: false, reason: "أدخل الكوكيز أولاً" });

  const actId = ad_account ? extractActId(ad_account) : null;

  // Get currency via Graph API if possible
  let currency = "USD";
  if (token && actId) {
    try {
      const r = await fetch(
        `https://graph.facebook.com/v18.0/act_${actId}?fields=currency&access_token=${token}`
      );
      const d = await r.json();
      if (d.currency) currency = d.currency;
    } catch (_) {}
  }

  // Step 1: Extract fb_dtsg from www.facebook.com
  const adSession = await getSession(cookieHeader, "https://www.facebook.com/", 20000, proxy);
  const fb_dtsg = adSession?.dtsg || "";
  let lsd = adSession?.lsd || "";

  if (!fb_dtsg) {
    return res.json({ ok: false, reason: "تعذّر استخراج fb_dtsg — الكوكيز منتهية أو الحساب موقوف" });
  }

  // Step 2: Extract lsd from business.facebook.com if not found
  if (!lsd) {
    try {
      const r2 = await fetch("https://business.facebook.com/", fbFetchOpts(cookieHeader));
      const h2 = await r2.text();
      lsd = extractLsd(h2) || "";
    } catch (_) {}
  }

  const endTime = Math.floor(Date.now() / 1000) + parseInt(days) * 86400;
  const budgetCents = Math.round(parseFloat(budget) * 100);

  const variables = {
    input: {
      page_id,
      post_id: `${page_id}_${post_id}`,
      budget: budgetCents,
      end_time: endTime,
      objective,
      targeting: {
        geo_locations: { countries },
        age_min: age_min ? parseInt(age_min) : undefined,
        age_max: age_max ? parseInt(age_max) : undefined,
        genders: gender > 0 ? [gender] : undefined,
      },
    },
  };

  let ad_id = null, used_doc_id = null, responsePreview = "";

  // Try each doc_id in order
  for (const doc_id of BOOST_DOC_IDS) {
    try {
      const payload = new URLSearchParams({
        fb_dtsg,
        lsd: lsd || "",
        doc_id,
        variables: JSON.stringify(variables),
      });

      const r = await fetch("https://www.facebook.com/api/graphql/", {
        method: "POST",
        headers: {
          "Cookie": cookieHeader,
          "Content-Type": "application/x-www-form-urlencoded",
          "X-FB-LSD": lsd || "",
          "X-FB-Friendly-Name": "BoostPostMutation",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
        body: payload.toString(),
      });

      const txt = await r.text();
      responsePreview = txt.slice(0, 500);

      let parsed;
      try { parsed = JSON.parse(txt); } catch { parsed = {}; }

      // Try to extract ad_id from response
      const idMatch = txt.match(/"(?:ad_id|adId|id)"\s*:\s*"(\d{10,})"/);
      if (idMatch) { ad_id = idMatch[1]; used_doc_id = doc_id; break; }

      // If no explicit error, treat as partial success
      if (!txt.toLowerCase().includes("\"error\"")) {
        used_doc_id = doc_id;
        break;
      }
    } catch (_) {}
  }

  return res.json({
    ok: true,
    ad_id,
    used_doc_id,
    currency,
    fb_dtsg_present: !!fb_dtsg,
    lsd_present: !!lsd,
    paused: false,
    response_preview: responsePreview,
    message: ad_id
      ? "✅ تم إنشاء الإعلان"
      : "⚠️ تم الإرسال — تحقق من الإعلانات يدوياً",
  });
});

export default router;
