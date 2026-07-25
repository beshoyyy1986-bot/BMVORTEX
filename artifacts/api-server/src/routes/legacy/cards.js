import express from 'express';
import facebookApi from '../services/facebookApi.js';

const router = express.Router();

// Validate card data
const validateCardData = (req, res, next) => {
  const { card_number, card_expiry_month, card_expiry_year, card_csc, card_holder_name } = req.body;
  if (!card_number || !card_expiry_month || !card_expiry_year || !card_csc || !card_holder_name) {
    return res.status(400).json({
      success: false,
      error: 'Missing required card fields: card_number, card_expiry_month, card_expiry_year, card_csc, card_holder_name'
    });
  }
  next();
};

/**
 * Link card to Business Manager
 * POST /api/cards/add-to-business-manager
 */
router.post('/add-to-business-manager', validateCardData, async (req, res) => {
  try {
    const {
      access_token,
      business_manager_id,
      card_number,
      card_expiry_month,
      card_expiry_year,
      card_csc,
      card_holder_name,
      billing_address_street,
      billing_address_city,
      billing_address_state,
      billing_address_zip,
      billing_address_country = 'US',
      proxy_option = 'none',
      custom_proxy
    } = req.body;

    console.log(`[Cards API] Adding card to Business Manager: ${business_manager_id}`);

    if (!business_manager_id) {
      return res.status(400).json({ success: false, error: 'business_manager_id is required' });
    }

    const result = await facebookApi.addCardToBusinessManager(
      access_token,
      business_manager_id,
      {
        card_number: card_number.replace(/\s/g, ''),
        card_expiry_month,
        card_expiry_year,
        card_csc,
        card_holder_name,
        billing_address_street,
        billing_address_city,
        billing_address_state,
        billing_address_zip,
        billing_address_country
      },
      proxy_option,
      custom_proxy
    );

    if (result.success) {
      res.json({
        success: true,
        message: 'Card successfully added to Business Manager',
        paymentMethodId: result.paymentMethodId,
        data: result.data
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error,
        step: 'add_to_business_manager'
      });
    }

  } catch (error) {
    console.error('[Cards API] Error adding card to BM:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Link card directly to Ad Account billing
 * POST /api/cards/add-to-ad-account
 */
router.post('/add-to-ad-account', validateCardData, async (req, res) => {
  try {
    const {
      access_token,
      ad_account_id,
      card_number,
      card_expiry_month,
      card_expiry_year,
      card_csc,
      card_holder_name,
      billing_address_street,
      billing_address_city,
      billing_address_state,
      billing_address_zip,
      billing_address_country = 'US',
      proxy_option = 'none',
      custom_proxy
    } = req.body;

    console.log(`[Cards API] Adding card to Ad Account: ${ad_account_id}`);

    if (!ad_account_id) {
      return res.status(400).json({ success: false, error: 'ad_account_id is required' });
    }

    const result = await facebookApi.addCardToAdAccount(
      access_token,
      ad_account_id,
      {
        card_number: card_number.replace(/\s/g, ''),
        card_expiry_month,
        card_expiry_year,
        card_csc,
        card_holder_name,
        billing_address_street,
        billing_address_city,
        billing_address_state,
        billing_address_zip,
        billing_address_country
      },
      proxy_option,
      custom_proxy
    );

    if (result.success) {
      res.json({
        success: true,
        message: 'Card successfully added to Ad Account billing',
        paymentMethodId: result.paymentMethodId,
        data: result.data
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error,
        step: 'add_to_ad_account'
      });
    }

  } catch (error) {
    console.error('[Cards API] Error adding card to Ad Account:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Fetch cards from Business Manager and link to Ad Account
 * POST /api/cards/fetch-from-bm
 */
router.post('/fetch-from-bm', async (req, res) => {
  try {
    const {
      access_token,
      business_manager_id,
      ad_account_id,
      proxy_option = 'none',
      custom_proxy
    } = req.body;

    console.log(`[Cards API] Fetching cards from BM ${business_manager_id} to ad account ${ad_account_id}`);

    if (!business_manager_id) {
      return res.status(400).json({ success: false, error: 'business_manager_id is required' });
    }
    if (!ad_account_id) {
      return res.status(400).json({ success: false, error: 'ad_account_id is required' });
    }

    const result = await facebookApi.fetchCardsFromBusinessManager(
      access_token,
      business_manager_id,
      ad_account_id,
      proxy_option,
      custom_proxy
    );

    if (result.success) {
      res.json({
        success: true,
        message: `Successfully fetched and linked ${result.totalLinked} cards from Business Manager`,
        paymentMethods: result.paymentMethods,
        linkedMethods: result.linkedMethods,
        totalAvailable: result.paymentMethods.length,
        totalLinked: result.totalLinked
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error,
        step: 'fetch_from_business_manager'
      });
    }

  } catch (error) {
    console.error('[Cards API] Error fetching cards from BM:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Get payment methods for Ad Account
 * POST /api/cards/list-ad-account
 */
router.post('/list-ad-account', async (req, res) => {
  try {
    const { access_token, ad_account_id, proxy_option = 'none', custom_proxy } = req.body;

    if (!ad_account_id) {
      return res.status(400).json({ success: false, error: 'ad_account_id is required' });
    }

    const client = (await import('axios')).default;
    const proxyManager = (await import('../utils/proxyManager.js')).getProxyManager();
    const proxyConfig = proxyManager.createAxiosConfig(proxy_option, custom_proxy, 'facebook');
    const fbClient = client.create({ timeout: 30000, ...proxyConfig });

    const response = await fbClient.get(
      `https://graph.facebook.com/v18.0/act_${ad_account_id}`,
      {
        params: {
          access_token,
          fields: 'payment_method_details,has_migrated_payment'
        }
      }
    );

    const paymentMethods = response.data?.payment_method_details?.data || [];

    res.json({
      success: true,
      paymentMethods: paymentMethods.map(pm => ({
        id: pm.id,
        provider: pm.provider,
        type: pm.payment_method_type,
        lastFour: pm.last_four,
        expiryMonth: pm.expiry_month,
        expiryYear: pm.expiry_year,
        isPrimary: pm.is_primary
      }))
    });

  } catch (error) {
    console.error('[Cards API] Error listing payment methods:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Delete payment method from Ad Account
 * POST /api/cards/delete-from-ad-account
 */
router.post('/delete-from-ad-account', async (req, res) => {
  try {
    const { access_token, ad_account_id, payment_method_id, proxy_option = 'none', custom_proxy } = req.body;

    if (!ad_account_id || !payment_method_id) {
      return res.status(400).json({ success: false, error: 'ad_account_id and payment_method_id are required' });
    }

    const client = (await import('axios')).default;
    const proxyManager = (await import('../utils/proxyManager.js')).getProxyManager();
    const proxyConfig = proxyManager.createAxiosConfig(proxy_option, custom_proxy, 'facebook');
    const fbClient = client.create({ timeout: 30000, ...proxyConfig });

    const response = await fbClient.delete(
      `https://graph.facebook.com/v18.0/act_${ad_account_id}/paymentmethoddetails`,
      {
        params: {
          payment_method_id,
          access_token
        }
      }
    );

    res.json({
      success: true,
      message: 'Payment method removed successfully',
      data: response.data
    });

  } catch (error) {
    console.error('[Cards API] Error deleting payment method:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
