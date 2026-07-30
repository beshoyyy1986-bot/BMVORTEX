import express from 'express';
import axios from 'axios';
import { getProxyConfig } from '../utils/proxyManager.js';
import { resolveFbDtsg, extractActorId, buildCookieHeader } from '../utils/cookieParser.js';
import facebookApi from '../services/facebookApi.js';

// Basic request validation middleware
const validateRequest = (req, res, next) => next();

const router = express.Router();
const FB_GRAPHQL_URL = 'https://business.facebook.com/api/graphql';

/**
 * Create complete ad campaign (campaign + adset + ad)
 * POST /api/ads/create-campaign
 */
router.post('/create-campaign', async (req, res) => {
  try {
    const {
      cookies,
      access_token,
      ad_account_id,
      name,
      objective = 'LINK_CLICKS',
      daily_budget,
      days = 7,
      audience_id,
      post_link,
      post_id,
      page_id,
      proxy_option = 'none',
      custom_proxy,
      countries = ['US']
    } = req.body;

    if (!cookies || !ad_account_id) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: cookies, ad_account_id' 
      });
    }

    // Extract fb_dtsg and actor_id from cookies
    const fb_dtsg = await resolveFbDtsg(cookies, undefined, custom_proxy);
    const actor_id = extractActorId(cookies);

    if (!fb_dtsg) {
      return res.status(400).json({ 
        success: false, 
        error: 'Could not extract fb_dtsg from cookies. Please ensure you have valid Meta Business cookies.' 
      });
    }

    console.log(`[Ads API] Creating campaign for ad account: ${ad_account_id}`);

    // Step 1: Create Campaign
    // access_token is the Graph API OAuth token; fb_dtsg is extracted from cookies
    // for GraphQL-based routes. createCampaign uses the Graph API and requires access_token.
    const campaignResult = await facebookApi.createCampaign(
      access_token,
      ad_account_id,
      { name: `${name || 'Campaign'}_${Date.now()}`, objective, status: 'ACTIVE' },
      proxy_option,
      custom_proxy,
      cookies
    );

    if (!campaignResult.success) {
      return res.status(400).json({
        success: false,
        step: 'campaign',
        error: campaignResult.error
      });
    }

    // Step 2: Create Ad Set
    const adSetResult = await facebookApi.createAdSet(
      access_token,
      ad_account_id,
      campaignResult.campaignId,
      {
        name: `${name || 'AdSet'}_${Date.now()}`,
        daily_budget,
        days,
        audience_id,
        countries
      },
      proxy_option,
      custom_proxy
    );

    if (!adSetResult.success) {
      return res.status(400).json({
        success: false,
        step: 'adset',
        campaignId: campaignResult.campaignId,
        error: adSetResult.error
      });
    }

    // Step 3: Verify post
    let postInfo = { postId: post_id, pageId: page_id };
    if (post_link && !post_id) {
      postInfo = facebookApi.extractPostInfo(post_link);
    }

    if (!postInfo.postId) {
      return res.status(400).json({
        success: false,
        step: 'post_verification',
        campaignId: campaignResult.campaignId,
        adSetId: adSetResult.adSetId,
        error: 'Could not extract post ID from the provided link'
      });
    }

    // Step 4: Create Ad Creative
    const creativeResult = await facebookApi.createAdCreative(
      access_token,
      ad_account_id,
      {
        name: `${name || 'Creative'}_${Date.now()}`,
        post_link,
        post_id: postInfo.postId,
        page_id: postInfo.pageId,
        link: post_link
      },
      proxy_option,
      custom_proxy
    );

    if (!creativeResult.success) {
      return res.status(400).json({
        success: false,
        step: 'creative',
        campaignId: campaignResult.campaignId,
        adSetId: adSetResult.adSetId,
        error: creativeResult.error
      });
    }

    // Step 5: Create Ad
    const adResult = await facebookApi.createAd(
      access_token,
      ad_account_id,
      {
        name: `${name || 'Ad'}_${Date.now()}`,
        adset_id: adSetResult.adSetId,
        creative_id: creativeResult.creativeId,
        status: 'ACTIVE'
      },
      proxy_option,
      custom_proxy
    );

    if (!adResult.success) {
      return res.status(400).json({
        success: false,
        step: 'ad',
        campaignId: campaignResult.campaignId,
        adSetId: adSetResult.adSetId,
        creativeId: creativeResult.creativeId,
        error: adResult.error
      });
    }

    res.json({
      success: true,
      message: 'Ad campaign created successfully',
      data: {
        campaignId: campaignResult.campaignId,
        adSetId: adSetResult.adSetId,
        creativeId: creativeResult.creativeId,
        adId: adResult.adId,
        postId: postInfo.postId,
        pageId: postInfo.pageId
      }
    });

  } catch (error) {
    console.error('[Ads API] Error creating campaign:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Create Dark Post Ad
 * POST /api/ads/dark-post
 */
router.post('/dark-post', validateRequest, async (req, res) => {
  try {
    const {
      access_token,
      ad_account_id,
      name,
      daily_budget,
      days = 7,
      audience_id,
      page_id,
      message = '',
      link = 'https://facebook.com',
      proxy_option = 'none',
      custom_proxy,
      countries = ['US']
    } = req.body;

    console.log(`[Ads API] Creating dark post for ad account: ${ad_account_id}`);

    // Create campaign
    const campaignResult = await facebookApi.createCampaign(
      access_token, ad_account_id,
      { name: `Dark_${name || Date.now()}`, objective: 'LINK_CLICKS' },
      proxy_option, custom_proxy
    );

    if (!campaignResult.success) {
      return res.status(400).json({ success: false, step: 'campaign', error: campaignResult.error });
    }

    // Create ad set
    const adSetResult = await facebookApi.createAdSet(
      access_token, ad_account_id, campaignResult.campaignId,
      { name: `DarkSet_${Date.now()}`, daily_budget, days, audience_id, countries },
      proxy_option, custom_proxy
    );

    if (!adSetResult.success) {
      return res.status(400).json({ success: false, step: 'adset', error: adSetResult.error });
    }

    // Create ad creative with unpublished page post (dark post)
    const client = (await import('axios')).default;
    const proxyManager = (await import('../utils/proxyManager.js')).getProxyManager();
    const proxyConfig = proxyManager.createAxiosConfig(proxy_option, custom_proxy, 'facebook');
    const fbClient = client.create({ timeout: 30000, ...proxyConfig });

    // Create unpublished post first
    const postResponse = await fbClient.post(
      `https://graph.facebook.com/v18.0/${page_id}/feed`,
      {
        message,
        link,
        published: false,
        access_token: access_token,
      }
    );

    const postId = postResponse.data.id;

    // Create creative using the unpublished post
    const creativeResult = await facebookApi.createAdCreative(
      access_token, ad_account_id,
      { name: `DarkCreative_${Date.now()}`, post_id: postId, page_id, link },
      proxy_option, custom_proxy
    );

    if (!creativeResult.success) {
      return res.status(400).json({ success: false, step: 'creative', error: creativeResult.error });
    }

    // Create ad
    const adResult = await facebookApi.createAd(
      access_token, ad_account_id,
      { name: `DarkAd_${Date.now()}`, adset_id: adSetResult.adSetId, creative_id: creativeResult.creativeId },
      proxy_option, custom_proxy
    );

    if (!adResult.success) {
      return res.status(400).json({ success: false, step: 'ad', error: adResult.error });
    }

    res.json({
      success: true,
      message: 'Dark post ad created successfully',
      data: {
        campaignId: campaignResult.campaignId,
        adSetId: adSetResult.adSetId,
        creativeId: creativeResult.creativeId,
        adId: adResult.adId,
        postId
      }
    });

  } catch (error) {
    console.error('[Ads API] Error creating dark post:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Create Post Post Ad (using existing published post)
 * POST /api/ads/post-post
 */
router.post('/post-post', validateRequest, async (req, res) => {
  try {
    const {
      access_token,
      ad_account_id,
      post_link,
      daily_budget,
      days = 7,
      audience_id,
      proxy_option = 'none',
      custom_proxy,
      countries = ['US']
    } = req.body;

    console.log(`[Ads API] Creating post-post ad for ad account: ${ad_account_id}`);

    const postInfo = facebookApi.extractPostInfo(post_link);
    if (!postInfo.postId) {
      return res.status(400).json({ success: false, error: 'Could not extract post ID from link' });
    }

    // Verify post exists
    const verifyResult = await facebookApi.useExistingPost(
      access_token, ad_account_id, post_link, proxy_option, custom_proxy
    );

    if (!verifyResult.success) {
      return res.status(400).json({ success: false, error: verifyResult.error });
    }

    // Create campaign
    const campaignResult = await facebookApi.createCampaign(
      access_token, ad_account_id,
      { name: `PostPost_${Date.now()}`, objective: 'POST_ENGAGEMENT' },
      proxy_option, custom_proxy
    );

    if (!campaignResult.success) {
      return res.status(400).json({ success: false, step: 'campaign', error: campaignResult.error });
    }

    // Create ad set for post engagement
    const adSetResult = await facebookApi.createAdSet(
      access_token, ad_account_id, campaignResult.campaignId,
      { name: `PostPostSet_${Date.now()}`, daily_budget, days, audience_id, countries },
      proxy_option, custom_proxy
    );

    if (!adSetResult.success) {
      return res.status(400).json({ success: false, step: 'adset', error: adSetResult.error });
    }

    // Create creative using existing post
    const creativeResult = await facebookApi.createAdCreative(
      access_token, ad_account_id,
      { name: `PostPostCreative_${Date.now()}`, post_id: postInfo.postId, page_id: postInfo.pageId, link: post_link },
      proxy_option, custom_proxy
    );

    if (!creativeResult.success) {
      return res.status(400).json({ success: false, step: 'creative', error: creativeResult.error });
    }

    // Create ad
    const adResult = await facebookApi.createAd(
      access_token, ad_account_id,
      { name: `PostPostAd_${Date.now()}`, adset_id: adSetResult.adSetId, creative_id: creativeResult.creativeId },
      proxy_option, custom_proxy
    );

    if (!adResult.success) {
      return res.status(400).json({ success: false, step: 'ad', error: adResult.error });
    }

    res.json({
      success: true,
      message: 'Post-post ad created successfully',
      data: {
        campaignId: campaignResult.campaignId,
        adSetId: adSetResult.adSetId,
        creativeId: creativeResult.creativeId,
        adId: adResult.adId,
        postId: postInfo.postId,
        pageId: postInfo.pageId
      }
    });

  } catch (error) {
    console.error('[Ads API] Error creating post-post ad:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Create Messenger Ad
 * POST /api/ads/messenger
 */
router.post('/messenger', validateRequest, async (req, res) => {
  try {
    const {
      access_token,
      ad_account_id,
      page_id,
      thread_id,
      message = '',
      daily_budget,
      days = 7,
      audience_id,
      proxy_option = 'none',
      custom_proxy,
      countries = ['US']
    } = req.body;

    console.log(`[Ads API] Creating messenger ad for ad account: ${ad_account_id}`);

    // Create campaign with MESSAGES objective
    const campaignResult = await facebookApi.createCampaign(
      access_token, ad_account_id,
      { name: `Messenger_${Date.now()}`, objective: 'MESSAGES' },
      proxy_option, custom_proxy
    );

    if (!campaignResult.success) {
      return res.status(400).json({ success: false, step: 'campaign', error: campaignResult.error });
    }

    // Create ad set
    const adSetResult = await facebookApi.createAdSet(
      access_token, ad_account_id, campaignResult.campaignId,
      { name: `MessengerSet_${Date.now()}`, daily_budget, days, audience_id, countries },
      proxy_option, custom_proxy
    );

    if (!adSetResult.success) {
      return res.status(400).json({ success: false, step: 'adset', error: adSetResult.error });
    }

    // Create messenger creative
    const client = (await import('axios')).default;
    const proxyManager = (await import('../utils/proxyManager.js')).getProxyManager();
    const proxyConfig = proxyManager.createAxiosConfig(proxy_option, custom_proxy, 'facebook');
    const fbClient = client.create({ timeout: 30000, ...proxyConfig });

    const creativeResponse = await fbClient.post(
      `https://graph.facebook.com/v18.0/act_${ad_account_id}/adcreatives`,
      {
        name: `MessengerCreative_${Date.now()}`,
        object_story_spec: JSON.stringify({
          page_id,
          template_data: {
            message: message || 'Send us a message on Messenger!',
            link: `https://m.me/${page_id}`,
          }
        }),
        access_token: access_token,
      }
    );

    // Create ad
    const adResult = await facebookApi.createAd(
      access_token, ad_account_id,
      { name: `MessengerAd_${Date.now()}`, adset_id: adSetResult.adSetId, creative_id: creativeResponse.data.id },
      proxy_option, custom_proxy
    );

    if (!adResult.success) {
      return res.status(400).json({ success: false, step: 'ad', error: adResult.error });
    }

    res.json({
      success: true,
      message: 'Messenger ad created successfully',
      data: {
        campaignId: campaignResult.campaignId,
        adSetId: adSetResult.adSetId,
        creativeId: creativeResponse.data.id,
        adId: adResult.adId
      }
    });

  } catch (error) {
    console.error('[Ads API] Error creating messenger ad:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Create Meta Business Ad (using Business Manager)
 * POST /api/ads/meta-business
 */
router.post('/meta-business', validateRequest, async (req, res) => {
  try {
    const {
      access_token,
      ad_account_id,
      business_id,
      post_link,
      daily_budget,
      days = 7,
      audience_id,
      proxy_option = 'none',
      custom_proxy,
      countries = ['US']
    } = req.body;

    console.log(`[Ads API] Creating Meta Business ad for ad account: ${ad_account_id}, business: ${business_id}`);

    // Verify business access
    const client = (await import('axios')).default;
    const proxyManager = (await import('../utils/proxyManager.js')).getProxyManager();
    const proxyConfig = proxyManager.createAxiosConfig(proxy_option, custom_proxy, 'facebook');
    const fbClient = client.create({ timeout: 30000, ...proxyConfig });

    // Verify business exists
    const businessResponse = await fbClient.get(
      `https://graph.facebook.com/v18.0/${business_id}`,
      { params: { access_token, fields: 'id,name,owned_ad_accounts' } }
    );

    // Get post info
    const postInfo = facebookApi.extractPostInfo(post_link);
    if (!postInfo.postId) {
      return res.status(400).json({ success: false, error: 'Could not extract post ID from link' });
    }

    // Create campaign
    const campaignResult = await facebookApi.createCampaign(
      access_token, ad_account_id,
      { name: `Biz_${Date.now()}`, objective: 'LINK_CLICKS' },
      proxy_option, custom_proxy
    );

    if (!campaignResult.success) {
      return res.status(400).json({ success: false, step: 'campaign', error: campaignResult.error });
    }

    // Create ad set
    const adSetResult = await facebookApi.createAdSet(
      access_token, ad_account_id, campaignResult.campaignId,
      { name: `BizSet_${Date.now()}`, daily_budget, days, audience_id, countries },
      proxy_option, custom_proxy
    );

    if (!adSetResult.success) {
      return res.status(400).json({ success: false, step: 'adset', error: adSetResult.error });
    }

    // Create creative
    const creativeResult = await facebookApi.createAdCreative(
      access_token, ad_account_id,
      { name: `BizCreative_${Date.now()}`, post_link, post_id: postInfo.postId, page_id: postInfo.pageId, link: post_link },
      proxy_option, custom_proxy
    );

    if (!creativeResult.success) {
      return res.status(400).json({ success: false, step: 'creative', error: creativeResult.error });
    }

    // Create ad
    const adResult = await facebookApi.createAd(
      access_token, ad_account_id,
      { name: `BizAd_${Date.now()}`, adset_id: adSetResult.adSetId, creative_id: creativeResult.creativeId },
      proxy_option, custom_proxy
    );

    if (!adResult.success) {
      return res.status(400).json({ success: false, step: 'ad', error: adResult.error });
    }

    res.json({
      success: true,
      message: 'Meta Business ad created successfully',
      data: {
        campaignId: campaignResult.campaignId,
        adSetId: adSetResult.adSetId,
        creativeId: creativeResult.creativeId,
        adId: adResult.adId,
        businessId: business_id,
        businessName: businessResponse.data?.name
      }
    });

  } catch (error) {
    console.error('[Ads API] Error creating Meta Business ad:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Verify post link
 * POST /api/ads/verify-post
 */
router.post('/verify-post', async (req, res) => {
  try {
    const { post_link, access_token } = req.body;
    const postInfo = facebookApi.extractPostInfo(post_link);
    
    if (!postInfo.postId) {
      return res.json({ success: false, error: 'Could not extract post ID' });
    }

    if (access_token) {
      const verifyResult = await facebookApi.useExistingPost(access_token, null, post_link);
      return res.json(verifyResult);
    }

    res.json({
      success: true,
      postId: postInfo.postId,
      pageId: postInfo.pageId,
      extracted: true
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
