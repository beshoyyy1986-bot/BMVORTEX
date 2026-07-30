/**
 * playwrightSession.js — Headless Chromium token extraction (PRIMARY path)
 *
 * Runs fully in the background (headless). Supports:
 *   - Local Playwright
 *   - Vercel serverless via @sparticuz/chromium + playwright-core
 *   - Facebook Business / www.facebook.com / adsmanager
 *   - Instagram (business + consumer surfaces)
 *   - Optional HTTP(S) proxy
 *
 * Strategy inside the browser:
 *   1. require('DTSGInitialData') / DTSGInitData / LSD modules
 *   2. window.__DTSG / __DTSGInitialData globals
 *   3. input[name=fb_dtsg] / lsd DOM fields
 *   4. Cookie dtsg_ag / fb_dtsg
 *   5. Script-tag regex + full HTML scan
 *   6. localStorage access tokens (EAA…)
 *   7. Multi-URL retry (business → facebook → ads → instagram)
 */

let playwrightModule = null;
let getChromiumPath = null;
let _initPromise = null;

async function ensurePlaywright() {
  if (playwrightModule) return playwrightModule;
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    // Vercel / serverless Chromium first
    try {
      const chromium = await import('@sparticuz/chromium');
      getChromiumPath = () => chromium.default.executablePath();
      playwrightModule = await import('playwright-core');
      return playwrightModule;
    } catch {}

    try {
      playwrightModule = await import('playwright');
      return playwrightModule;
    } catch {
      return null;
    }
  })();

  return _initPromise;
}

export async function isPlaywrightAvailable() {
  if (playwrightModule) return true;
  await ensurePlaywright();
  return !!playwrightModule;
}

// Warm up Chromium module in background so first request is faster
ensurePlaywright().catch(() => {});

const FB_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/** Cookie domains to inject for Meta surfaces */
const META_DOMAINS = [
  '.facebook.com',
  '.business.facebook.com',
  '.instagram.com',
  '.www.instagram.com',
  '.meta.com',
];

/**
 * Convert a "name=val; …" header (or already-normalised pairs) into Playwright
 * cookie objects spanning every Meta domain so business + IG share the session.
 */
export function cookieHeaderToPlaywrightCookies(cookieHeader, extraDomains = []) {
  if (!cookieHeader) return [];
  const pairs = String(cookieHeader)
    .split(/[;\n\r\t]+/)
    .map((s) => s.trim())
    .filter((s) => s.includes('='));

  const domains = [...new Set([...META_DOMAINS, ...extraDomains])];
  const out = [];

  for (const pair of pairs) {
    const eq = pair.indexOf('=');
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    if (!name) continue;

    // Prefer original domain hints for IG-specific cookies
    const isIg =
      name.startsWith('ig_') ||
      name === 'sessionid' ||
      name === 'ds_user_id' ||
      name === 'csrftoken' ||
      name === 'mid' ||
      name === 'rur';

    const targetDomains = isIg
      ? ['.instagram.com', '.www.instagram.com', '.facebook.com']
      : domains;

    for (const domain of targetDomains) {
      out.push({
        name,
        value,
        domain,
        path: '/',
        httpOnly: false,
        secure: true,
        sameSite: 'None',
      });
    }
  }
  return out;
}

function getFingerprint() {
  const viewports = [
    { width: 1366, height: 768 },
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 },
    { width: 1280, height: 800 },
  ];
  const uas = [
    FB_UA,
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  ];
  const rng = (arr) => arr[Math.floor(Math.random() * arr.length)];
  return { viewport: rng(viewports), ua: rng(uas) };
}

