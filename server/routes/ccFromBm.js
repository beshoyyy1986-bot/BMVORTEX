/**
 * CC FROM BM — Express routes
 * Routes:
 *   POST /fetch-cards   — session check + get payment account + list cards
 *   POST /make-default  — run BillingSaveSharedBizCardStateMutation
 */
import { Router } from 'express';
import {
  buildCookieHeader,
  extractFbDtsg,
  extractFbDtsgFromCookies,
  extractUserId,
  extractAdAccountId,
  extractBusinessId,
  graphqlHeaders,
  fbFetch,
  getSession,
} from '../utils/fbSession.js';

const router = Router();

/** Extract businessId + adAccountId from billing URL, bare ID, or act_ form (unified) */
function parseBillingUrl(url) {
  return {
    businessId: extractBusinessId(url),
    adAccountId: extractAdAccountId(url),
  };
}

async function graphql(origin, params, cookie, proxy) {
  const res = await fbFetch(`${origin}/api/graphql/`, cookie, {
    method: 'POST',
    headers: { ...graphqlHeaders(cookie), Referer: origin },
    body: new URLSearchParams(params).toString(),
    proxy,
  });
  const text = await res.text();
  try { return JSON.parse(text); } catch (_) { return { _raw: text.slice(0, 300) }; }
}

// ── POST /fetch-cards ─────────────────────────────────────────────────────────
router.post('/fetch-cards', async (req, res) => {
  const { cookies: cookiesRaw, billing_url, proxy } = req.body || {};
  if (!cookiesRaw)  return res.json({ ok: false, reason: 'الكوكيز مطلوبة' });
  if (!billing_url) return res.json({ ok: false, reason: 'رابط الفوترة مطلوب' });

  let cookie;
  try { cookie = buildCookieHeader(cookiesRaw); } catch (e) { return res.json({ ok: false, reason: e.message }); }

  const userId = extractUserId(cookie);
  if (!userId) return res.json({ ok: false, reason: 'لم يتم العثور على c_user في الكوكيز' });

  const { businessId, adAccountId } = parseBillingUrl(billing_url);
  if (!businessId)  return res.json({ ok: false, reason: 'لم يتم استخراج business_id من الرابط' });
  if (!adAccountId) return res.json({ ok: false, reason: 'لم يتم استخراج ad_account_id من الرابط' });

  const origin = 'https://business.facebook.com';
  let fb_dtsg = null;
  try {
    const pageRes = await fbFetch(`${origin}/billing_hub/payment_accounts/?business_id=${businessId}`, cookie, {
      headers: { ...graphqlHeaders(cookie), Accept: 'text/html,application/xhtml+xml' },
      redirect: 'follow',
      proxy,
    });
    if (pageRes.url.includes('login') || pageRes.url.includes('checkpoint'))
      return res.json({ ok: false, reason: 'الكوكيز منتهية أو الحساب موقوف' });
    fb_dtsg = extractFbDtsg(await pageRes.text());
  } catch (e) {
    return res.json({ ok: false, reason: `خطأ في الاتصال: ${e.message.slice(0, 80)}` });
  }

  // Fallback 1: cookie-based dtsg
  if (!fb_dtsg) {
    fb_dtsg = extractFbDtsgFromCookies(cookie);
  }

  // Fallback 2: getSession multi-strategy
  if (!fb_dtsg) {
    try {
      const session = await getSession(cookie, `${origin}/billing_hub/payment_accounts/?business_id=${businessId}`, 20000, proxy);
      if (session?.dtsg) fb_dtsg = session.dtsg;
    } catch (_) {}
  }

  if (!fb_dtsg) return res.json({ ok: false, reason: 'تعذّر استخراج fb_dtsg — تحقق من الكوكيز' });

  const r1 = await graphql(origin, {
    av: userId, __user: userId, __bid: businessId, __aaid: adAccountId, fb_dtsg,
    fb_api_caller_class: 'RelayModern',
    fb_api_req_friendly_name: 'BillingHubPaymentMethodsViewQuery',
    variables: JSON.stringify({ businessID: businessId }),
    doc_id: '23945721255021756',
  }, cookie, proxy);

  const payAccountId = r1?.data?.business?.billing_payment_account?.id;
  if (!payAccountId)
    return res.json({ ok: false, reason: `Step 1 failed: ${r1?.errors?.[0]?.message || r1?._raw || 'لم يتم العثور على حساب الفوترة'}` });

  const r2 = await graphql(origin, {
    av: userId, __user: userId, __bid: businessId, __aaid: adAccountId, fb_dtsg,
    fb_api_caller_class: 'RelayModern',
    fb_api_req_friendly_name: 'BillingHubPaymentMethodsBusinessSectionQuery',
    variables: JSON.stringify({
      paymentAccountID: payAccountId,
      billable_account_types: ['FB_ADS', 'WHATSAPP'],
      connected_asset_limit: 26, connected_asset_detail_limit: 5,
    }),
    doc_id: '24585166657733775',
  }, cookie, proxy);

  const methods = r2?.data?.payment_account?.billing_payment_methods;
  if (!methods?.length)
    return res.json({ ok: false, reason: r2?.errors?.[0]?.message || 'لا توجد بطاقات مرتبطة بهذا الـ BM' });

  const cards = methods.map(m => m.credential).filter(Boolean).map(c => ({
    credential_id: c.credential_id,
    label: `${c.card_association_name || 'CARD'} •••• ${c.last_four_digits || '????'}`,
    brand: c.card_association_name || '',
    last4: c.last_four_digits || '',
  }));

  return res.json({ ok: true, cards, session: { userId, businessId, adAccountId, payAccountId, fb_dtsg } });
});

