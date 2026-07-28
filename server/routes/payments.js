/**
 * Payment Tools routes — Remove Cards, Add Funds, Set Primary, Switch Old BM
 */
import express from 'express';
import { buildCookieHeader, getSession, extractAdAccountId, extractBusinessId } from '../utils/fbSession.js';

const router = express.Router();

// Normalize account_id / biz_id — accepts link, act_ form, or bare ID (unified with tools)
const normAcc = (v) => (v ? (extractAdAccountId(v) || v) : v);
const normBiz = (v) => (v ? (extractBusinessId(v) || v) : v);

function extractCards(obj, cards = [], depth = 0) {
  if (depth > 25 || !obj || typeof obj !== 'object') return cards;
  if (Array.isArray(obj)) { obj.forEach(i => extractCards(i, cards, depth + 1)); return cards; }
  const isCard = obj.last_four_digits || obj.card_association || obj.card_brand ||
    (obj.credential_type && String(obj.credential_type).includes('CARD'));
  if (isCard) {
    const cid = obj.credential_id || obj.id || obj.payment_method_id;
    if (cid && !cards.find(c => c.id === cid)) {
      let n = obj.card_association_name
        ? `${obj.card_association_name} •••• ${obj.last_four_digits}`
        : obj.card_brand ? `${obj.card_brand} •••• ${obj.last_four_digits}` : `Card •••• ${obj.last_four_digits}`;
      if (obj.expiry_month && obj.expiry_year) n += ` (${obj.expiry_month}/${obj.expiry_year})`;
      if (obj.is_expired) n += ' [منتهية]';
      cards.push({ id: cid, name: n, icon: '💳', isPrimary: obj.is_primary || false });
    }
  }
  if (obj.__typename === 'StoredBalance' || obj.credential_type === 'ADS_STORED_BALANCE') {
    const cid = obj.id;
    if (cid && !cards.find(c => c.id === cid)) {
      let n = 'رصيد مخزن';
      if (obj.balance_amount) n += ` (${obj.balance_amount.amount_with_offset} ${obj.balance_amount.currency})`;
      cards.push({ id: cid, name: n, icon: '💰', isPrimary: false });
    }
  }
  if (obj.__typename === 'PayPalBillingAgreement' || obj.credential_type === 'PAYPAL') {
    const cid = obj.id || obj.credential_id;
    if (cid && !cards.find(c => c.id === cid))
      cards.push({ id: cid, name: 'PayPal' + (obj.email ? ` - ${obj.email}` : ''), icon: '🅿️', isPrimary: false });
  }
  if (obj.__typename === 'BankAccount' || obj.credential_type === 'BANK_ACCOUNT') {
    const cid = obj.id || obj.credential_id;
    if (cid && !cards.find(c => c.id === cid))
      cards.push({ id: cid, name: 'حساب بنكي' + (obj.last_four_digits ? ` •••• ${obj.last_four_digits}` : ''), icon: '🏦', isPrimary: false });
  }
  for (const k in obj) { if (Object.prototype.hasOwnProperty.call(obj, k)) extractCards(obj[k], cards, depth + 1); }
  return cards;
}

// ── POST /api/payments/fetch-cards ─────────────────────────────────────────
router.post('/fetch-cards', async (req, res) => {
  const { cookies, account_id: accountRaw } = req.body || {};
  let cookieStr;
  try { cookieStr = buildCookieHeader(cookies); } catch (e) { return res.json({ ok: false, reason: e.message }); }
  const account_id = normAcc(accountRaw);
  if (!account_id) return res.json({ ok: false, reason: 'account_id مطلوب' });

  try {
    const auth = await getSession(cookieStr);
    if (!auth) return res.json({ ok: false, reason: 'Session غير صالح — تحقق من الكوكيز' });

    const body = new URLSearchParams({
      fb_api_req_friendly_name: 'BillingHubPaymentSettingsPaymentMethodsListQuery',
      doc_id: '27256525040665408',
      variables: JSON.stringify({ paymentAccountID: account_id, assetID: account_id }),
      fb_dtsg: auth.dtsg, __user: auth.userId, av: auth.userId, server_timestamps: 'true',
    }).toString();

    const apiRes = await fetch('https://business.facebook.com/api/graphql/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie: cookieStr, 'User-Agent': 'Mozilla/5.0' },
      body,
    });
    const json = await apiRes.json();
    if (json.errors) return res.json({ ok: false, reason: json.errors[0]?.message || 'GraphQL Error' });
    res.json({ ok: true, cards: extractCards(json), userId: auth.userId });
  } catch (e) {
    res.json({ ok: false, reason: e.message });
  }
});