/** In-page token harvester — runs inside Chromium via page.evaluate */
const IN_PAGE_HARVEST = () => {
  const result = {
    dtsg: null,
    lsd: null,
    accessToken: null,
    userId: null,
    bizId: null,
    igUserId: null,
    csrfToken: null,
  };

  const notEaa = (v) => v && typeof v === 'string' && !v.startsWith('EAA') && v.length >= 6;

  // 1) RequireJS modules (classic FB)
  if (typeof window.require === 'function') {
    try {
      const d = window.require('DTSGInitialData');
      if (notEaa(d?.token)) result.dtsg = d.token;
    } catch (_) {}
    try {
      const d = window.require('DTSGInitData');
      if (!result.dtsg && notEaa(d?.token)) result.dtsg = d.token;
    } catch (_) {}
    try {
      const d = window.require('LSD');
      if (d?.token) result.lsd = d.token;
    } catch (_) {}
  }

  // 2) Globals
  try {
    if (!result.dtsg && window.__DTSG?.token && notEaa(window.__DTSG.token)) result.dtsg = window.__DTSG.token;
    if (!result.dtsg && window.__DTSGInitialData?.token && notEaa(window.__DTSGInitialData.token)) {
      result.dtsg = window.__DTSGInitialData.token;
    }
    if (!result.dtsg && typeof window.__DTSG === 'string' && notEaa(window.__DTSG)) result.dtsg = window.__DTSG;
  } catch (_) {}

  // 3) DOM inputs
  try {
    if (!result.dtsg) {
      const el = document.querySelector('input[name="fb_dtsg"]');
      if (el?.value && notEaa(el.value)) result.dtsg = el.value;
    }
    if (!result.lsd) {
      const el = document.querySelector('input[name="lsd"]');
      if (el?.value) result.lsd = el.value;
    }
    if (!result.csrfToken) {
      const el = document.querySelector('input[name="csrfmiddlewaretoken"], meta[name="csrf-token"]');
      if (el?.value || el?.content) result.csrfToken = el.value || el.content;
    }
  } catch (_) {}

  // 4) Cookies
  try {
    const ck = document.cookie || '';
    if (!result.dtsg) {
      const m = ck.match(/(?:^|;\s*)dtsg_ag=([^;]+)/) || ck.match(/(?:^|;\s*)fb_dtsg=([^;]+)/);
      if (m?.[1] && notEaa(decodeURIComponent(m[1]))) result.dtsg = decodeURIComponent(m[1]);
    }
    const cUser = ck.match(/(?:^|;\s*)c_user=(\d+)/);
    if (cUser) result.userId = cUser[1];
    const ig = ck.match(/(?:^|;\s*)ds_user_id=(\d+)/);
    if (ig) result.igUserId = ig[1];
    const csrf = ck.match(/(?:^|;\s*)csrftoken=([^;]+)/);
    if (csrf) result.csrfToken = result.csrfToken || decodeURIComponent(csrf[1]);
  } catch (_) {}

  // 5) Script / HTML regex (deep)
  try {
    const html = document.documentElement?.innerHTML || '';
    const scripts = Array.from(document.querySelectorAll('script'))
      .map((s) => s.textContent || '')
      .join('\n');
    const blob = scripts + '\n' + html;

    if (!result.dtsg) {
      const dtsgPatterns = [
        /DTSGInitialData[^}]{0,300}"token"\s*:\s*"([^"]{8,100})"/,
        /"DTSGInitialData"[^}]{0,300}"token"\s*:\s*"([^"]{8,100})"/,
        /"dtsg"\s*:\s*\{\s*"token"\s*:\s*"([^"]+)"/,
        /"fb_dtsg"\s*,\s*"[^"]*"\s*,\s*"([^"]+)"/,
        /name="fb_dtsg"\s+value="([^"]+)"/,
        /"token"\s*:\s*"(NAf[A-Za-z0-9_-]+)"/,
        /"token"\s*:\s*"(NACP[A-Za-z0-9_-]+)"/,
        /"token"\s*:\s*"(NAfw[A-Za-z0-9_-]+)"/,
        /"token"\s*:\s*"(NAcP[A-Za-z0-9_-]+)"/,
        /"token"\s*:\s*"(NAbb[A-Za-z0-9_-]+)"/,
        /"token"\s*:\s*"([A-Za-z0-9_-]{12,80})"/,
      ];
      for (const p of dtsgPatterns) {
        const m = blob.match(p);
        if (m?.[1] && notEaa(m[1])) {
          result.dtsg = m[1];
          break;
        }
      }
    }

    if (!result.lsd) {
      const lsdPatterns = [
        /"LSD",\[\d+\],\{"token":"([^"]+)"\}/,
        /"LSD",\[\d+\],\{token:"([^"]+)"\}/,
        /"lsd"\s*:\s*"([^"]+)"/,
        /name="lsd"\s+value="([^"]+)"/,
        /\["LSD",[^\]]*,"([A-Za-z0-9_-]{4,20})"\]/,
      ];
      for (const p of lsdPatterns) {
        const m = blob.match(p);
        if (m?.[1]) {
          result.lsd = m[1];
          break;
        }
      }
    }

    if (!result.accessToken) {
      const tokPatterns = [
        /"accessToken"\s*:\s*"(EAA[A-Za-z0-9]+)"/,
        /"access_token"\s*:\s*"(EAA[A-Za-z0-9]+)"/,
        /"act_access_token"\s*:\s*"(EAA[A-Za-z0-9]+)"/,
        /"token"\s*:\s*"(EAA[A-Za-z0-9]{40,})"/,
        /(EAA[Bb][A-Za-z0-9]{60,})/,
        /(EAAG[A-Za-z0-9]{60,})/,
      ];
      for (const p of tokPatterns) {
        const m = blob.match(p);
        if (m?.[1]) {
          result.accessToken = m[1];
          break;
        }
      }
    }

    if (!result.userId) {
      const uidPatterns = [
        /"actorID"\s*:\s*"(\d{6,})"/,
        /"USER_ID"\s*:\s*"(\d{6,})"/,
        /"userID"\s*:\s*"(\d{6,})"/,
        /"viewer_actor_id"\s*:\s*"(\d{6,})"/,
        /"uid"\s*:\s*(\d{6,})/,
        /"uid"\s*:\s*"(\d{6,})"/,
        /"profile_owner"\s*:\s*\{[^}]{0,200}"id"\s*:\s*"(\d{6,})"/,
        /"viewer"\s*:\s*\{[^}]{0,200}"id"\s*:\s*"(\d{6,})"/,
      ];
      for (const p of uidPatterns) {
        const m = blob.match(p);
        if (m?.[1]) {
          result.userId = m[1];
          break;
        }
      }
    }

    if (!result.bizId) {
      const bizPatterns = [
        /"business_id"\s*:\s*"(\d{6,})"/,
        /"businessID"\s*:\s*"(\d{6,})"/,
        /"current_business_id"\s*:\s*"(\d{6,})"/,
        /"biz_id"\s*:\s*"(\d{6,})"/,
        /"selectedBusinessId"\s*:\s*"(\d{6,})"/,
      ];
      for (const p of bizPatterns) {
        const m = blob.match(p);
        if (m?.[1]) {
          result.bizId = m[1];
          break;
        }
      }
    }
  } catch (_) {}

  // 6) localStorage
  try {
    if (!result.accessToken) {
      result.accessToken =
        localStorage.getItem('accessToken') ||
        localStorage.getItem('AccessToken') ||
        localStorage.getItem('token') ||
        null;
      if (result.accessToken && !String(result.accessToken).startsWith('EAA')) {
        result.accessToken = null;
      }
    }
  } catch (_) {}

  return result;
};

