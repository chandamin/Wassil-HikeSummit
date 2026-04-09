const express = require('express')
const axios = require('axios');
const router = express.Router()
const requireSession = require('../middleware/requireSession');
const SubscriptionPlan = require('../models/SubscriptionPlan.js');
const CustomerSubscription = require('../models/CustomerSubscription.js');
const dayjs = require('dayjs');
const crypto = require('crypto');
const utc = require('dayjs/plugin/utc');
const {
  findDistinctSubscriptionProducts,
  getEnabledSubscriptionProductIds,
} = require('../lib/subscriptionProducts');
dayjs.extend(utc);

const LIVE_BASE = process.env.AIRWALLEX_LIVE_BASE_URL || 'https://api.airwallex.com';

async function getAirwallexToken() {
  try {
    const res = await axios.post(
      `${LIVE_BASE}/api/v1/authentication/login`,
      {},
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.AIRWALLEX_LIVE_API_KEY,
          'x-client-id': process.env.AIRWALLEX_LIVE_CLIENT_ID,
        },
      }
    );
    return res.data.token;
  } catch (err) {
    console.error(
      'Airwallex live auth error:',
      err.response?.status,
      err.response?.data || err.message
    );
    throw new Error('Failed to authenticate with Airwallex (live)');
  }
}


router.get('/plans', requireSession, async (req, res) => {
  try {
    const { interval, currency, status } = req.query;

    const query = {};
    if (interval) query.interval = interval;
    if (currency) query.currency = currency;
    if (status) query.status = status;

    const plans = await SubscriptionPlan
      .find(query)
      .sort({ createdAt: -1 });

    res.json(plans);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Failed to fetch plans' });
  }
});


/**
 * CREATE AIRWALLEX PRODUCT and PRICE
 */