// ── POST /api/payments/remove-card ─────────────────────────────────────────
router.post('/remove-card', async (req, res) => {
  const { cookies, account_id: accountRaw, card_id, biz_id: bizRaw } = req.body || {};
  let cookieStr;
  try { cookieStr = buildCookieHeader(cookies); } catch (e) { return res.json({ ok: false, reason: e.message }); }
  const account_id = normAcc(accountRaw);
  const biz_id = normBiz(bizRaw);
  if (!account_id || !card_id) return res.json({ ok: false, reason: 'account_id + card_id مطلوبين' });

  try {
    const auth = await getSession(cookieStr);
    if (!auth) return res.json({ ok: false, reason: 'Session غير صالح' });

    const uuid = crypto.randomUUID();
    const flowId = `upl_${Math.floor(Date.now() / 1000)}_${uuid}`;
    const body = new URLSearchParams({
      fb_api_req_friendly_name: 'useBillingRemovePMMutation',
      doc_id: '9195168280589012',
      variables: JSON.stringify({
        input: {
          payment_account_id: account_id, payment_method_id: card_id,
          upl_logging_data: {
            billing_notification_id: '', context: 'billingremovepm', entry_point: 'BILLING_HUB',
            external_flow_id: flowId, target_name: 'useBillingRemovePMMutation',
            user_session_id: flowId, business_id: biz_id || auth.bizId || '',
            wizard_config_name: 'REMOVE_PM', wizard_name: 'REMOVE_PM',
            wizard_screen_name: 'remove_pm_state_display',
            wizard_session_id: `upl_wizard_${Date.now()}_${uuid}`,
          },
          actor_id: auth.userId,
          client_mutation_id: Math.floor(Math.random() * 100).toString(),
        },
      }),
      fb_dtsg: auth.dtsg, __user: auth.userId, av: auth.userId, server_timestamps: 'true',
    }).toString();

    const apiRes = await fetch('https://business.facebook.com/api/graphql/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie: cookieStr, 'User-Agent': 'Mozilla/5.0' },
      body,
    });
    const json = await apiRes.json();
    if (json.errors) return res.json({ ok: false, reason: json.errors[0]?.message || 'GraphQL Error' });
    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false, reason: e.message });
  }
});

// ── POST /api/payments/add-funds ───────────────────────────────────────────
router.post('/add-funds', async (req, res) => {
  const { cookies, account_id: accountRaw, card_id, amount } = req.body || {};
  let cookieStr;
  try { cookieStr = buildCookieHeader(cookies); } catch (e) { return res.json({ ok: false, reason: e.message }); }
  const account_id = normAcc(accountRaw);
  if (!account_id || !card_id || !amount) return res.json({ ok: false, reason: 'account_id + card_id + amount مطلوبين' });

  try {
    const auth = await getSession(cookieStr);
    if (!auth) return res.json({ ok: false, reason: 'Session غير صالح' });

    const body = new URLSearchParams({
      fb_dtsg: auth.dtsg, doc_id: '8656399561129626',
      variables: JSON.stringify({
        input: {
          billable_account_payment_legacy_account_id: account_id,
          credential_id: card_id,
          payment_amount: { amount: String(amount), currency: 'USD' },
          payment_credential_type: 'CC', actor_id: auth.userId,
          client_mutation_id: `fund_${Date.now()}`,
          upl_logging_data: {
            context: 'billingaddfunds', credential_id: card_id, credential_type: 'CREDIT_CARD',
            target_name: 'BillingAddFundsStateMutation', entry_point: 'BILLING_HUB',
            wizard_name: 'ADD_FUNDS', wizard_config_name: 'ADD_FUNDS',
            wizard_screen_name: 'add_funds_state_decision',
            wizard_session_id: `upl_wizard_${Date.now()}_${crypto.randomUUID()}`,
            wizard_state_name: 'review_payment_state_display',
          },
          platform_trust_token: '',
          client_info: { screen_width: 1600, screen_height: 900, color_depth: '24', java_enabled: false },
        },
      }),
      __user: auth.userId, av: auth.userId, server_timestamps: 'true',
    }).toString();

    const apiRes = await fetch('https://business.facebook.com/api/graphql/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie: cookieStr, 'User-Agent': 'Mozilla/5.0' },
      body,
    });
    const json = await apiRes.json();
    if (json.errors) return res.json({ ok: false, reason: json.errors[0]?.message || 'GraphQL Error' });
    const result = json?.data?.billable_account_prepay_add_funds?.result;
    if (result === 'COMPLETED') return res.json({ ok: true, result });
    return res.json({ ok: false, reason: `فشلت العملية: ${result || JSON.stringify(json?.data).slice(0, 200)}` });
  } catch (e) {
    res.json({ ok: false, reason: e.message });
  }
});