/** URLs to try when harvesting tokens (order matters — strongest first) */
export function getHarvestUrls(platform = 'facebook', preferredUrl) {
  const fb = [
    'https://business.facebook.com/',
    'https://business.facebook.com/home/accounts',
    'https://www.facebook.com/',
    'https://www.facebook.com/adsmanager/manage/campaigns',
    'https://adsmanager.facebook.com/adsmanager/',
    'https://business.facebook.com/billing_hub/payment_settings',
  ];
  const ig = [
    'https://business.facebook.com/',
    'https://www.instagram.com/',
    'https://www.instagram.com/accounts/edit/',
    'https://business.facebook.com/latest/home',
    'https://www.facebook.com/',
  ];
  const base = platform === 'instagram' ? ig : fb;
  if (preferredUrl) {
    return [...new Set([preferredUrl, ...base])];
  }
  return base;
}

async function launchBrowser(proxy) {
  const pw = await ensurePlaywright();
  if (!pw) return null;

  const args = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-blink-features=AutomationControlled',
    '--disable-gpu',
    '--disable-accelerated-2d-canvas',
    '--disable-web-security',
    '--window-size=1366,768',
    '--mute-audio',
  ];

  const launchOpts = {
    headless: true, // always background
    args,
  };

  if (getChromiumPath) {
    try {
      launchOpts.executablePath = await getChromiumPath();
    } catch {}
  }

  if (proxy) {
    try {
      const u = new URL(proxy.includes('://') ? proxy : `http://${proxy}`);
      launchOpts.proxy = {
        server: `${u.protocol}//${u.hostname}${u.port ? `:${u.port}` : ''}`,
        username: u.username || undefined,
        password: u.password || undefined,
      };
    } catch {
      launchOpts.proxy = { server: proxy };
    }
  }

  return pw.chromium.launch(launchOpts);
}

