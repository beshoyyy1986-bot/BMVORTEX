import express from 'express';
import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { getProxyManager } from '../utils/proxyManager.js';
import { resolveFbDtsg, extractActorId, buildCookieHeader } from '../utils/cookieParser.js';

const router = express.Router();
const FB_GRAPHQL_URL = 'https://business.facebook.com/api/graphql';

function getProxyConfig(proxyOption, customProxy) {
  const proxyManager = getProxyManager();
  let agent = null;

  if (proxyOption === 'custom' && customProxy) {
    try {
      agent = new HttpsProxyAgent(customProxy);
    } catch (e) {
      console.warn('Invalid custom proxy:', e.message);
    }
  } else if (proxyOption === 'random') {
    const proxy = proxyManager.getRandomProxy();
    if (proxy) {
      try {
        agent = new HttpsProxyAgent(proxy);
      } catch (e) {
        console.warn('Invalid random proxy:', e.message);
      }
    }
  }

  return agent ? { httpsAgent: agent, proxy: false } : {};
}


/**
 * Convert Ad Account to Prepaid
 * POST /api/funds/convert-prepaid
 */
router.post('/convert-prepaid', async (req, res) => {
  try {
    const { cookies, ad_account_id, actor_id, proxy_option, proxy } = req.body;

    if (!cookies || !ad_account_id) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: cookies, ad_account_id'
      });
    }

    // Extract fb_dtsg and actor_id from cookies if not provided
    const fb_dtsg = await resolveFbDtsg(cookies, undefined, proxy);
    const extractedActorId = actor_id || extractActorId(cookies);

    if (!fb_dtsg) {
      return res.status(400).json({
        success: false,
        error: 'Could not extract fb_dtsg from cookies. Please ensure you have valid Meta Business cookies.'
      });
    }

    console.log(`[FUNDS API] Converting account ${ad_account_id} to prepaid`);

    const variables = {
      input: {
        billable_account_payment_legacy_account_id: ad_account_id,
        logging_data: {
          logging_counter: 22,
          logging_id: '3418624251'
        },
        recurring_enabled: false,
        actor_id: String(extractedActorId),
        client_mutation_id: '3'
      }
    };

    const body = `__a=1&dpr=1&fb_dtsg=${encodeURIComponent(fb_dtsg)}&variables=${encodeURIComponent(JSON.stringify(variables))}&doc_id=4886770528075857`;

    const proxyConfig = getProxyConfig(proxy_option, proxy);
    const cookieHeader = buildCookieHeader(cookies);

    const response = await axios.post(FB_GRAPHQL_URL, body, {
      ...proxyConfig,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': '*/*',
        'Origin': 'https://business.facebook.com',
        'Referer': 'https://business.facebook.com/',
        ...(cookieHeader ? { 'Cookie': cookieHeader } : {})
      },
      timeout: 30000,
      validateStatus: () => true
    });

    if (response.data?.data?.billable_account_prepay_convert?.result) {
      const result = response.data.data.billable_account_prepay_convert.result;
      return res.json({
        success: result === 'COMPLETED' || result === 'SUCCESS',
        result,
        message: result === 'COMPLETED' || result === 'SUCCESS'
          ? 'Account converted to prepaid successfully'
          : `Conversion result: ${result}`,
        raw: response.data
      });
    }

    if (response.data?.errors) {
      return res.json({
        success: false,
        error: response.data.errors.map(e => e.message || e.description).join('; '),
        raw: response.data
      });
    }

    res.json({
      success: false,
      error: 'Unexpected response from Facebook',
      raw: response.data
    });
  } catch (err) {
    console.error('[FUNDS API] Convert prepaid error:', err.message);
    res.status(500).json({
      success: false,
      error: err.message || 'Internal server error'
    });
  }
});

/**
 * Fetch Cards from Payment Account
 * POST /api/funds/fetch-cards
 */
router.post('/fetch-cards', async (req, res) => {
  try {
    const { cookies, payment_account_id, proxy_option, proxy } = req.body;

    if (!cookies || !payment_account_id) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: cookies, payment_account_id'
      });
    }

    // Extract fb_dtsg from cookies
    const fb_dtsg = await resolveFbDtsg(cookies, undefined, proxy);

    if (!fb_dtsg) {
      return res.status(400).json({
        success: false,
        error: 'Could not extract fb_dtsg from cookies. Please ensure you have valid Meta Business cookies.'
      });
    }

    console.log(`[FUNDS API] Fetching cards for payment account ${payment_account_id}`);

    const variables = { paymentAccountID: payment_account_id };
    const body = `fb_dtsg=${encodeURIComponent(fb_dtsg)}&doc_id=29115481111399673&variables=${encodeURIComponent(JSON.stringify(variables))}`;

    const proxyConfig = getProxyConfig(proxy_option, proxy);
    const cookieHeader = buildCookieHeader(cookies);

    const response = await axios.post(`${FB_GRAPHQL_URL}/`, body, {
      ...proxyConfig,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': '*/*',
        'Origin': 'https://business.facebook.com',
        'Referer': 'https://business.facebook.com/',
        ...(cookieHeader ? { 'Cookie': cookieHeader } : {})
      },
      timeout: 30000,
      validateStatus: () => true
    });

    let methods = [];
    try {
      methods = response.data?.data?.billable_account_by_payment_account
        ?.billing_payment_account
        ?.billing_payment_methods || [];
    } catch (e) {
      console.warn('Could not extract payment methods:', e.message);
    }

    const cards = methods
      .filter(m => m.credential?.credential_type === 'CREDIT_CARD')
      .map(m => ({
        id: m.credential.credential_id,
        card_association: m.credential.card_association_name || 'Card',
        last_four: m.credential.last_four_digits || 'xxxx',
        usability: m.usability || null,
        text: `${m.credential.card_association_name || 'Card'} • ${m.credential.last_four_digits || 'xxxx'}${m.usability ? ` (${m.usability})` : ''}`
      }));

    res.json({
      success: true,
      cards,
      count: cards.length,
      raw: response.data
    });
  } catch (err) {
    console.error('[FUNDS API] Fetch cards error:', err.message);
    res.status(500).json({
      success: false,
      error: err.message || 'Internal server error'
    });
  }
});

/**
 * Enable Billing System
 * POST /api/funds/enable-billing
 */
router.post('/enable-billing', async (req, res) => {
  try {
    const { cookies, ad_account_id, actor_id, proxy_option, proxy } = req.body;

    if (!cookies || !ad_account_id) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: cookies, ad_account_id'
      });
    }

    // Extract fb_dtsg and actor_id from cookies if not provided
    const fb_dtsg = await resolveFbDtsg(cookies, undefined, proxy);
    const extractedActorId = actor_id || extractActorId(cookies);

    if (!fb_dtsg) {
      return res.status(400).json({
        success: false,
        error: 'Could not extract fb_dtsg from cookies. Please ensure you have valid Meta Business cookies.'
      });
    }

    console.log(`[FUNDS API] Enabling billing system for account ${ad_account_id}`);

    // Enable billing settings mutation
    const variables = {
      input: {
        billable_account_payment_legacy_account_id: ad_account_id,
        billing_settings: {
          billing_type: "PREPAID",
          auto_recharge: false,
          payment_method_type: "CREDIT_CARD"
        },
        actor_id: String(extractedActorId),
        client_mutation_id: `billing_${Date.now()}`
      }
    };

    const body = `__a=1&dpr=1&fb_dtsg=${encodeURIComponent(fb_dtsg)}&variables=${encodeURIComponent(JSON.stringify(variables))}&doc_id=5299726470049428`;

    const proxyConfig = getProxyConfig(proxy_option, proxy);
    const cookieHeader = buildCookieHeader(cookies);

    const response = await axios.post(FB_GRAPHQL_URL, body, {
      ...proxyConfig,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': '*/*',
        'Origin': 'https://business.facebook.com',
        'Referer': 'https://business.facebook.com/',
        ...(cookieHeader ? { 'Cookie': cookieHeader } : {})
      },
      timeout: 30000,
      validateStatus: () => true
    });

    if (response.data?.data?.billable_account_billing_settings_update?.result) {
      const result = response.data.data.billable_account_billing_settings_update.result;
      return res.json({
        success: result === 'COMPLETED' || result === 'SUCCESS',
        result,
        message: result === 'COMPLETED' || result === 'SUCCESS'
          ? 'Billing system enabled successfully'
          : `Billing activation result: ${result}`,
        raw: response.data
      });
    }

    if (response.data?.errors) {
      return res.json({
        success: false,
        error: response.data.errors.map(e => e.message || e.description).join('; '),
        raw: response.data
      });
    }

    res.json({
      success: false,
      error: 'Failed to enable billing system',
      raw: response.data
    });
  } catch (err) {
    console.error('[FUNDS API] Enable billing error:', err.message);
    res.status(500).json({
      success: false,
      error: err.message || 'Internal server error'
    });
  }
});

/**
 * Add Funds using Card
 * POST /api/funds/add-funds
 */
router.post('/add-funds', async (req, res) => {
  try {
    const { cookies, actor_id, payment_account_id, card_id, amount, proxy_option, proxy } = req.body;

    if (!cookies || !payment_account_id || !card_id || !amount) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: cookies, payment_account_id, card_id, amount'
      });
    }

    // Extract fb_dtsg and actor_id from cookies if not provided
    const fb_dtsg = await resolveFbDtsg(cookies, undefined, proxy);
    const extractedActorId = actor_id || extractActorId(cookies);

    if (!fb_dtsg) {
      return res.status(400).json({
        success: false,
        error: 'Could not extract fb_dtsg from cookies. Please ensure you have valid Meta Business cookies.'
      });
    }

    console.log(`[FUNDS API] Adding $${amount} funds to account ${payment_account_id}`);

    const docId = '8656399561129626';
    const variables = {
      input: {
        billable_account_payment_legacy_account_id: payment_account_id,
        credential_id: card_id,
        payment_amount: { amount: String(amount), currency: 'USD' },
        payment_credential_type: 'CC',
        actor_id: String(extractedActorId),
        client_mutation_id: `fund_${Date.now()}`,
        upl_logging_data: {
          context: 'billingaddfunds',
          credential_id: card_id,
          credential_type: 'CREDIT_CARD',
          target_name: 'BillingAddFundsStateMutation',
          entry_point: 'BILLING_HUB',
          wizard_name: 'ADD_FUNDS',
          wizard_config_name: 'ADD_FUNDS',
          wizard_screen_name: 'review_payment_state_display',
          wizard_session_id: `upl_wizard_${Date.now()}_static`,
          wizard_state_name: 'add_funds_state_decision'
        },
        platform_trust_token: '',
        client_info: {
          screen_width: 1600,
          screen_height: 900,
          color_depth: '24',
          java_enabled: false
        }
      }
    };

    const body = `fb_dtsg=${encodeURIComponent(fb_dtsg)}&doc_id=${docId}&variables=${encodeURIComponent(JSON.stringify(variables))}`;

    const proxyConfig = getProxyConfig(proxy_option, proxy);
    const cookieHeader = buildCookieHeader(cookies);

    const response = await axios.post(`${FB_GRAPHQL_URL}/`, body, {
      ...proxyConfig,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': '*/*',
        'Origin': 'https://business.facebook.com',
        'Referer': 'https://business.facebook.com/',
        ...(cookieHeader ? { 'Cookie': cookieHeader } : {})
      },
      timeout: 30000,
      validateStatus: () => true
    });

    if (response.data?.data?.billable_account_prepay_add_funds?.result === 'COMPLETED') {
      return res.json({
        success: true,
        result: 'COMPLETED',
        message: `$${amount} added successfully`,
        raw: response.data
      });
    }

    if (response.data?.errors) {
      return res.json({
        success: false,
        error: response.data.errors.map(e => e.message || e.description).join('; '),
        raw: response.data
      });
    }

    res.json({
      success: false,
      error: 'Fund addition failed',
      raw: response.data
    });
  } catch (err) {
    console.error('[FUNDS API] Add funds error:', err.message);
    res.status(500).json({
      success: false,
      error: err.message || 'Internal server error'
    });
  }
});

export default router;