// ── POST /api/payments/set-primary ─────────────────────────────────────────
router.post('/set-primary', async (req, res) => {
  const { cookies, account_id: accountRaw, card_id } = req.body || {};
  let cookieStr;
  try { cookieStr = buildCookieHeader(cookies); } catch (e) { return res.json({ ok: false, reason: e.message }); }
  const account_id = normAcc(accountRaw);
  if (!account_id || !card_id) return res.json({ ok: false, reason: 'account_id + card_id مطلوبين' });

  try {
    const auth = await getSession(cookieStr);
    if (!auth) return res.json({ ok: false, reason: 'Session غير صالح' });

    const uuid = crypto.randomUUID();
    const flowId = `upl_${Math.floor(Date.now() / 1000)}_${uuid}`;
    const body = new URLSearchParams({
      fb_api_req_friendly_name: 'BillingMakePrimaryStateMutation',
      doc_id: '24268156329457050',
      variables: JSON.stringify({
        input: {
          billable_account_payment_legacy_account_id: account_id, primary_funding_id: card_id,
          upl_logging_data: {
            billing_notification_id: '', context: 'billingaddpm', credential_id: card_id,
            entry_point: 'ads_manager', external_flow_id: flowId,
            target_name: 'BillingMakePrimaryStateMutation', user_session_id: flowId,
            wizard_config_name: 'MAKE_PRIMARY', wizard_name: 'MAKE_PRIMARY',
            wizard_screen_name: 'make_primary_display_state_display',
            wizard_session_id: `upl_wizard_${Date.now()}_${uuid}`,
          },
          actor_id: auth.userId,
          client_mutation_id: Math.floor(Math.random() * 100).toString(),
        },
      }),
      fb_dtsg: auth.dtsg, __user: auth.userId, av: auth.userId, server_timestamps: 'true',
    }).toString();

    const apiRes = await fetch('https://business.facebook.com/api/graphql/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie: cookieStr, 'User-Agent': 'Mozilla/5.0' },
      body,
    });
    const json = await apiRes.json();
    if (json.errors) return res.json({ ok: false, reason: json.errors[0]?.message || 'GraphQL Error' });
    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false, reason: e.message });
  }
});

// ── POST /api/payments/switch-old ──────────────────────────────────────────
router.post('/switch-old', async (req, res) => {
  const { cookies, biz_id } = req.body || {};
  let cookieStr;
  try { cookieStr = buildCookieHeader(cookies); } catch (e) { return res.json({ ok: false, reason: e.message }); }

  try {
    const auth = await getSession(cookieStr);
    if (!auth) return res.json({ ok: false, reason: 'Session غير صالح' });

    const bmId = biz_id || auth.bizId;
    if (!bmId) return res.json({ ok: false, reason: 'Business ID مطلوب — أدخله يدوياً' });

    const body = new URLSearchParams({
      av: auth.userId, __user: auth.userId, __a: '1', __comet_req: '11',
      fb_dtsg: auth.dtsg, __jssesw: '1',
      fb_api_caller_class: 'RelayModern',
      fb_api_req_friendly_name: 'BizKitSetBMCOptinStatusMutation',
      variables: JSON.stringify({ input: { client_mutation_id: '4', actor_id: auth.userId, bmc_optin_status: 'OPT_OUT' } }),
      server_timestamps: 'true', doc_id: '8398852550167223',
    }).toString();

    const apiRes = await fetch('https://business.facebook.com/api/graphql/?_callFlowletID=10709&_triggerFlowletID=10704', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie: cookieStr, 'User-Agent': 'Mozilla/5.0' },
      body,
    });
    const json = await apiRes.json();
    if (json.errors) return res.json({ ok: false, reason: json.errors[0]?.message || 'API Error' });
    res.json({ ok: true, biz_id: bmId, redirect: `https://business.facebook.com/settings/?business_id=${bmId}&enable_redirection=0` });
  } catch (e) {
    res.json({ ok: false, reason: e.message });
  }
});

export default router;