// ── POST /make-default ────────────────────────────────────────────────────────
router.post('/make-default', async (req, res) => {
  const { cookies: cookiesRaw, session, credential_id, proxy } = req.body || {};
  if (!credential_id) return res.json({ ok: false, reason: 'credential_id مطلوب' });
  if (!session)       return res.json({ ok: false, reason: 'بيانات الجلسة مطلوبة' });

  let cookie;
  try { cookie = buildCookieHeader(cookiesRaw); } catch (e) { return res.json({ ok: false, reason: e.message }); }

  const { userId, businessId, adAccountId, fb_dtsg } = session;
  const origin = 'https://business.facebook.com';

  try {
    const result = await graphql(origin, {
      av: userId, __user: userId, __bid: businessId, __aaid: adAccountId, fb_dtsg,
      fb_api_caller_class: 'RelayModern',
      fb_api_req_friendly_name: 'BillingSaveSharedBizCardStateMutation',
      variables: JSON.stringify({
        input: {
          payment_legacy_account_id: adAccountId,
          shared_biz_credential_id: credential_id,
          upl_logging_data: {
            context: 'billingaddpm', credential_id, credential_type: 'CREDIT_CARD',
            entry_point: 'BILLING_HUB',
            external_flow_id: `upl_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
            target_name: 'BillingSaveSharedBizCardStateMutation',
            user_session_id: `upl_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
            wizard_config_name: 'SELECT_PAYMENT_METHOD', wizard_name: 'ADD_PM_PUX_EP',
            wizard_session_id: `upl_wizard_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
          },
          actor_id: userId,
          client_mutation_id: Date.now().toString(),
        },
        includeCreateNewFromOldFragment: false,
      }),
      doc_id: '25126279877041501',
    }, cookie, proxy);

    if (result?.errors) return res.json({ ok: false, reason: result.errors[0]?.message || 'GraphQL error' });
    return res.json({ ok: true, message: 'تم تعيين الكارت كـ Default بنجاح ✅' });
  } catch (e) {
    return res.json({ ok: false, reason: e.message });
  }
});

export default router;
