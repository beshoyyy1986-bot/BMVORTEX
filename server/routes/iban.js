import express from 'express';
import facebookApi from '../services/facebookApi.js';

const router = express.Router();

/**
 * Generate Verified IBAN
 * POST /api/iban/generate
 */
router.post('/generate', async (req, res) => {
  try {
    const { country = 'DE' } = req.body;

    console.log(`[IBAN API] Generating test IBAN for country: ${country}`);

    const iban = facebookApi.generateTestIBAN(country);
    const isValid = facebookApi.validateIBAN(iban);

    if (isValid) {
      res.json({
        success: true,
        iban,
        country,
        isValid,
        message: 'IBAN generated and validated successfully',
        warning: 'This is a generated test IBAN. Use real banking details for production.'
      });
    } else {
      res.status(400).json({
        success: false,
        error: 'Generated IBAN failed validation',
        iban
      });
    }

  } catch (error) {
    console.error('[IBAN API] Error generating IBAN:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Validate IBAN format
 * POST /api/iban/validate
 */
router.post('/validate', async (req, res) => {
  try {
    const { iban } = req.body;

    if (!iban) {
      return res.status(400).json({ success: false, error: 'iban is required' });
    }

    const cleanIBAN = iban.replace(/\s/g, '').toUpperCase();
    const isValid = facebookApi.validateIBAN(cleanIBAN);

    // Extract country code
    const countryCode = cleanIBAN.substring(0, 2);

    // Expected length by country (subset)
    const expectedLengths = {
      'DE': 22, 'AT': 20, 'BE': 16, 'BG': 22, 'HR': 21,
      'CY': 28, 'CZ': 24, 'DK': 18, 'EE': 20, 'FI': 18,
      'FR': 27, 'GB': 22, 'GR': 27, 'HU': 28, 'IS': 26,
      'IE': 22, 'IT': 27, 'LV': 21, 'LI': 21, 'LT': 20,
      'LU': 20, 'MT': 31, 'NL': 18, 'NO': 15, 'PL': 28,
      'PT': 25, 'RO': 24, 'SK': 24, 'SI': 19, 'ES': 24,
      'SE': 24, 'CH': 21
    };

    const expectedLength = expectedLengths[countryCode];
    const actualLength = cleanIBAN.length;
    const lengthValid = !expectedLength || actualLength === expectedLength;

    res.json({
      success: true,
      iban: cleanIBAN,
      country: countryCode,
      isValid: isValid && lengthValid,
      checks: {
        format: /^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(cleanIBAN),
        mod97: isValid,
        length: lengthValid,
        expectedLength: expectedLength || 'unknown'
      }
    });

  } catch (error) {
    console.error('[IBAN API] Error validating IBAN:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Add IBAN to Ad Account
 * POST /api/iban/add-to-ad-account
 */
router.post('/add-to-ad-account', async (req, res) => {
  try {
    const {
      access_token,
      ad_account_id,
      iban,
      account_holder_name,
      bank_name,
      country = 'DE',
      billing_address_street,
      billing_address_city,
      billing_address_state,
      billing_address_zip,
      proxy_option = 'none',
      custom_proxy
    } = req.body;

    console.log(`[IBAN API] Adding IBAN to ad account: ${ad_account_id}`);

    if (!access_token) {
      return res.status(400).json({ success: false, error: 'access_token is required' });
    }
    if (!ad_account_id) {
      return res.status(400).json({ success: false, error: 'ad_account_id is required' });
    }
    if (!iban) {
      return res.status(400).json({ success: false, error: 'iban is required' });
    }
    if (!account_holder_name) {
      return res.status(400).json({ success: false, error: 'account_holder_name is required' });
    }

    // Validate IBAN first
    const cleanIBAN = iban.replace(/\s/g, '').toUpperCase();
    const isValid = facebookApi.validateIBAN(cleanIBAN);
    if (!isValid) {
      return res.status(400).json({ success: false, error: 'Invalid IBAN format' });
    }

    // Add IBAN to ad account
    const result = await facebookApi.addIBANToAdAccount(
      access_token,
      ad_account_id,
      {
        iban: cleanIBAN,
        account_holder_name,
        bank_name,
        country,
        billing_address_street,
        billing_address_city,
        billing_address_state,
        billing_address_zip
      },
      proxy_option,
      custom_proxy
    );

    if (result.success) {
      res.json({
        success: true,
        message: 'IBAN successfully added to Ad Account',
        paymentMethodId: result.paymentMethodId,
        iban: cleanIBAN,
        data: result.data
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error,
        step: 'add_iban_to_ad_account'
      });
    }

  } catch (error) {
    console.error('[IBAN API] Error adding IBAN:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Get IBAN status for Ad Account
 * POST /api/iban/status
 */
router.post('/status', async (req, res) => {
  try {
    const { access_token, ad_account_id, proxy_option = 'none', custom_proxy } = req.body;

    if (!access_token || !ad_account_id) {
      return res.status(400).json({ success: false, error: 'access_token and ad_account_id are required' });
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
          fields: 'payment_method_details,business_name'
        }
      }
    );

    const paymentMethods = response.data?.payment_method_details?.data || [];
    const ibanMethods = paymentMethods.filter(pm => 
      pm.payment_method_type === 'DIRECT_DEBIT' || 
      pm.provider === 'DIRECT_DEBIT'
    );

    res.json({
      success: true,
      adAccountId: ad_account_id,
      hasIBAN: ibanMethods.length > 0,
      ibanMethods: ibanMethods.map(m => ({
        id: m.id,
        provider: m.provider,
        type: m.payment_method_type,
        status: m.status,
        isPrimary: m.is_primary
      })),
      allPaymentMethods: paymentMethods.length
    });

  } catch (error) {
    console.error('[IBAN API] Error getting IBAN status:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
