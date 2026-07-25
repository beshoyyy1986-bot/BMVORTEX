import axios from 'axios';
import { getProxyManager } from '../utils/proxyManager.js';

const FB_GRAPH_URL = 'https://graph.facebook.com/v18.0';

/**
 * Facebook Graph API Service
 * Handles all API calls to Facebook with proxy support
 */
class FacebookApiService {
  constructor() {
    this.proxyManager = getProxyManager();
  }

  /**
   * Create axios instance with proxy support
   */
  createClient(proxyOption, customProxy) {
    const proxyConfig = this.proxyManager.createAxiosConfig(proxyOption, customProxy, 'facebook');
    return axios.create({
      timeout: 30000,
      ...proxyConfig
    });
  }

  /**
   * Extract post ID and page ID from Facebook post link
   */
  extractPostInfo(postLink) {
    if (!postLink) return { postId: null, pageId: null };
    
    // Handle various Facebook URL formats
    const patterns = [
      // facebook.com/pageName/posts/postId
      /facebook\.com\/([^\/]+)\/posts\/(\d+)/i,
      // facebook.com/groups/groupId/permalink/postId
      /facebook\.com\/groups\/[^\/]+\/permalink\/(\d+)/i,
      // facebook.com/pageName/videos/postId
      /facebook\.com\/([^\/]+)\/videos\/(\d+)/i,
      // facebook.com/photo.php?fbid=postId
      /fbid=(\d+)/i,
      // facebook.com/story.php?story_fbid=postId&id=pageId
      /story_fbid=(\d+).*?id=(\d+)/i,
      // Generic numeric ID in URL
      /\/(\d+)\/?$/i,
    ];

    for (const pattern of patterns) {
      const match = postLink.match(pattern);
      if (match) {
        if (match[2]) {
          return { pageId: match[1], postId: match[2] };
        }
        return { postId: match[1], pageId: null };
      }
    }

    // Try to extract any numeric IDs from the URL
    const ids = postLink.match(/\d{10,}/g);
    if (ids && ids.length >= 1) {
      return { postId: ids[0], pageId: ids[1] || null };
    }

    return { postId: null, pageId: null };
  }

  /**
   * Create ad campaign
   */
  async createCampaign(accessToken, adAccountId, campaignData, proxyOption, customProxy, cookies) {
    const client = this.createClient(proxyOption, customProxy);
    
    try {
      const response = await client.post(
        `${FB_GRAPH_URL}/act_${adAccountId}/campaigns`,
        {
          name: campaignData.name || `Campaign_${Date.now()}`,
          objective: campaignData.objective || 'LINK_CLICKS',
          status: campaignData.status || 'ACTIVE',
          special_ad_categories: campaignData.special_ad_categories || [],
          access_token: accessToken,
        }
      );
      return { success: true, campaignId: response.data.id, data: response.data };
    } catch (error) {
      return { success: false, error: error.response?.data?.error?.message || error.message };
    }
  }

  /**
   * Create ad set
   */
  async createAdSet(accessToken, adAccountId, campaignId, adSetData, proxyOption, customProxy) {
    const client = this.createClient(proxyOption, customProxy);
    
    const startTime = Math.floor(Date.now() / 1000);
    const endTime = startTime + (adSetData.days * 24 * 60 * 60);
    
    try {
      const targeting = {
        geo_locations: {
          countries: adSetData.countries || ['US']
        }
      };

      // Add saved audience if provided
      if (adSetData.audience_id) {
        targeting.custom_audiences = [{ id: adSetData.audience_id }];
      }

      const response = await client.post(
        `${FB_GRAPH_URL}/act_${adAccountId}/adsets`,
        {
          name: adSetData.name || `AdSet_${Date.now()}`,
          campaign_id: campaignId,
          daily_budget: Math.round(adSetData.daily_budget * 100), // Convert to cents
          billing_event: 'IMPRESSIONS',
          optimization_goal: 'LINK_CLICKS',
          bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
          targeting: JSON.stringify(targeting),
          start_time: startTime,
          end_time: endTime,
          status: 'ACTIVE',
          access_token: accessToken,
        }
      );
      return { success: true, adSetId: response.data.id, data: response.data };
    } catch (error) {
      return { success: false, error: error.response?.data?.error?.message || error.message };
    }
  }

