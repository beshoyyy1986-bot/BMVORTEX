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
import {
  buildCookieHeader,
  getSession,
  extractFromCookieStr,
  extractAdAccountId,
  extractBusinessId,
} from '../../utils/metaTokens.js';

const router = Router();

// ── shim helpers ──────────────────────────────────────────────────────────
const extractUserId  = (cookieHeader) => extractFromCookieStr(cookieHeader).cUser;

/** Extract businessId and adAccountId (digits only) from a billing URL, a bare ID, or "act_" form */
function parseBillingUrl(url) {
  return { businessId: extractBusinessId(url), adAccountId: extractAdAccountId(url) };
}

const FB_HEADERS = {
  'User-Agent':  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept':      'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ar,en-US;q=0.7',
};

async function graphql(origin, params, cookie, lsd = '') {
  const res = await fetch(`${origin}/api/graphql/`, {
    method: 'POST',
    headers: {
      ...FB_HEADERS,
      'Cookie': cookie,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Referer': origin,
      'X-FB-LSD': lsd,
      'X-FB-Friendly-Name': params.fb_api_req_friendly_name || 'GraphQL',
      'Sec-Fetch-Site': 'same-origin',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Dest': 'empty',
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

  // ── Step 0: Resolve fb_dtsg via the shared session extractor ─────────────
  // A single page fetch often lands on a shell that carries no dtsg, so go
  // through getSession — it tries Playwright, then several URLs over HTTP.
  const origin = 'https://business.facebook.com';
  const session = await getSession(
    cookie,
    `${origin}/billing_hub/payment_accounts/?business_id=${businessId}`
  );
  const fb_dtsg = session?.dtsg;
  const lsd = session?.lsd || '';

  if (!fb_dtsg) {
    return res.json({ ok: false, reason: 'تعذّر استخراج fb_dtsg — الكوكيز منتهية أو الحساب موقوف' });
  }

  // ── Step 1: Get billing payment account ID ────────────────────────────────
  const r1 = await graphql(origin, {
    av: userId, __user: userId, __bid: businessId, __aaid: adAccountId,
    fb_dtsg,
    lsd,
    fb_api_caller_class: 'RelayModern',
    fb_api_req_friendly_name: 'BillingHubPaymentMethodsViewQuery',
    variables: JSON.stringify({ businessID: businessId }),
    doc_id: '23945721255021756',
  }, cookie, lsd);

  const payAccountId = r1?.data?.business?.billing_payment_account?.id;
  if (!payAccountId) {
    const errMsg = r1?.errors?.[0]?.message || r1?._raw || 'لم يتم العثور على حساب الفوترة';
    return res.json({ ok: false, reason: `Step 1 failed: ${errMsg}` });
  }

  // ── Step 2: Get cards linked to payment account ───────────────────────────
  const r2 = await graphql(origin, {
    av: userId, __user: userId, __bid: businessId, __aaid: adAccountId,
    fb_dtsg,
    lsd,
    fb_api_caller_class: 'RelayModern',
    fb_api_req_friendly_name: 'BillingHubPaymentMethodsBusinessSectionQuery',
    variables: JSON.stringify({
      paymentAccountID: payAccountId,
      billable_account_types: ['FB_ADS', 'WHATSAPP'],
      connected_asset_limit: 26,
      connected_asset_detail_limit: 5,
    }),
    doc_id: '24585166657733775',
  }, cookie, lsd);

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