/**
 * PRIMARY extraction path — headless Playwright in the background.
 *
 * @param {string} cookieHeader — normalised "name=val; …"
 * @param {string} [url] — preferred start URL
 * @param {string} [proxy]
 * @param {{ platform?: string }} [opts]
 * @returns {Promise<{dtsg,lsd,accessToken,userId,bizId,igUserId,csrfToken,origin,viaBrowser,strategy,html?}|null>}
 */
export async function extractWithPlaywright(cookieHeader, url, proxy, opts = {}) {
  const platform = opts.platform || 'facebook';
  let browser;
  try {
    browser = await launchBrowser(proxy);
    if (!browser) return null;

    const fp = getFingerprint();
    const context = await browser.newContext({
      userAgent: fp.ua,
      viewport: fp.viewport,
      locale: 'ar-EG',
      timezoneId: 'Africa/Cairo',
      ignoreHTTPSErrors: true,
      javaScriptEnabled: true,
    });

    const cookies = cookieHeaderToPlaywrightCookies(cookieHeader);
    if (cookies.length) {
      // Playwright rejects duplicate name+domain collisions silently sometimes — add best-effort
      try {
        await context.addCookies(cookies);
      } catch {
        // Fallback: unique by name+domain
        const seen = new Set();
        const uniq = [];
        for (const c of cookies) {
          const k = `${c.name}|${c.domain}`;
          if (seen.has(k)) continue;
          seen.add(k);
          uniq.push(c);
        }
        await context.addCookies(uniq).catch(() => {});
      }
    }

    const page = await context.newPage();
    await page.addInitScript(() => {
      try {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
        Object.defineProperty(navigator, 'languages', { get: () => ['ar-EG', 'ar', 'en-US', 'en'] });
        // @ts-ignore
        window.chrome = { runtime: {} };
      } catch (_) {}
    });

    const urls = getHarvestUrls(platform, url);
    let best = null;
    let lastOrigin = null;
    let lastHtml = null;

    for (const target of urls) {
      try {
        await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() =>
          page.goto(target, { waitUntil: 'commit', timeout: 20_000 })
        );
        // Let late DTSG / Relay bootstrap scripts settle
        await page.waitForTimeout(1800);
        try {
          await page.waitForLoadState('networkidle', { timeout: 8_000 });
        } catch {}

        const finalUrl = page.url();
        if (finalUrl.includes('/login') || finalUrl.includes('checkpoint') || finalUrl.includes('recover')) {
          continue;
        }

        lastOrigin = new URL(finalUrl).origin;
        const harvested = await page.evaluate(IN_PAGE_HARVEST);
        lastHtml = null;

        if (harvested?.dtsg) {
          // Optional full HTML only when accessToken still missing
          if (!harvested.accessToken) {
            try {
              const html = await page.content();
              lastHtml = html;
            } catch {}
          }

          best = {
            dtsg: harvested.dtsg,
            lsd: harvested.lsd || null,
            accessToken: harvested.accessToken || null,
            userId: harvested.userId || null,
            bizId: harvested.bizId || null,
            igUserId: harvested.igUserId || null,
            csrfToken: harvested.csrfToken || null,
            origin: lastOrigin,
            viaBrowser: true,
            strategy: 'playwright',
            html: lastHtml,
          };
          break;
        }

        // Keep partial (userId only) as last resort candidate
        if (!best && (harvested?.userId || harvested?.accessToken || harvested?.lsd)) {
          best = {
            dtsg: null,
            lsd: harvested.lsd || null,
            accessToken: harvested.accessToken || null,
            userId: harvested.userId || null,
            bizId: harvested.bizId || null,
            igUserId: harvested.igUserId || null,
            csrfToken: harvested.csrfToken || null,
            origin: lastOrigin,
            viaBrowser: true,
            strategy: 'playwright_partial',
            html: null,
          };
        }
      } catch {
        continue;
      }
    }

    // If we only got partial, try one more hard pass on business home with longer wait
    if (best && !best.dtsg) {
      try {
        await page.goto('https://business.facebook.com/', { waitUntil: 'networkidle', timeout: 35_000 });
        await page.waitForTimeout(2500);
        const harvested = await page.evaluate(IN_PAGE_HARVEST);
        if (harvested?.dtsg) {
          best = {
            ...best,
            dtsg: harvested.dtsg,
            lsd: harvested.lsd || best.lsd,
            accessToken: harvested.accessToken || best.accessToken,
            userId: harvested.userId || best.userId,
            bizId: harvested.bizId || best.bizId,
            strategy: 'playwright',
            origin: new URL(page.url()).origin,
          };
        }
      } catch {}
    }

    await browser.close().catch(() => {});
    browser = null;

    if (!best?.dtsg && !best?.accessToken) return null;
    return best;
  } catch {
    if (browser) await browser.close().catch(() => {});
    return null;
  }
}

