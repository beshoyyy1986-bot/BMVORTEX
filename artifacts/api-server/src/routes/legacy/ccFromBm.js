/**
 * CC FROM BM — Express routes
 * Translates the browser-extension logic (add_card_bm.js) to server-side
 * HTTP requests against Facebook's internal GraphQL API using the user's cookies.
 *
 * Routes
 *   POST /fetch-cards   — session check + get payment account + list cards
 *   POST /make-default  — run BillingSaveSharedBizCardStateMutation
 */
import { Router } from 'express';

const router = Router();

// ── Cookie helpers (reused from miniMeta pattern) ─────────────────────────
function buildCookieHeader(raw) {
  if (!raw) throw new Error('الكوكيز فارغة');
  const str = typeof raw === 'string' ? raw.trim() : '';
  if (str.startsWith('[') || str.startsWith('{')) {
    try {
      const parsed = JSON.parse(str);
      if (Array.isArray(parsed)) {
        const h = parsed.filter(c => c?.name && c.value != null).map(c => `${c.name}=${c.value}`).join('; ');
        if (!h) throw new Error('المصفوفة لا تحتوي على كوكيز صالحة');
        return h;
      }
      if (typeof parsed === 'object') {
        const h = Object.entries(parsed).filter(([k,v]) => k && v != null).map(([k,v]) => `${k}=${v}`).join('; ');
        if (!h) throw new Error('الكائن لا يحتوي على كوكيز صالحة');
        return h;
      }
    } catch (_) {}
  }
  const pairs = str.split(/[;\n\r\t]+/).map(s => s.trim()).filter(s => s.includes('='));
  if (!pairs.length) throw new Error('لم يتم العثور على كوكيز صالحة');
  return pairs.map(p => { const eq = p.indexOf('='); return `${p.slice(0,eq).trim()}=${p.slice(eq+1)}`; }).join('; ');
}

function extractFbDtsg(html) {
  const pats = [
    /DTSGInitialData[^}]*"token":"([^"]+)"/,
    /"dtsg":\{"token":"([^"]+)"/,
    /name="fb_dtsg"\s+value="([^"]+)"/,
    /"token":"([^"]{8,50})"/,
  ];
  for (const p of pats) {
    const m = html.match(p);
    if (m && m[1] && !m[1].startsWith('EAA')) return m[1];
  }
  return null;
}

function extractUserId(cookieHeader) {
  const m = cookieHeader.match(/(?:^|;\s*)c_user=(\d+)/);
  return m ? m[1] : null;
}

/** Extract businessId and adAccountId (digits only) from billing URL */
function parseBillingUrl(url) {
  try {
    const u = new URL(url);
    const businessId  = u.searchParams.get('business_id')  || null;
    const adRaw       = u.searchParams.get('ad_account_id') || null;
    const adAccountId = adRaw ? adRaw.replace(/^act_/i, '') : null;
    return { businessId, adAccountId };
  } catch (_) {
    return { businessId: null, adAccountId: null };
  }
}

const FB_HEADERS = {
  'User-Agent':  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept':      'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ar,en-US;q=0.7',
};

async function graphql(origin, params, cookie) {
  const res = await fetch(`${origin}/api/graphql/`, {
    method: 'POST',
    headers: {
      ...FB_HEADERS,
      'Cookie': cookie,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Referer': origin,
    },
    body: new URLSearchParams(params).toString(),
  });
  const text = await res.text();
  try { return JSON.parse(text); } catch (_) { return { _raw: text.slice(0,300) }; }
}