router.post('/plans', requireSession, async (req, res) => {
  try {
    const {
      name,
      description,
      amount,
      currency = 'USD',
      interval = 'MONTH',
      trialDays = 14,
      active,
      bigcommerceProductId,
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }
    if (amount === undefined || amount === null) {
      return res.status(400).json({ error: 'amount is required' });
    }
    if (!bigcommerceProductId) {
      return res.status(400).json({ error: 'bigcommerceProductId is required' });
    }

    const exists = await SubscriptionPlan.findOne({
      $or: [{ name }, { bigcommerceProductId }],
    });
    if (exists) {
      return res.status(400).json({
        error: 'Plan already exists for this name or BigCommerce product',
      });
    }

    const token = await getAirwallexToken();

    const productRes = await axios.post(
      `${LIVE_BASE}/api/v1/products/create`,
      { request_id: crypto.randomUUID(), name, description },
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const priceRes = await axios.post(
      `${LIVE_BASE}/api/v1/prices/create`,
      {
        request_id: crypto.randomUUID(),
        product_id: productRes.data.id,
        currency,
        pricing_model: 'FLAT',
        flat_amount: amount,
        recurring: { period: 1, period_unit: interval },
      },
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const plan = await SubscriptionPlan.create({
      name,
      description,
      amount,
      currency,
      interval,
      trialDays,
      active,
      bigcommerceProductId,
      airwallexProductId: productRes.data.id,
      airwallexPriceId: priceRes.data.id,
    });

    res.status(201).json(plan);
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to create plan' });
  }
});


/**
 * UPDATE AIRWALLEX PRODUCT
 */
router.put('/plans/:id', requireSession, async (req, res) => {
  try {
    const { name, description, active, metadata, unit } = req.body;

    const plan = await SubscriptionPlan.findById(req.params.id);
    if (!plan) {
      return res.status(404).json({ error: 'Plan not found' });
    }

    const token = await getAirwallexToken();

    await axios.post(
      `${LIVE_BASE}/api/v1/products/${plan.airwallexProductId}/update`,
      {
        request_id: crypto.randomUUID(),
        ...(name && { name }),
        ...(description && { description }),
        ...(typeof active === 'boolean' && { active }),
        ...(unit && { unit }),
        ...(metadata && { metadata }),
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (name !== undefined) plan.name = name;
    if (description !== undefined) plan.description = description;
    if (typeof active === 'boolean') {
      plan.status = active ? 'enabled' : 'disabled';
    }
    await plan.save();

    res.json(plan);
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to update plan' });
  }
});


/**
 * CREATE OR FIND AIRWALLEX BILLING CUSTOMER
 */
router.post('/billing-customers', async (req, res) => {
  try {
    const {
      name,
      email,
      type = 'INDIVIDUAL',
      phone_number,
      tax_identification_number,
      default_billing_currency,
      default_legal_entity_id,
      description,
      nickname,
      address,
      metadata,
    } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'email is required for deduplication' });
    }
    if (type && !['BUSINESS', 'INDIVIDUAL'].includes(type)) {
      return res.status(400).json({ error: 'Invalid customer type' });
    }
    if (address && !address.country_code) {
      return res.status(400).json({ error: 'address.country_code is required' });
    }

    const token = await getAirwallexToken();

    let existingCustomer = null;
    try {
      const listRes = await axios.get(
        `${LIVE_BASE}/api/v1/billing_customers`,
        {
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          params: { email, page_size: 10 },
        }
      );
      const customers = listRes.data?.items || [];
      existingCustomer = customers.find(
        (c) => c.email?.toLowerCase() === email.toLowerCase()
      );
    } catch (searchErr) {
      console.warn('⚠️ Could not search Airwallex live customers:', searchErr.response?.data || searchErr.message);
    }

    if (existingCustomer) {
      console.log('Found existing Airwallex live customer:', existingCustomer.id);
      return res.status(200).json({
        success: true,
        duplicate: true,
        customer: {
          airwallexCustomerId: existingCustomer.id,
          name: existingCustomer.name,
          email: existingCustomer.email,
          type: existingCustomer.type,
          phone_number: existingCustomer.phone_number,
          tax_identification_number: existingCustomer.tax_identification_number,
          default_billing_currency: existingCustomer.default_billing_currency,
          default_legal_entity_id: existingCustomer.default_legal_entity_id,
          description: existingCustomer.description,
          nickname: existingCustomer.nickname,
          address: existingCustomer.address,
          metadata: existingCustomer.metadata,
          createdAt: existingCustomer.created_at,
          updatedAt: existingCustomer.updated_at,
        },
      });
    }

    console.log('Creating new Airwallex live customer for:', email);
    const airwallexRes = await axios.post(
      `${LIVE_BASE}/api/v1/billing_customers/create`,
      {
        request_id: crypto.randomUUID(),
        ...(name && { name }),
        ...(email && { email }),
        ...(type && { type }),
        ...(phone_number && { phone_number }),
        ...(tax_identification_number && { tax_identification_number }),
        ...(default_billing_currency && { default_billing_currency }),
        ...(default_legal_entity_id && { default_legal_entity_id }),
        ...(description && { description }),
        ...(nickname && { nickname }),
        ...(address && { address }),
        ...(metadata && { metadata }),
      },
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
    );

    const awCustomer = airwallexRes.data;
    res.status(201).json({
      success: true,
      duplicate: false,
      customer: {
        airwallexCustomerId: awCustomer.id,
        name: awCustomer.name,
        email: awCustomer.email,
        type: awCustomer.type,
        phone_number: awCustomer.phone_number,
        tax_identification_number: awCustomer.tax_identification_number,
        default_billing_currency: awCustomer.default_billing_currency,
        default_legal_entity_id: awCustomer.default_legal_entity_id,
        description: awCustomer.description,
        nickname: awCustomer.nickname,
        address: awCustomer.address,
        metadata: awCustomer.metadata,
        createdAt: awCustomer.created_at,
        updatedAt: awCustomer.updated_at,
      },
    });
  } catch (err) {
    console.error('Create/find billing customer error:', err.response?.status, err.response?.data || err.message);
    res.status(err.response?.status || 500).json({
      error: err.response?.data || 'Failed to process billing customer',
    });
  }
});


/**
 * CREATE OR RETRIEVE AIRWALLEX PAYMENT CUSTOMER (cus_)
 */
router.post('/payment-customers', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'email is required' });
    }

    const token = await getAirwallexToken();

    try {
      const searchRes = await axios.get(
        `${LIVE_BASE}/api/v1/pa/customers`,
        {
          headers: { Authorization: `Bearer ${token}` },
          params: { merchant_customer_id: email, page_size: 5 },
        }
      );
      const customers = searchRes.data?.items || [];
      const existing = customers.find(c => c.merchant_customer_id === email);
      if (existing) {
        console.log('Reusing existing live payment customer:', existing.id);
        return res.json({ id: existing.id });
      }
    } catch (searchErr) {
      console.warn('Payment customer search failed, will create new:', searchErr.response?.data || searchErr.message);
    }

    const createRes = await axios.post(
      `${LIVE_BASE}/api/v1/pa/customers/create`,
      { request_id: crypto.randomUUID(), merchant_customer_id: email, email },
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
    );

    console.log('Live payment customer created:', createRes.data.id);
    res.status(201).json({ id: createRes.data.id });
  } catch (err) {
    console.error('Create payment customer error:', err.response?.status, err.response?.data || err.message);
    res.status(err.response?.status || 500).json({
      error: err.response?.data || 'Failed to create payment customer',
    });
  }
});