/**
 * Capture live session cookies from a headless browser (optional login).
 * Used by /api/extract/playwright-capture.
 */
export async function captureSessionWithPlaywright({ email, password, url, proxy } = {}) {
  let browser;
  try {
    browser = await launchBrowser(proxy);
    if (!browser) return { ok: false, error: 'Playwright غير متاح على هذا السيرفر' };

    const context = await browser.newContext({
      userAgent: FB_UA,
      locale: 'ar',
      timezoneId: 'Africa/Cairo',
      viewport: { width: 1366, height: 768 },
    });
    const page = await context.newPage();

    await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 30_000 });

    if (email && password) {
      try {
        await page.fill('#email', email, { timeout: 8_000 });
        await page.fill('#pass', password, { timeout: 4_000 });
        await page.click('[name="login"]', { timeout: 4_000 });
        await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20_000 }).catch(() => {});
      } catch {}
    }

    const targetUrl = url?.trim() || 'https://business.facebook.com/';
    if (targetUrl !== 'https://www.facebook.com/') {
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 25_000 }).catch(() => {});
    }
    await page.waitForTimeout(1500);

    const cookies = await context.cookies();
    const harvested = await page.evaluate(IN_PAGE_HARVEST).catch(() => null);
    await browser.close().catch(() => {});
    browser = null;

    if (!cookies.length) return { ok: false, error: 'لم يتم التقاط أي كوكيز' };

    const cookieString = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
    return {
      ok: true,
      cookies,
      cookieString,
      tokens: harvested,
    };
  } catch (e) {
    if (browser) await browser.close().catch(() => {});
    return { ok: false, error: `خطأ في Playwright: ${String(e.message || e).slice(0, 200)}` };
  }
}
