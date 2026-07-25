/**
 * Meta Card Adder — Playwright-based route
 * Uses browser automation to add payment cards to Meta Business Manager.
 *
 * NOTE: Playwright is a heavy dependency not bundled by default. This route
 * returns HTTP 503 when playwright is not available in the environment so the
 * server starts cleanly and all other routes remain functional.
 */
import express from 'express';

const router = express.Router();

// ── Random name generator ────────────────────────────────────────────────────
const FIRST = ['James','John','Robert','Michael','William','David','Richard','Joseph',
  'Mary','Patricia','Jennifer','Linda','Elizabeth','Susan','Jessica','Sarah',
  'Ahmed','Mohamed','Ali','Hassan','Mahmoud','Said','Karim','Omar',
  'Sofia','Maria','Ana','Isabella','Emma','Olivia','Wei','Li','Zhang','Wang'];
const LAST  = ['Smith','Johnson','Williams','Brown','Jones','Garcia','Miller','Davis',
  'Rodriguez','Martinez','Anderson','Thomas','Jackson','White','Harris','Martin',
  'Silva','Santos','Oliveira','Souza','Rodrigues','Ferreira','Kim','Lee','Park'];

function randomName() {
  return `${FIRST[Math.floor(Math.random()*FIRST.length)]} ${LAST[Math.floor(Math.random()*LAST.length)]}`;
}

// ── Cookie parser ─────────────────────────────────────────────────────────────
function parseCookies(input) {
  if (!input) return [];
  const str = input.trim();
  if (str.startsWith('[')) {
    try {
      return JSON.parse(str).map(c => ({
        name: c.name, value: c.value, domain: c.domain || '.facebook.com', path: c.path || '/',
      }));
    } catch (_) { /* fall through */ }
  }
  if (str.includes('=')) {
    return str.split(/;\s*/).filter(Boolean).map(pair => {
      const [name, ...rest] = pair.trim().split('=');
      return { name: name.trim(), value: rest.join('=').trim(), domain: '.facebook.com', path: '/' };
    }).filter(c => c.name);
  }
  return [];
}

// ── Proxy parser ─────────────────────────────────────────────────────────────
function parseProxy(proxyString) {
  if (!proxyString || !proxyString.trim()) return null;
  const url = proxyString.trim();
  if (/^[^:]+:\d+:[^:]+:[^:]+$/.test(url)) {
    const [host, port, user, pass] = url.split(':');
    return { server: `http://${host}:${port}`, username: user, password: pass };
  }
  if (/^[^:]+:[^:]+@[^:]+:\d+$/.test(url)) {
    const [auth, hostPort] = url.split('@');
    const [user, pass] = auth.split(':');
    return { server: `http://${hostPort}`, username: user, password: pass };
  }
  if (/^[^:]+:\d+$/.test(url)) return { server: `http://${url}` };
  try {
    const parsed = new URL(url.startsWith('http') ? url : `http://${url}`);
    const proxy  = { server: `${parsed.protocol}//${parsed.host}` };
    if (parsed.username) {
      proxy.username = decodeURIComponent(parsed.username);
      proxy.password = decodeURIComponent(parsed.password);
    }
    return proxy;
  } catch (_) { return null; }
}

// ── Card parser ───────────────────────────────────────────────────────────────
function detectCardType(number) {
  const n = number.replace(/\D/g, '');
  if (/^3[47]/.test(n))            return { type: 'amex',       length: 15, cvvLen: 4 };
  if (/^5[1-5]/.test(n))           return { type: 'mastercard', length: 16, cvvLen: 3 };
  if (/^4/.test(n))                return { type: 'visa',       length: 16, cvvLen: 3 };
  if (/^3(?:0[0-5]|[68])/.test(n)) return { type: 'diners',    length: 14, cvvLen: 3 };
  if (/^6(?:011|5)/.test(n))       return { type: 'discover',  length: 16, cvvLen: 3 };
  return                                   { type: 'unknown',  length: 16, cvvLen: 3 };
}

function parseCardLine(line) {
  const parts = line.trim().split(/[|\s/]/).filter(Boolean);
  if (parts.length < 4) throw new Error(`صيغة بطاقة غير صحيحة: ${line}`);
  const number = parts[0].replace(/\D/g, '');
  const mm     = parts[1].padStart(2, '0');
  const yy     = parts[2].toString().slice(-2);
  const cvv    = parts[3];
  const ct     = detectCardType(number);
  if (number.length !== ct.length) throw new Error(`طول رقم ${ct.type} غير صحيح: ${number.length} رقم`);
  if (cvv.length   !== ct.cvvLen)  throw new Error(`طول CVV غير صحيح لـ ${ct.type}: ${cvv.length}`);
  return { number, expiry: { mm, yy }, cvv, type: ct.type, holder: randomName() };
}

// ── Selectors (Meta Business Billing UI) ─────────────────────────────────────
const SELECTORS = {
  addPaymentMethodButton: "button:has-text('Add payment method')",
  cardNumberInput:        "[role='textbox'][name='Card number']",
  expiryInput:            "[role='textbox'][name='MM/YY']",
  cvvInput:               "[role='textbox'][name='CVV']",
  holderInput:            "[role='textbox'][name='Name on card']",
  countrySelect:          "[role='combobox']",
  countryOptionBrazil:    "text=Brazil",
  submitButton:           "button:has-text('Save')",
  doneButton:             "button:has-text('Done')",
  nextButton:             "button:has-text('Next')",
};