/**
 * CREATE PAYMENT CONSENT
 */
router.post('/payment-consents', async (req, res) => {
  try {
    const { payment_customer_id, currency } = req.body;

    if (!payment_customer_id || !currency) {
      return res.status(400).json({ error: 'payment_customer_id and currency are required' });
    }

    const token = await getAirwallexToken();

    const consentRes = await axios.post(
      `${LIVE_BASE}/api/v1/pa/payment_consents/create`,
      {
        request_id: crypto.randomUUID(),
        customer_id: payment_customer_id,
        currency,
        next_triggered_by: 'merchant',
        merchant_trigger_reason: 'unscheduled',
        payment_method_type: 'card',
      },
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
    );

    console.log('[payment-consents] created:', consentRes.data.id, 'status:', consentRes.data.status);
    res.status(201).json({
      id: consentRes.data.id,
      client_secret: consentRes.data.client_secret,
      status: consentRes.data.status,
    });
  } catch (err) {
    console.error('Create payment consent error:', err.response?.status, err.response?.data || err.message);
    res.status(err.response?.status || 500).json({
      error: err.response?.data || 'Failed to create payment consent',
    });
  }
});


/**
 * CREATE PAYMENT INTENT
 */
router.post('/payment-intents', async (req, res) => {
  try {
    const { amount, currency = 'USD', merchant_order_id, payment_customer_id } = req.body;

    if (!amount || !merchant_order_id) {
      return res.status(400).json({ error: 'amount and merchant_order_id are required' });
    }

    const token = await getAirwallexToken();

    const airwallexRes = await axios.post(
      `${LIVE_BASE}/api/v1/pa/payment_intents/create`,
      {
        request_id: crypto.randomUUID(),
        amount,
        currency,
        merchant_order_id,
        return_url: `${process.env.FRONTEND_URL}`,
        ...(payment_customer_id && { customer_id: payment_customer_id }),
      },
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
    );

    console.log('Live PaymentIntent created:', { id: airwallexRes.data.id });
    res.json(airwallexRes.data);
  } catch (err) {
    console.error('Create payment intent error:', err.response?.status, err.response?.data || err.message);
    res.status(err.response?.status || 500).json({
      error: err.response?.data || 'Failed to create payment intent',
    });
  }
});


/**
 * RETRIEVE PAYMENT INTENT
 */
router.get('/payment-intents/:id', async (req, res) => {
  try {
    const token = await getAirwallexToken();

    const airwallexRes = await axios.get(
      `${LIVE_BASE}/api/v1/pa/payment_intents/${req.params.id}`,
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
    );

    res.json(airwallexRes.data);
  } catch (err) {
    console.error('Get payment intent error:', err.response?.status, err.response?.data || err.message);
    res.status(err.response?.status || 500).json({
      error: err.response?.data || 'Failed to fetch payment intent',
    });
  }
});


/**
 * PROVISION SUBSCRIPTION
 */