// ── POST /fetch-cards ────────────────────────────────────────────────────────
router.post('/fetch-cards', async (req, res) => {
  const { cookies: cookiesRaw, billing_url } = req.body;
  if (!cookiesRaw)   return res.json({ ok: false, reason: 'الكوكيز مطلوبة' });
  if (!billing_url)  return res.json({ ok: false, reason: 'رابط الفوترة مطلوب' });

  let cookie;
  try { cookie = buildCookieHeader(cookiesRaw); } catch(e) { return res.json({ ok: false, reason: e.message }); }

  const userId = extractUserId(cookie);
  if (!userId) return res.json({ ok: false, reason: 'لم يتم العثور على c_user في الكوكيز' });

  const { businessId, adAccountId } = parseBillingUrl(billing_url);
  if (!businessId)  return res.json({ ok: false, reason: 'لم يتم استخراج business_id من الرابط' });
  if (!adAccountId) return res.json({ ok: false, reason: 'لم يتم استخراج ad_account_id من الرابط' });

  // ── Step 0: Load business.facebook.com to extract fb_dtsg ────────────────
  let fb_dtsg = null;
  const origin = 'https://business.facebook.com';
  try {
    const pageRes = await fetch(`${origin}/billing_hub/payment_accounts/?business_id=${businessId}`, {
      headers: { ...FB_HEADERS, 'Cookie': cookie },
      redirect: 'follow',
    });
    if (pageRes.url.includes('login') || pageRes.url.includes('checkpoint')) {
      return res.json({ ok: false, reason: 'الكوكيز منتهية أو الحساب موقوف' });
    }
    const html = await pageRes.text();
    fb_dtsg = extractFbDtsg(html);
  } catch(e) {
    return res.json({ ok: false, reason: `خطأ في الاتصال: ${e.message.slice(0,80)}` });
  }

  if (!fb_dtsg) return res.json({ ok: false, reason: 'تعذّر استخراج fb_dtsg — تحقق من الكوكيز' });

  // ── Step 1: Get billing payment account ID ────────────────────────────────
  const r1 = await graphql(origin, {
    av: userId, __user: userId, __bid: businessId, __aaid: adAccountId,
    fb_dtsg,
    fb_api_caller_class: 'RelayModern',
    fb_api_req_friendly_name: 'BillingHubPaymentMethodsViewQuery',
    variables: JSON.stringify({ businessID: businessId }),
    doc_id: '23945721255021756',
  }, cookie);

  const payAccountId = r1?.data?.business?.billing_payment_account?.id;
  if (!payAccountId) {
    const errMsg = r1?.errors?.[0]?.message || r1?._raw || 'لم يتم العثور على حساب الفوترة';
    return res.json({ ok: false, reason: `Step 1 failed: ${errMsg}` });
  }

  // ── Step 2: Get cards linked to payment account ───────────────────────────
  const r2 = await graphql(origin, {
    av: userId, __user: userId, __bid: businessId, __aaid: adAccountId,
    fb_dtsg,
    fb_api_caller_class: 'RelayModern',
    fb_api_req_friendly_name: 'BillingHubPaymentMethodsBusinessSectionQuery',
    variables: JSON.stringify({
      paymentAccountID: payAccountId,
      billable_account_types: ['FB_ADS', 'WHATSAPP'],
      connected_asset_limit: 26,
      connected_asset_detail_limit: 5,
    }),
    doc_id: '24585166657733775',
  }, cookie);

  const methods = r2?.data?.payment_account?.billing_payment_methods;
  if (!methods || methods.length === 0) {
    const errMsg = r2?.errors?.[0]?.message || 'لا توجد بطاقات مرتبطة بهذا الـ BM';
    return res.json({ ok: false, reason: errMsg });
  }

  const cards = methods
    .map(m => m.credential)
    .filter(Boolean)
    .map(c => ({
      credential_id: c.credential_id,
      label: `${c.card_association_name || 'CARD'} •••• ${c.last_four_digits || '????'}`,
      brand: c.card_association_name || '',
      last4: c.last_four_digits || '',
    }));

  return res.json({
    ok: true,
    cards,
    session: { userId, businessId, adAccountId, payAccountId, fb_dtsg },
  });
});

// ── POST /make-default ───────────────────────────────────────────────────────
router.post('/make-default', async (req, res) => {
  const { cookies: cookiesRaw, session, credential_id } = req.body;
  if (!credential_id) return res.json({ ok: false, reason: 'credential_id مطلوب' });
  if (!session)       return res.json({ ok: false, reason: 'بيانات الجلسة مطلوبة' });

  let cookie;
  try { cookie = buildCookieHeader(cookiesRaw); } catch(e) { return res.json({ ok: false, reason: e.message }); }

  const { userId, businessId, adAccountId, fb_dtsg } = session;
  const origin = 'https://business.facebook.com';

  const vars = {
    input: {
      payment_legacy_account_id: adAccountId,
      shared_biz_credential_id:  credential_id,
      upl_logging_data: {
        context:              'billingaddpm',
        credential_id,
        credential_type:      'CREDIT_CARD',
        entry_point:          'BILLING_HUB',
        external_flow_id:     `upl_${Date.now()}_${Math.random().toString(36).slice(2,11)}`,
        target_name:          'BillingSaveSharedBizCardStateMutation',
        user_session_id:      `upl_${Date.now()}_${Math.random().toString(36).slice(2,11)}`,
        wizard_config_name:   'SELECT_PAYMENT_METHOD',
        wizard_name:          'ADD_PM_PUX_EP',
        wizard_session_id:    `upl_wizard_${Date.now()}_${Math.random().toString(36).slice(2,11)}`,
      },
      actor_id:         userId,
      client_mutation_id: Date.now().toString(),
    },
    includeCreateNewFromOldFragment: false,
  };

  try {
    const result = await graphql(origin, {
      av: userId, __user: userId, __bid: businessId, __aaid: adAccountId,
      fb_dtsg,
      fb_api_caller_class:      'RelayModern',
      fb_api_req_friendly_name: 'BillingSaveSharedBizCardStateMutation',
      variables: JSON.stringify(vars),
      doc_id: '25126279877041501',
    }, cookie);

    if (result?.errors) {
      return res.json({ ok: false, reason: result.errors[0]?.message || 'GraphQL error' });
    }

    return res.json({ ok: true, message: 'تم تعيين الكارت كـ Default بنجاح ✅' });
  } catch(e) {
    return res.json({ ok: false, reason: e.message });
  }
});

export default router;
