import express from 'express';
import axios from 'axios';
import { getProxyConfig } from '../utils/proxyManager.js';
import { resolveFbDtsg, extractActorId, buildCookieHeader } from '../utils/cookieParser.js';

const router = express.Router();
const FB_GRAPHQL_URL = 'https://business.facebook.com/api/graphql';

/**
 * Create Partnership Ad
 * POST /api/ads/partnership
 */
router.post('/partnership', async (req, res) => {
  try {
    const {
      cookies,
      ad_account_id,
      partner_code,
      audience_id,
      daily_budget,
      days,
      publish_mode = 'active', // active | paused
      proxy_option,
      proxy
    } = req.body;

    if (!cookies || !ad_account_id || !partner_code) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: cookies, ad_account_id, partner_code'
      });
    }

    // Extract fb_dtsg and actor_id from cookies
    const fb_dtsg = await resolveFbDtsg(cookies, undefined, proxy);
    const actor_id = extractActorId(cookies);

    if (!fb_dtsg) {
      return res.status(400).json({
        success: false,
        error: 'Could not extract fb_dtsg from cookies. Please ensure you have valid Meta Business cookies.'
      });
    }

    console.log(`[PARTNERSHIP API] Creating partnership ad for account ${ad_account_id}`);

    // Step 1: Create Campaign
    const campaignVariables = {
      input: {
        name: `Partnership_${partner_code}_${Date.now()}`,
        objective: 'LINK_CLICKS',
        status: publish_mode.toUpperCase(),
        special_ad_categories: [],
        ad_account_id: ad_account_id
      }
    };

    const campaignBody = `__a=1&dpr=1&fb_dtsg=${encodeURIComponent(fb_dtsg)}&variables=${encodeURIComponent(JSON.stringify(campaignVariables))}&doc_id=4886770528075857`;

    const proxyConfig = getProxyConfig(proxy_option, proxy);
    const cookieHeader = buildCookieHeader(cookies);

    const campaignResponse = await axios.post(FB_GRAPHQL_URL, campaignBody, {
      ...proxyConfig,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': '*/*',
        'Origin': 'https://business.facebook.com',
        'Referer': 'https://business.facebook.com/',
        ...(cookieHeader ? { 'Cookie': cookieHeader } : {})
      },
      timeout: 30000
    });

    if (!campaignResponse.data?.data?.campaign_create) {
      return res.json({
        success: false,
        error: 'Failed to create campaign',
        raw: campaignResponse.data
      });
    }

    const campaignId = campaignResponse.data.data.campaign_create.id;

    // Step 2: Create Ad Set
    const startTime = Math.floor(Date.now() / 1000);
    const endTime = startTime + (days * 24 * 60 * 60);

    const adSetVariables = {
      input: {
        name: `AdSet_${partner_code}_${Date.now()}`,
        campaign_id: campaignId,
        daily_budget: Math.round(daily_budget * 100), // Convert to cents
        billing_event: 'IMPRESSIONS',
        optimization_goal: 'LINK_CLICKS',
        bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
        targeting: {
          geo_locations: { countries: ['US'] },
          custom_audiences: audience_id ? [{ id: audience_id }] : []
        },
        start_time: startTime,
        end_time: endTime,
        status: publish_mode.toUpperCase(),
        ad_account_id: ad_account_id
      }
    };

    const adSetBody = `__a=1&dpr=1&fb_dtsg=${encodeURIComponent(fb_dtsg)}&variables=${encodeURIComponent(JSON.stringify(adSetVariables))}&doc_id=4886770528075857`;

    const adSetResponse = await axios.post(FB_GRAPHQL_URL, adSetBody, {
      ...proxyConfig,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': '*/*',
        'Origin': 'https://business.facebook.com',
        'Referer': 'https://business.facebook.com/',
        ...(cookieHeader ? { 'Cookie': cookieHeader } : {})
      },
      timeout: 30000
    });

    if (!adSetResponse.data?.data?.adset_create) {
      return res.json({
        success: false,
        error: 'Failed to create ad set',
        raw: adSetResponse.data
      });
    }

    const adSetId = adSetResponse.data.data.adset_create.id;

    // Step 3: Create Ad (Partnership Ad)
    const adVariables = {
      input: {
        name: `Partnership_Ad_${partner_code}_${Date.now()}`,
        adset_id: adSetId,
        creative: {
          creative_id: null
        },
        status: publish_mode.toUpperCase(),
        ad_account_id: ad_account_id,
        partnership_ad_code: partner_code
      }
    };

    const adBody = `__a=1&dpr=1&fb_dtsg=${encodeURIComponent(fb_dtsg)}&variables=${encodeURIComponent(JSON.stringify(adVariables))}&doc_id=4886770528075857`;

    const adResponse = await axios.post(FB_GRAPHQL_URL, adBody, {
      ...proxyConfig,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': '*/*',
        'Origin': 'https://business.facebook.com',
        'Referer': 'https://business.facebook.com/',
        ...(cookieHeader ? { 'Cookie': cookieHeader } : {})
      },
      timeout: 30000
    });

    if (adResponse.data?.data?.ad_create) {
      return res.json({
        success: true,
        campaignId,
        adSetId,
        adId: adResponse.data.data.ad_create.id,
        partnerCode: partner_code,
        publishMode: publish_mode,
        message: 'Partnership ad created successfully',
        raw: adResponse.data
      });
    }

    if (adResponse.data?.errors) {
      return res.json({
        success: false,
        error: adResponse.data.errors.map(e => e.message || e.description).join('; '),
        raw: adResponse.data
      });
    }

    res.json({
      success: false,
      error: 'Failed to create partnership ad',
      raw: adResponse.data
    });
  } catch (err) {
    console.error('[PARTNERSHIP API] Error:', err.message);
    res.status(500).json({
      success: false,
      error: err.message || 'Internal server error'
    });
  }
});

/**
 * Activate Paused Ad
 * POST /api/ads/activate
 */
router.post('/activate', async (req, res) => {
  try {
    const { cookies, ad_id, proxy_option, proxy } = req.body;

    if (!cookies || !ad_id) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: cookies, ad_id'
      });
    }

    const fb_dtsg = await resolveFbDtsg(cookies, undefined, proxy);

    if (!fb_dtsg) {
      return res.status(400).json({
        success: false,
        error: 'Could not extract fb_dtsg from cookies. Please ensure you have valid Meta Business cookies.'
      });
    }

    const variables = {
      input: {
        ad_id: ad_id,
        status: 'ACTIVE'
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
      timeout: 30000
    });

    if (response.data?.data?.ad_update) {
      return res.json({
        success: true,
        adId: ad_id,
        status: 'ACTIVE',
        message: 'Ad activated successfully',
        raw: response.data
      });
    }

    res.json({
      success: false,
      error: 'Failed to activate ad',
      raw: response.data
    });
  } catch (err) {
    console.error('[ACTIVATE API] Error:', err.message);
    res.status(500).json({
      success: false,
      error: err.message || 'Internal server error'
    });
  }
});

export default router;