router.post('/subscriptions/provision', async (req, res) => {
  try {
    const {
      orderId,
      cart,
      bigcommerceCustomer,
      airwallexCustomer,
      paymentSourceId,
    } = req.body;

    console.log('📥 [PROVISION LIVE] Received request:', {
      orderId,
      paymentSourceId,
      paymentSourceIdPrefix: paymentSourceId?.substring(0, 4),
      hasAirwallexCustomer: !!airwallexCustomer,
      airwallexCustomerId: airwallexCustomer?.airwallexCustomerId || airwallexCustomer?.id,
    });

    if (!orderId || !cart || !bigcommerceCustomer || !airwallexCustomer) {
      return res.status(400).json({
        error: 'orderId, cart, bigcommerceCustomer and airwallexCustomer are required',
      });
    }
    if (!bigcommerceCustomer.id) {
      return res.status(400).json({ error: 'bigcommerceCustomer.id is required' });
    }
    if (!paymentSourceId) {
      return res.status(400).json({
        error: 'paymentSourceId is required for AUTO_CHARGE subscription provisioning',
        code: 'MISSING_PAYMENT_SOURCE_ID',
      });
    }
    if (!paymentSourceId.startsWith('psrc_')) {
      return res.status(400).json({
        error: `Invalid paymentSourceId format. Expected 'psrc_xxx', got '${paymentSourceId?.substring(0, 4)}xxx'`,
        code: 'INVALID_PAYMENT_SOURCE_ID',
      });
    }

    const airwallexCustomerId =
      airwallexCustomer.airwallexCustomerId || airwallexCustomer.id;
    if (!airwallexCustomerId) {
      return res.status(400).json({ error: 'airwallex customer id is required' });
    }

    const subscriptionProductIds = await getEnabledSubscriptionProductIds();
    const subscriptionProducts = findDistinctSubscriptionProducts(cart, subscriptionProductIds);

    if (subscriptionProducts.length === 0) {
      return res.json({
        success: true,
        provisioned: false,
        message: 'No subscription product found in order cart',
        subscriptions: [],
        subscription: null,
      });
    }

    const token = await getAirwallexToken();
    const { upsertSubscriptionProjection } = require('../lib/airwallex/subscriptionAdmin');
    const subscriptions = [];
    const errors = [];

    for (const subscriptionProduct of subscriptionProducts) {
      const productId = Number(subscriptionProduct.product_id);
      try {
        const plan = await SubscriptionPlan.findOne({ bigcommerceProductId: productId });

        if (!plan) {
          errors.push({ productId, error: 'No SubscriptionPlan found for BigCommerce product' });
          continue;
        }
        if (plan.status === 'disabled' || plan.active === false) {
          errors.push({ productId, error: 'SubscriptionPlan is disabled' });
          continue;
        }

        const existing = await CustomerSubscription.findOne({
          airwallexCustomerId,
          airwallexProductId: plan.airwallexProductId,
        });
        if (existing) {
          subscriptions.push(existing);
          continue;
        }

        let trialEndsAt = null;
        if (plan.trialDays && plan.trialDays > 0) {
          trialEndsAt = dayjs.utc()
            .add(plan.trialDays + 1, 'day')
            .startOf('day')
            .format('YYYY-MM-DDTHH:mm:ss') + '+0000';
          console.log('🧮 [LIVE] Calculated trial_ends_at:', trialEndsAt);
        }

        const subscriptionRes = await axios.post(
          `${LIVE_BASE}/api/v1/subscriptions/create`,
          {
            request_id: crypto.randomUUID(),
            billing_customer_id: airwallexCustomerId,
            collection_method: 'AUTO_CHARGE',
            currency: plan.currency,
            items: [{ price_id: plan.airwallexPriceId, quantity: 1 }],
            duration: { period_unit: plan.interval, period: 1 },
            ...(trialEndsAt && { trial_ends_at: trialEndsAt }),
            legal_entity_id: process.env.AIRWALLEX_LEGAL_ENTITY_ID,
            linked_payment_account_id: process.env.AIRWALLEX_LINKED_PAYMENT_ACCOUNT_ID,
            payment_source_id: paymentSourceId,
            metadata: {
              bigcommerceOrderId: String(orderId),
              bigcommerceCustomerId: String(bigcommerceCustomer.id),
              bigcommerceProductId: String(productId),
            },
          },
          { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
        );

        console.log('📥 [LIVE SUBSCRIPTION CREATE] Airwallex response:', {
          subscription_id: subscriptionRes.data?.id,
          status: subscriptionRes.data?.status,
          trial_ends_at: subscriptionRes.data?.trial_ends_at,
        });

        const awSubscription = subscriptionRes.data;

        const saved = await CustomerSubscription.create({
          bigcommerceOrderId: Number(orderId),
          bigcommerceCustomerId: Number(bigcommerceCustomer.id),
          bigcommerceProductId: productId,
          airwallexCustomerId,
          airwallexProductId: plan.airwallexProductId,
          airwallexPriceId: plan.airwallexPriceId,
          airwallexSubscriptionId: awSubscription.id,
          planName: plan.name,
          status: awSubscription.status || 'active',
          amount: plan.amount,
          currency: plan.currency,
          interval: plan.interval,
          trialDays: plan.trialDays,
          startedAt: awSubscription.created_at ? dayjs(awSubscription.created_at).toDate() : new Date(),
          nextBillingAt: awSubscription.next_billing_at ? dayjs(awSubscription.next_billing_at).toDate() : null,
          metadata: { source: 'bigcommerce-checkout' },
        });

        const subscriptionProjection = await upsertSubscriptionProjection(saved, {
          lastSyncedAt: new Date(),
          syncStatus: 'ok',
        });

        console.log('[live order-flow] Subscription projection upserted:', {
          subscriptionId: subscriptionProjection._id,
          externalSubscriptionId: subscriptionProjection.externalSubscriptionId,
        });

        subscriptions.push(saved);
      } catch (productErr) {
        errors.push({ productId, error: productErr.response?.data || productErr.message });
      }
    }

    if (subscriptions.length === 0) {
      return res.status(400).json({
        success: false,
        provisioned: false,
        error: 'Failed to provision any subscriptions for this order',
        subscriptions: [],
        subscription: null,
        errors,
      });
    }

    return res.status(201).json({
      success: true,
      provisioned: true,
      subscriptions,
      subscription: subscriptions[0] || null,
      errors,
    });
  } catch (err) {
    console.error('Provision subscription error (live):', err.response?.status, err.response?.data || err.message);
    return res.status(err.response?.status || 500).json({
      error: err.response?.data || 'Failed to provision subscription',
    });
  }
});


/**
 * CREATE PAYMENT SOURCE (for AUTO_CHARGE subscriptions)
 */
router.post('/payment-sources/create', async (req, res) => {
  try {
    const { billing_customer_id, payment_method_id, payment_customer_id } = req.body;

    if (!billing_customer_id || !payment_method_id) {
      return res.status(400).json({ error: 'billing_customer_id and payment_method_id are required' });
    }

    const linked_payment_account_id = process.env.AIRWALLEX_LINKED_PAYMENT_ACCOUNT_ID;
    if (!linked_payment_account_id) {
      return res.status(500).json({ error: 'AIRWALLEX_LINKED_PAYMENT_ACCOUNT_ID is not configured on the server' });
    }

    let verifiedMethodId = payment_method_id;

    if (payment_customer_id) {
      const RETRIES = 5;
      const DELAY_MS = 2000;

      for (let attempt = 1; attempt <= RETRIES; attempt++) {
        if (attempt > 1) {
          await new Promise(resolve => setTimeout(resolve, DELAY_MS));
        }

        try {
          const token = await getAirwallexToken();
          const consentsRes = await axios.get(
            `${LIVE_BASE}/api/v1/pa/payment_consents`,
            {
              headers: { Authorization: `Bearer ${token}` },
              params: { customer_id: payment_customer_id, page_size: 20 },
            }
          );

          const consents = consentsRes.data?.items || [];
          const verified = consents.find(
            c =>
              c.status === 'VERIFIED' &&
              c.next_triggered_by === 'merchant' &&
              c.payment_method?.id
          );

          if (verified) {
            verifiedMethodId = verified.payment_method.id;
            console.log(`[live payment-sources] verified merchant consent found on attempt ${attempt}:`, verified.id);
            break;
          }

          if (attempt === RETRIES) {
            console.warn('[live payment-sources] consent not verified after all retries — proceeding anyway');
          }
        } catch (pollErr) {
          console.warn(`[live payment-sources] consent poll attempt ${attempt} failed:`, pollErr.message);
        }
      }
    }

    const token = await getAirwallexToken();

    try {
      const listRes = await axios.get(
        `${LIVE_BASE}/api/v1/payment_sources`,
        {
          headers: { Authorization: `Bearer ${token}` },
          params: { billing_customer_id, page_size: 50 },
        }
      );
      const existingSources = listRes.data?.items || [];
      const existingSource = existingSources.find(src => src.external_id === verifiedMethodId);

      if (existingSource) {
        console.log('Payment source already exists (live):', existingSource.id);
        return res.status(200).json({
          success: true,
          duplicate: true,
          paymentSource: {
            id: existingSource.id,
            billing_customer_id: existingSource.billing_customer_id,
            external_id: existingSource.external_id,
            linked_payment_account_id: existingSource.linked_payment_account_id,
            created_at: existingSource.created_at,
            status: existingSource.status,
          },
        });
      }
    } catch (listErr) {
      console.warn('Could not list live payment sources, proceeding to create:', listErr.message);
    }

    const airwallexRes = await axios.post(
      `${LIVE_BASE}/api/v1/payment_sources/create`,
      {
        request_id: crypto.randomUUID(),
        billing_customer_id,
        external_id: verifiedMethodId,
        linked_payment_account_id,
      },
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
    );

    console.log('Live PaymentSource created:', {
      id: airwallexRes.data.id,
      billing_customer_id: airwallexRes.data.billing_customer_id,
      external_id: airwallexRes.data.external_id,
    });

    res.status(201).json({
      success: true,
      paymentSource: {
        id: airwallexRes.data.id,
        billing_customer_id: airwallexRes.data.billing_customer_id,
        external_id: airwallexRes.data.external_id,
        linked_payment_account_id: airwallexRes.data.linked_payment_account_id,
        created_at: airwallexRes.data.created_at,
        status: airwallexRes.data.status,
      },
    });
  } catch (err) {
    console.error('Create payment source error (live):', err.response?.status, err.response?.data || err.message);
    res.status(err.response?.status || 500).json({
      error: err.response?.data || 'Failed to create payment source',
    });
  }
});


module.exports = router;