// ── Stealth browser launcher ─────────────────────────────────────────────────
async function launchBrowser(proxyConfig) {
  const args = [
    '--disable-blink-features=AutomationControlled',
    '--disable-dev-shm-usage', '--no-sandbox',
    '--disable-setuid-sandbox', '--disable-gpu',
    '--disable-accelerated-2d-canvas', '--window-size=1366,768', '--lang=en-US,en',
  ];
  const opts = { headless: true, args };
  if (proxyConfig) opts.proxy = proxyConfig;
  // Try plain playwright (playwright-extra / puppeteer-extra not bundled)
  const { chromium } = await import('playwright');
  return chromium.launch(opts);
}

// ── Add a single card ────────────────────────────────────────────────────────
async function addOneCard(card, config) {
  const proxyConfig = parseProxy(config.proxy);
  const browser     = await launchBrowser(proxyConfig);
  try {
    const context = await browser.newContext({
      viewport:   { width: 1366, height: 768 },
      userAgent:  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      locale:     'en-US',
      timezoneId: 'America/Sao_Paulo',
    });
    const cookies = parseCookies(config.cookies);
    if (cookies.length) await context.addCookies(cookies);
    const page = await context.newPage();
    const billingUrl = `https://business.facebook.com/latest/billing_hub/payment_methods/?business_id=${config.businessId}`;
    await page.goto(billingUrl, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(3000);
    await page.click(SELECTORS.addPaymentMethodButton);
    await page.waitForTimeout(2000);
    try {
      await page.click(SELECTORS.countrySelect);
      await page.waitForTimeout(500);
      await page.click(SELECTORS.countryOptionBrazil);
      await page.waitForTimeout(500);
      try { await page.click(SELECTORS.nextButton); await page.waitForTimeout(1000); } catch (_) {}
    } catch (_) { /* skip if already selected */ }
    await page.fill(SELECTORS.holderInput,     card.holder);   await page.waitForTimeout(200);
    await page.fill(SELECTORS.cardNumberInput, card.number);   await page.waitForTimeout(200);
    const expiryEl = await page.$(SELECTORS.expiryInput);
    if (expiryEl) {
      await expiryEl.press('ControlOrMeta+a');
      await expiryEl.fill(`${card.expiry.mm}/${card.expiry.yy}`);
    }
    await page.waitForTimeout(200);
    const cvvEl = await page.$(SELECTORS.cvvInput);
    if (cvvEl) { await cvvEl.press('ControlOrMeta+a'); await cvvEl.fill(card.cvv); }
    await page.waitForTimeout(200);
    await page.click(SELECTORS.submitButton);
    await page.waitForTimeout(4000);
    let done = false;
    try { const btn = await page.$(SELECTORS.doneButton); if (btn) { await btn.click(); done = true; } } catch (_) {}
    const html = await page.content();
    const hasErr = /error|failed|invalid/i.test(html);
    if (hasErr && !done) throw new Error('ميتا أرجعت خطأ — تحقق من بيانات البطاقة');
    return { ok: true, card: card.number.slice(-4), type: card.type };
  } catch (e) {
    return { ok: false, card: card.number.slice(-4), type: card.type, error: e.message };
  } finally {
    await browser.close();
  }
}

// ── POST /api/meta-card-adder/add-cards ──────────────────────────────────────
router.post('/add-cards', async (req, res) => {
  // Gate: playwright must be available in the runtime environment
  try {
    await import('playwright');
  } catch (_) {
    return res.status(503).json({
      ok: false,
      reason: 'Browser automation (Playwright) is not installed in this environment. Install playwright to use this feature.',
    });
  }

  const { cookies, businessId, country, concurrency, cards, proxy } = req.body || {};
  if (!cookies)    return res.json({ ok: false, reason: 'الكوكيز مطلوبة' });
  if (!businessId) return res.json({ ok: false, reason: 'Business ID مطلوب' });
  if (!cards)      return res.json({ ok: false, reason: 'البطاقات مطلوبة' });

  const lines = cards.split('\n').map(l => l.trim()).filter(Boolean);
  if (!lines.length) return res.json({ ok: false, reason: 'لا توجد بطاقات صالحة' });

  const parsed = [];
  const parseErrors = [];
  for (const line of lines) {
    try { parsed.push(parseCardLine(line)); }
    catch (e) { parseErrors.push({ line, error: e.message }); }
  }
  if (!parsed.length) return res.json({ ok: false, reason: 'لا يمكن تحليل أي بطاقة', parseErrors });

  const config = { cookies, businessId, country: country || 'BR', proxy: proxy || '' };
  const cap     = Math.min(Math.max(parseInt(concurrency || '1', 10), 1), 3);
  const results = [];
  const queue   = [...parsed];

  const workers = Array.from({ length: cap }, () =>
    (async () => {
      while (queue.length) {
        const card   = queue.shift();
        const result = await addOneCard(card, config);
        results.push(result);
      }
    })()
  );
  await Promise.all(workers);

  const successCount = results.filter(r => r.ok).length;
  const failCount    = results.length - successCount;
  res.json({ ok: true, successCount, failCount, results, parseErrors });
});

export default router;