  /**
   * Create ad creative
   */
  async createAdCreative(accessToken, adAccountId, creativeData, proxyOption, customProxy) {
    const client = this.createClient(proxyOption, customProxy);
    
    try {
      const postInfo = this.extractPostInfo(creativeData.post_link);
      const objectStoryId = postInfo.pageId && postInfo.postId 
        ? `${postInfo.pageId}_${postInfo.postId}`
        : creativeData.post_id;

      const response = await client.post(
        `${FB_GRAPH_URL}/act_${adAccountId}/adcreatives`,
        {
          name: creativeData.name || `Creative_${Date.now()}`,
          object_story_spec: JSON.stringify({
            page_id: postInfo.pageId || creativeData.page_id,
            link_data: {
              link: creativeData.link || 'https://facebook.com',
              message: creativeData.message || '',
            }
          }),
          access_token: accessToken,
        }
      );
      return { success: true, creativeId: response.data.id, data: response.data };
    } catch (error) {
      return { success: false, error: error.response?.data?.error?.message || error.message };
    }
  }

  /**
   * Create ad
   */
  async createAd(accessToken, adAccountId, adData, proxyOption, customProxy) {
    const client = this.createClient(proxyOption, customProxy);
    
    try {
      const response = await client.post(
        `${FB_GRAPH_URL}/act_${adAccountId}/ads`,
        {
          name: adData.name || `Ad_${Date.now()}`,
          adset_id: adData.adset_id,
          creative: JSON.stringify({ creative_id: adData.creative_id }),
          status: adData.status || 'ACTIVE',
          access_token: accessToken,
        }
      );
      return { success: true, adId: response.data.id, data: response.data };
    } catch (error) {
      return { success: false, error: error.response?.data?.error?.message || error.message };
    }
  }

  /**
   * Use existing post for ad
   */
  async useExistingPost(accessToken, adAccountId, postLink, proxyOption, customProxy) {
    const client = this.createClient(proxyOption, customProxy);
    const postInfo = this.extractPostInfo(postLink);
    
    if (!postInfo.postId) {
      return { success: false, error: 'Could not extract post ID from the provided link' };
    }

    try {
      // Verify post exists
      const response = await client.get(
        `${FB_GRAPH_URL}/${postInfo.postId}`,
        {
          params: {
            access_token: accessToken,
            fields: 'id,message,created_time'
          }
        }
      );
      
      return { 
        success: true, 
        postId: postInfo.postId,
        pageId: postInfo.pageId,
        data: response.data 
      };
    } catch (error) {
      return { success: false, error: error.response?.data?.error?.message || error.message };
    }
  }

