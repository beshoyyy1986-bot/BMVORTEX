import express from 'express';
import facebookApi from '../services/facebookApi.js';

const router = express.Router();

/**
 * Generate PayPal linking session
 * POST /api/paypal/generate-session
 */
router.post('/generate-session', async (req, res) => {
  try {
    const {
      access_token,
      ad_account_id,
      return_url,
      proxy_option = 'none',
      custom_proxy
    } = req.body;

    console.log(`[PayPal API] Generating session for ad account: ${ad_account_id}`);

    if (!access_token) {
      return res.status(400).json({ success: false, error: 'access_token is required' });
    }
    if (!ad_account_id) {
      return res.status(400).json({ success: false, error: 'ad_account_id is required' });
    }

    const result = await facebookApi.generatePayPalLinkSession(
      access_token,
      ad_account_id,
      proxy_option,
      custom_proxy
    );

    if (result.success) {
      res.json({
        success: true,
        message: result.message,
        sessionData: {
          paypalUrl: result.paypalUrl || result.manualUrl,
          sessionToken: result.sessionToken,
          adAccountId: ad_account_id,
          requiresPopup: true
        }
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error,
        step: 'generate_session'
      });
    }

  } catch (error) {
    console.error('[PayPal API] Error generating session:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Verify PayPal linking status
 * POST /api/paypal/verify
 */
router.post('/verify', async (req, res) => {
  try {
    const {
      access_token,
      ad_account_id,
      proxy_option = 'none',
      custom_proxy
    } = req.body;

    console.log(`[PayPal API] Verifying PayPal link for ad account: ${ad_account_id}`);

    if (!access_token || !ad_account_id) {
      return res.status(400).json({ success: false, error: 'access_token and ad_account_id are required' });
    }

    const result = await facebookApi.verifyPayPalLink(
      access_token,
      ad_account_id,
      proxy_option,
      custom_proxy
    );

    if (result.success) {
      res.json({
        success: true,
        isLinked: result.isLinked,
        message: result.isLinked ? 'PayPal is linked to this ad account' : 'PayPal is not yet linked',
        paypalMethod: result.paypalMethod,
        allPaymentMethods: result.allMethods
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error,
        step: 'verify_paypal'
      });
    }

  } catch (error) {
    console.error('[PayPal API] Error verifying PayPal:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Complete PayPal linking after user authorization
 * POST /api/paypal/complete
 */
router.post('/complete', async (req, res) => {
  try {
    const {
      access_token,
      ad_account_id,
      session_token,
      paypal_email,
      proxy_option = 'none',
      custom_proxy
    } = req.body;

    console.log(`[PayPal API] Completing PayPal link for ad account: ${ad_account_id}`);

    if (!access_token || !ad_account_id) {
      return res.status(400).json({ success: false, error: 'access_token and ad_account_id are required' });
    }

    const client = (await import('axios')).default;
    const proxyManager = (await import('../utils/proxyManager.js')).getProxyManager();
    const proxyConfig = proxyManager.createAxiosConfig(proxy_option, custom_proxy, 'facebook');
    const fbClient = client.create({ timeout: 30000, ...proxyConfig });

    // Attempt to complete the PayPal linking
    // This may need custom handling based on Facebook's OAuth flow
    let verificationResponse;
    try {
      // First verify if PayPal was linked
      const verifyResult = await facebookApi.verifyPayPalLink(access_token, ad_account_id, proxy_option, custom_proxy);
      
      if (verifyResult.isLinked) {
        res.json({
          success: true,
          message: 'PayPal successfully linked to ad account',
          isLinked: true,
          paypalMethod: verifyResult.paypalMethod
        });
        return;
      }

      // If not linked, try to force sync payment methods
      verificationResponse = await fbClient.post(
        `https://graph.facebook.com/v18.0/act_${ad_account_id}`,
        {
          access_token,
          has_migrated_payment: true
        }
      );

      // Verify again
      const finalCheck = await facebookApi.verifyPayPalLink(access_token, ad_account_id, proxy_option, custom_proxy);
      
      res.json({
        success: finalCheck.isLinked,
        message: finalCheck.isLinked 
          ? 'PayPal successfully linked to ad account' 
          : 'PayPal linking pending. User must complete authorization in popup.',
        isLinked: finalCheck.isLinked,
        paypalMethod: finalCheck.paypalMethod
      });

    } catch (error) {
      res.status(400).json({
        success: false,
        error: error.response?.data?.error?.message || error.message,
        step: 'complete_paypal_link'
      });
    }

  } catch (error) {
    console.error('[PayPal API] Error completing PayPal link:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Disconnect PayPal from Ad Account
 * POST /api/paypal/disconnect
 */
router.post('/disconnect', async (req, res) => {
  try {
    const { access_token, ad_account_id, payment_method_id, proxy_option = 'none', custom_proxy } = req.body;

    if (!access_token || !ad_account_id || !payment_method_id) {
      return res.status(400).json({ success: false, error: 'access_token, ad_account_id, and payment_method_id are required' });
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
      message: 'PayPal disconnected successfully',
      data: response.data
    });

  } catch (error) {
    console.error('[PayPal API] Error disconnecting PayPal:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