  /**
   * Get ad account info
   */
  async getAdAccountInfo(accessToken, adAccountId, proxyOption, customProxy) {
    const client = this.createClient(proxyOption, customProxy);
    
    try {
      const response = await client.get(
        `${FB_GRAPH_URL}/act_${adAccountId}`,
        {
          params: {
            access_token: accessToken,
            fields: 'id,name,account_status,currency,timezone_name,amount_spent,balance,spend_cap'
          }
        }
      );
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.response?.data?.error?.message || error.message };
    }
  }

  /**
   * Add payment method (credit card) to Business Manager
   */
  async addCardToBusinessManager(accessToken, businessManagerId, cardData, proxyOption, customProxy) {
    const client = this.createClient(proxyOption, customProxy);
    
    try {
      const response = await client.post(
        `${FB_GRAPH_URL}/${businessManagerId}/payment_methods`,
        {
          billing_address: JSON.stringify({
            street1: cardData.billing_address_street || '',
            city: cardData.billing_address_city || '',
            state: cardData.billing_address_state || '',
            zip: cardData.billing_address_zip || '',
            country: cardData.billing_address_country || 'US'
          }),
          card_number: cardData.card_number,
          card_expiry_month: cardData.card_expiry_month,
          card_expiry_year: cardData.card_expiry_year,
          card_csc: cardData.card_csc,
          card_holder_name: cardData.card_holder_name,
          access_token: accessToken,
        }
      );
      return { success: true, paymentMethodId: response.data.id, data: response.data };
    } catch (error) {
      return { success: false, error: error.response?.data?.error?.message || error.message };
    }
  }

  /**
   * Add payment method directly to Ad Account billing
   */
  async addCardToAdAccount(accessToken, adAccountId, cardData, proxyOption, customProxy) {
    const client = this.createClient(proxyOption, customProxy);
    
    try {
      const response = await client.post(
        `${FB_GRAPH_URL}/act_${adAccountId}/paymentmethoddetails`,
        {
          billing_address: JSON.stringify({
            street1: cardData.billing_address_street || '',
            city: cardData.billing_address_city || '',
            state: cardData.billing_address_state || '',
            zip: cardData.billing_address_zip || '',
            country: cardData.billing_address_country || 'US'
          }),
          card_number: cardData.card_number,
          card_exp_month: cardData.card_expiry_month,
          card_exp_year: cardData.card_expiry_year,
          card_csc: cardData.card_csc,
          card_holder_name: cardData.card_holder_name,
          access_token: accessToken,
        }
      );
      return { success: true, paymentMethodId: response.data.id, data: response.data };
    } catch (error) {
      return { success: false, error: error.response?.data?.error?.message || error.message };
    }
  }

  /**
   * Fetch payment methods from Business Manager and link to Ad Account
   */
  async fetchCardsFromBusinessManager(accessToken, businessManagerId, adAccountId, proxyOption, customProxy) {
    const client = this.createClient(proxyOption, customProxy);
    
    try {
      // Get payment methods from BM
      const bmResponse = await client.get(
        `${FB_GRAPH_URL}/${businessManagerId}/payment_methods`,
        {
          params: {
            access_token: accessToken,
            fields: 'id,card_type,last_four,expiry_month,expiry_year'
          }
        }
      );
      
      const paymentMethods = bmResponse.data?.data || [];
      
      // Link each payment method to the ad account
      const linkedMethods = [];
      for (const method of paymentMethods) {
        try {
          const linkResponse = await client.post(
            `${FB_GRAPH_URL}/act_${adAccountId}/paymentmethoddetails`,
            {
              from_business_manager: true,
              payment_method_id: method.id,
              access_token: accessToken,
            }
          );
          linkedMethods.push({
            paymentMethodId: method.id,
            status: 'linked',
            data: linkResponse.data
          });
        } catch (linkError) {
          linkedMethods.push({
            paymentMethodId: method.id,
            status: 'failed',
            error: linkError.response?.data?.error?.message || linkError.message
          });
        }
      }
      
      return { 
        success: true, 
        paymentMethods,
        linkedMethods,
        totalLinked: linkedMethods.filter(m => m.status === 'linked').length
      };
    } catch (error) {
      return { success: false, error: error.response?.data?.error?.message || error.message };
    }
  }

  /**
   * Generate PayPal link session for Facebook Ad Account
   */
  async generatePayPalLinkSession(accessToken, adAccountId, proxyOption, customProxy) {
    const client = this.createClient(proxyOption, customProxy);
    
    try {
      // Step 1: Request PayPal linking URL from Facebook
      const response = await client.post(
        `${FB_GRAPH_URL}/act_${adAccountId}/paypal_partners`,
        {
          access_token: accessToken,
          return_url: `https://business.facebook.com/settings/payment?act=${adAccountId}&paypal_success=1`,
          cancel_url: `https://business.facebook.com/settings/payment?act=${adAccountId}&paypal_cancel=1`,
        }
      );
      
      if (response.data?.paypal_url) {
        return {
          success: true,
          paypalUrl: response.data.paypal_url,
          sessionToken: response.data.session_token,
          message: 'PayPal session created. User must complete authorization in popup.'
        };
      }
      
      return {
        success: true,
        manualUrl: `https://business.facebook.com/settings/payment?act=${adAccountId}&paypal=1`,
        message: 'PayPal linking initiated. Open the URL to complete.'
      };
    } catch (error) {
      return { success: false, error: error.response?.data?.error?.message || error.message };
    }
  }

  /**
   * Verify PayPal link status
   */
  async verifyPayPalLink(accessToken, adAccountId, proxyOption, customProxy) {
    const client = this.createClient(proxyOption, customProxy);
    
    try {
      const response = await client.get(
        `${FB_GRAPH_URL}/act_${adAccountId}`,
        {
          params: {
            access_token: accessToken,
            fields: 'payment_method_details,has_migrated_payment'
          }
        }
      );
      
      const paymentMethods = response.data?.payment_method_details?.data || [];
      const paypalMethod = paymentMethods.find(m => 
        m.provider.toLowerCase().includes('paypal') || 
        m.payment_method_type === 'paypal'
      );
      
      return {
        success: true,
        isLinked: !!paypalMethod,
        paypalMethod: paypalMethod || null,
        allMethods: paymentMethods
      };
    } catch (error) {
      return { success: false, error: error.response?.data?.error?.message || error.message };
    }
  }

  /**
   * Add IBAN to Ad Account
   */
  async addIBANToAdAccount(accessToken, adAccountId, ibanData, proxyOption, customProxy) {
    const client = this.createClient(proxyOption, customProxy);
    
    try {
      // Validate IBAN format first
      const cleanIBAN = ibanData.iban.replace(/\s/g, '').toUpperCase();
      if (!this.validateIBAN(cleanIBAN)) {
        return { success: false, error: 'Invalid IBAN format' };
      }

      const response = await client.post(
        `${FB_GRAPH_URL}/act_${adAccountId}/paymentmethoddetails`,
        {
          payment_method_type: 'DIRECT_DEBIT',
          direct_debit: JSON.stringify({
            iban: cleanIBAN,
            account_holder_name: ibanData.account_holder_name,
            bank_name: ibanData.bank_name || '',
            country: ibanData.country || 'DE'
          }),
          billing_address: JSON.stringify({
            street1: ibanData.billing_address_street || '',
            city: ibanData.billing_address_city || '',
            state: ibanData.billing_address_state || '',
            zip: ibanData.billing_address_zip || '',
            country: ibanData.country || 'DE'
          }),
          access_token: accessToken,
        }
      );
      
      return { success: true, paymentMethodId: response.data.id, data: response.data };
    } catch (error) {
      return { success: false, error: error.response?.data?.error?.message || error.message };
    }
  }

  /**
   * Validate IBAN format
   */
  validateIBAN(iban) {
    const ibanRegex = /^[A-Z]{2}\d{2}[A-Z0-9]{1,30}$/;
    if (!ibanRegex.test(iban)) return false;
    
    // Move first 4 chars to end
    const rearranged = iban.substring(4) + iban.substring(0, 4);
    
    // Replace letters with numbers (A=10, B=11, etc.)
    let numeric = '';
    for (const char of rearranged) {
      if (/[A-Z]/.test(char)) {
        numeric += (char.charCodeAt(0) - 55).toString();
      } else {
        numeric += char;
      }
    }
    
    // Mod 97 check
    let remainder = numeric.substring(0, 9) % 97;
    for (let i = 9; i < numeric.length; i += 7) {
      const chunk = remainder.toString() + numeric.substring(i, i + 7);
      remainder = parseInt(chunk) % 97;
    }
    
    return remainder === 1;
  }

  /**
   * Generate a test IBAN (for testing purposes)
   */
  generateTestIBAN(country = 'DE') {
    const countryCodes = {
      'DE': { length: 22, bankCode: '37040044' },
      'GB': { length: 22, bankCode: '123456' },
      'FR': { length: 27, bankCode: '20041' },
      'ES': { length: 24, bankCode: '2100' },
      'IT': { length: 27, bankCode: 'X054' },
    };
    
    const info = countryCodes[country] || countryCodes['DE'];
    const prefix = country + '00';
    const accountNumber = Math.floor(Math.random() * 9999999999).toString().padStart(10, '0');
    const raw = info.bankCode + accountNumber;
    
    // Calculate check digits
    const tempIBAN = prefix + raw;
    const rearranged = tempIBAN.substring(4) + tempIBAN.substring(0, 4);
    let numeric = '';
    for (const char of rearranged) {
      if (/[A-Z]/.test(char)) {
        numeric += (char.charCodeAt(0) - 55).toString();
      } else {
        numeric += char;
      }
    }
    
    let remainder = 0;
    for (let i = 0; i < numeric.length; i += 7) {
      remainder = parseInt(remainder.toString() + numeric.substring(i, i + 7)) % 97;
    }
    
    const checkDigits = (98 - remainder).toString().padStart(2, '0');
    
    return country + checkDigits + info.bankCode + accountNumber;
  }
}

export default new FacebookApiService();
