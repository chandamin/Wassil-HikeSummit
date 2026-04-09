const express = require('express')
const axios = require('axios');
const router = express.Router()
const requireSession = require('../middleware/requireSession');
const SubscriptionPlan = require('../models/SubscriptionPlan.js');
// const BillingCustomer = require('../models/BillingCustomer.js');
const CustomerSubscription = require('../models/CustomerSubscription.js');
const dayjs = require('dayjs');
const crypto = require('crypto');
const utc = require('dayjs/plugin/utc');  //  ADD UTC PLUGIN
const util = require('util');
const {
  findDistinctSubscriptionProducts,
  getEnabledSubscriptionProductIds,
} = require('../lib/subscriptionProducts');
dayjs.extend(utc);     // EXTEND DAYJS WITH UTC

const TEST_BASE = process.env.AIRWALLEX_BASE_URL || 'https://api.airwallex.com';

const inspectLog = (value) => {
  try {
    return JSON.stringify(value, null, 2);
  } catch (err) {
    return util.inspect(value, { depth: 8, colors: false });
  }
};

const logInfo = (message, data) => {
  if (typeof data === 'undefined') {
    console.log(message);
    return;
  }
  console.log(`${message} ${inspectLog(data)}`);
};

const logError = (message, err, extra = {}) => {
  const serialized = {
    ...extra,
    message: err?.message || null,
    code: err?.code || null,
    status: err?.response?.status || null,
    statusText: err?.response?.statusText || null,
    responseData: err?.response?.data || null,
    requestUrl: err?.config?.url || null,
    requestMethod: err?.config?.method || null,
    requestHeaders: err?.config?.headers || null,
    requestData:
      typeof err?.config?.data === 'string'
        ? (() => {
            try {
              return JSON.parse(err.config.data);
            } catch {
              return err.config.data;
            }
          })()
        : err?.config?.data || null,
  };

  console.error(`${message} ${inspectLog(serialized)}`);
};

async function getAirwallexToken() {
  try {
    const res = await axios.post(
      `${TEST_BASE}/api/v1/authentication/login`,
      {}, //  EMPTY BODY
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.AIRWALLEX_API_KEY,
          'x-client-id': process.env.AIRWALLEX_CLIENT_ID,
        },
      }
    );

    return res.data.token;
  } catch (err) {
    console.error(
      'Airwallex auth error:',
      err.response?.status,
      err.response?.data || err.message
    );
    throw new Error('Failed to authenticate with Airwallex');
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
      currency = 'EUR',
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

    // 1️⃣ Prevent duplicates
    const exists = await SubscriptionPlan.findOne({
      $or: [{ name }, { bigcommerceProductId }],
    });
    if (exists) {
      return res.status(400).json({
        error: 'Plan already exists for this name or BigCommerce product',
      });
    }

    const token = await getAirwallexToken();

    // 2️⃣ Create Product
    const productRes = await axios.post(
      `${TEST_BASE}/api/v1/products/create`,
      {
        request_id: crypto.randomUUID(),
        name,
        description,
      },
      { headers: { Authorization: `Bearer ${token}` } }
    );


    // 3️⃣ Create Price
    const priceRes = await axios.post(
      `${TEST_BASE}/api/v1/prices/create`,
      {
        request_id: crypto.randomUUID(),
        product_id: productRes.data.id,
        currency,
        pricing_model: 'FLAT',
        flat_amount: amount,
        recurring: {
          period: 1,
          period_unit: interval,
        },
      },
      { 
        headers: { 
          Authorization: `Bearer ${token}` 
        } 
      }
    );

    // 4️⃣ Save to MongoDB
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
    const {
      name,
      description,
      active,
      metadata,
      unit,
      amount,
      currency,
      interval,
    } = req.body;

    // 1️⃣ Find plan
    const plan = await SubscriptionPlan.findById(req.params.id);
    if (!plan) {
      return res.status(404).json({ error: 'Plan not found' });
    }

    const token = await getAirwallexToken();

    // 2️⃣ Update Airwallex Product (name, description, active, etc.)
    const hasProductUpdate = name || description || typeof active === 'boolean' || unit || metadata;
    if (hasProductUpdate) {
      await axios.post(
        `${TEST_BASE}/api/v1/products/${plan.airwallexProductId}/update`,
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
    }

    // 3️⃣ If currency or amount changed, create a NEW price and deactivate the old one
    const newCurrency = currency || plan.currency;
    const newAmount = amount !== undefined && amount !== null ? amount : plan.amount;
    const newInterval = interval || plan.interval;
    const currencyChanged = currency && currency !== plan.currency;
    const amountChanged = amount !== undefined && amount !== null && amount !== plan.amount;
    const intervalChanged = interval && interval !== plan.interval;

    if (currencyChanged || amountChanged || intervalChanged) {
      logInfo('💱 Price change detected, creating new Airwallex price:', {
        oldCurrency: plan.currency,
        newCurrency,
        oldAmount: plan.amount,
        newAmount,
        oldInterval: plan.interval,
        newInterval,
      });

      // Create a new price on the same product
      const newPriceRes = await axios.post(
        `${TEST_BASE}/api/v1/prices/create`,
        {
          request_id: crypto.randomUUID(),
          product_id: plan.airwallexProductId,
          currency: newCurrency,
          pricing_model: 'FLAT',
          flat_amount: newAmount,
          recurring: {
            period: 1,
            period_unit: newInterval,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      logInfo('✅ New price created:', newPriceRes.data.id);

      // Try to deactivate the old price (best-effort, may fail if already archived)
      try {
        await axios.post(
          `${TEST_BASE}/api/v1/prices/${plan.airwallexPriceId}/update`,
          {
            request_id: crypto.randomUUID(),
            active: false,
          },
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          }
        );
        logInfo('🗑️ Old price deactivated:', plan.airwallexPriceId);
      } catch (deactivateErr) {
        logError('⚠️ Could not deactivate old price (continuing):', deactivateErr);
      }

      // Update MongoDB with new price details
      plan.airwallexPriceId = newPriceRes.data.id;
      plan.currency = newCurrency;
      plan.amount = newAmount;
      plan.interval = newInterval;
    }

    // 4️⃣ Update remaining MongoDB fields
    if (name !== undefined) plan.name = name;
    if (description !== undefined) plan.description = description;
    if (typeof active === 'boolean') {
      plan.status = active ? 'enabled' : 'disabled';
    }

    await plan.save();

    res.json(plan);
  } catch (err) {
    logError('Failed to update plan:', err);
    res.status(500).json({ error: 'Failed to update plan' });
  }
});


/**
 * PUBLIC: GET ENABLED SUBSCRIPTION PRODUCT IDS FOR STOREFRONT
 */
router.get('/public/enabled-product-ids', async (req, res) => {
  try {
    const plans = await SubscriptionPlan
      .find({ status: 'enabled' })
      .select('bigcommerceProductId -_id')
      .lean();

    const ids = [...new Set(
      plans
        .map((plan) => Number(plan.bigcommerceProductId))
        .filter((id) => Number.isInteger(id) && id > 0)
    )];

    res.json({ productIds: ids });
  } catch (err) {
    console.error('Failed to fetch enabled subscription product IDs:', err.message);
    res.status(500).json({ error: 'Failed to fetch enabled subscription product IDs' });
  }
});

/**
 * CREATE AIRWALLEX BILLING CUSTOMER + SAVE TO DB + List Customers for deduplication
 */

/**
 * CREATE OR FIND AIRWALLEX BILLING CUSTOMER
 * Checks for existing customer by email before creating new one
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

    // 🔍 STEP 1: Search for existing customer by email in Airwallex
    let existingCustomer = null;
    try {
      //  CORRECT ENDPOINT: /api/v1/billing_customers (NOT /list)
      const listRes = await axios.get(
        `${TEST_BASE}/api/v1/billing_customers`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          params: {
            email: email,  //  Simple query param, no special formatting
            page_size: 10, //  Optional: limit results
          },
        }
      );

      //  CORRECT RESPONSE STRUCTURE: items array
      const customers = listRes.data?.items || [];

      console.log("Customer search results:", customers);
      
      // Find exact email match (case-insensitive for safety)
      existingCustomer = customers.find(
        (c) => c.email?.toLowerCase() === email.toLowerCase()
      );
      
    } catch (searchErr) {
      console.warn('⚠️ Could not search Airwallex customers:', {
        message: searchErr.message,
        status: searchErr.response?.status,
        data: searchErr.response?.data
      });
      // Continue to create new customer if search fails (fail-safe)
    }

    //  STEP 2: If found, return existing customer
    if (existingCustomer) {
      console.log(' Found existing Airwallex customer:', existingCustomer.id);
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

    // ➕ STEP 3: Create new customer if not found
    console.log('🆕 Creating new Airwallex customer for:', email);
    const airwallexRes = await axios.post(
      `${TEST_BASE}/api/v1/billing_customers/create`,
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
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
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
    console.error(
      'Create/find billing customer error:',
      err.response?.status,
      err.response?.data || err.message
    );
    res.status(err.response?.status || 500).json({
      error: err.response?.data || 'Failed to process billing customer',
    });
  }
});


/**
 * CREATE AIRWALLEX BILLING CUSTOMER
 * NOTE: Do NOT save to Mongo here.
 */
// router.post('/billing-customers', async (req, res) => {
//   try {
//     const {
//       name,
//       email,
//       type = 'INDIVIDUAL',
//       phone_number,
//       tax_identification_number,
//       default_billing_currency,
//       default_legal_entity_id,
//       description,
//       nickname,
//       address,
//       metadata,
//     } = req.body;

//     if (type && !['BUSINESS', 'INDIVIDUAL'].includes(type)) {
//       return res.status(400).json({ error: 'Invalid customer type' });
//     }

//     if (address && !address.country_code) {
//       return res.status(400).json({
//         error: 'address.country_code is required',
//       });
//     }

//     const token = await getAirwallexToken();

//     const airwallexRes = await axios.post(
//       `${TEST_BASE}/api/v1/billing_customers/create`,
//       {
//         request_id: crypto.randomUUID(),
//         ...(name && { name }),
//         ...(email && { email }),
//         ...(type && { type }),
//         ...(phone_number && { phone_number }),
//         ...(tax_identification_number && { tax_identification_number }),
//         ...(default_billing_currency && { default_billing_currency }),
//         ...(default_legal_entity_id && { default_legal_entity_id }),
//         ...(description && { description }),
//         ...(nickname && { nickname }),
//         ...(address && { address }),
//         ...(metadata && { metadata }),
//       },
//       {
//         headers: {
//           Authorization: `Bearer ${token}`,
//           'Content-Type': 'application/json',
//         },
//       }
//     );

//     const awCustomer = airwallexRes.data;

//     res.status(201).json({
//       success: true,
//       customer: {
//         airwallexCustomerId: awCustomer.id,
//         name: awCustomer.name,
//         email: awCustomer.email,
//         type: awCustomer.type,
//         phone_number: awCustomer.phone_number,
//         tax_identification_number: awCustomer.tax_identification_number,
//         default_billing_currency: awCustomer.default_billing_currency,
//         default_legal_entity_id: awCustomer.default_legal_entity_id,
//         description: awCustomer.description,
//         nickname: awCustomer.nickname,
//         address: awCustomer.address,
//         metadata: awCustomer.metadata,
//         createdAt: awCustomer.created_at,
//         updatedAt: awCustomer.updated_at,
//       },
//     });
//   } catch (err) {
//     console.error(
//       'Create billing customer error:',
//       err.response?.status,
//       err.response?.data || err.message
//     );

//     res.status(err.response?.status || 500).json({
//       error: err.response?.data || 'Failed to create billing customer',
//     });
//   }
// });


/**
 * CREATE CHECKOUT (used by Checkout.jsx)
 */
router.post('/create-checkout', async (req, res) => {
  try {
    const { email, priceId, requestId } = req.body;

    if (!email || !priceId || !requestId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const token = await getAirwallexToken();

    // Trial end (14 days)
    const trialEndsAt = dayjs()
      .add(30, 'days')
      .format('YYYY-MM-DDTHH:mm:ssZZ');

    const checkoutRes = await axios.post(
      `${TEST_BASE}/api/v1/billing_checkouts/create`,
      {
        request_id: requestId,
        mode: 'SUBSCRIPTION',
        customer_data: { email },
        line_items: [
          {
            price_id: priceId,
            quantity: 1,
          },
        ],
        subscription_data: {
          trial_ends_at: trialEndsAt,
        },
        legal_entity_id: process.env.AIRWALLEX_LEGAL_ENTITY_ID,
        linked_payment_account_id: process.env.AIRWALLEX_LINKED_PAYMENT_ACCOUNT_ID,
        success_url: 'https://yoursite.com/success',
        cancel_url: 'https://yoursite.com/cancel',
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    res.json({ url: checkoutRes.data.url });
  } catch (err) {
    console.error(
      'Checkout error:',
      err.response?.data || err.message
    );
    res.status(500).json({ error: 'Failed to create checkout' });
  }
});



/**
 * CREATE OR RETRIEVE AIRWALLEX PAYMENT CUSTOMER (cus_)
 * Required to enable payment_consent on payment intents (for mtd_ reusable payment methods)
 */
router.post('/payment-customers', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'email is required' });
    }

    const token = await getAirwallexToken();

    // Search for existing payment customer by merchant_customer_id (email)
    try {
      const searchRes = await axios.get(
        `${TEST_BASE}/api/v1/pa/customers`,
        {
          headers: { Authorization: `Bearer ${token}` },
          params: { merchant_customer_id: email, page_size: 5 },
        }
      );

      const customers = searchRes.data?.items || [];
      const existing = customers.find(c => c.merchant_customer_id === email);

      if (existing) {
        console.log('Reusing existing payment customer:', existing.id);
        return res.json({ id: existing.id });
      }
    } catch (searchErr) {
      console.warn('Payment customer search failed, will create new:', searchErr.response?.data || searchErr.message);
    }

    // Create new payment customer
    const createRes = await axios.post(
      `${TEST_BASE}/api/v1/pa/customers/create`,
      {
        request_id: crypto.randomUUID(),
        merchant_customer_id: email,
        email,
      },
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
    );

    console.log('Payment customer created:', createRes.data.id);
    res.status(201).json({ id: createRes.data.id });
  } catch (err) {
    console.error('Create payment customer error:', err.response?.status, err.response?.data || err.message);
    res.status(err.response?.status || 500).json({
      error: err.response?.data || 'Failed to create payment customer',
    });
  }
});


/**
 * CREATE PAYMENT CONSENT (merchant-triggered, unscheduled)
 * Must be created BEFORE the payment intent so the dropIn can verify it during payment.
 */
router.post('/payment-consents', async (req, res) => {
  try {
    const { payment_customer_id, currency } = req.body;

    if (!payment_customer_id || !currency) {
      return res.status(400).json({ error: 'payment_customer_id and currency are required' });
    }

    const token = await getAirwallexToken();

    const consentRes = await axios.post(
      `${TEST_BASE}/api/v1/pa/payment_consents/create`,
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

// router.post('/payment-intents', async (req, res) => {
//   try {
//     const { amount, currency = "CNY", merchant_order_id, payment_customer_id } = req.body;

//     if (!amount || !merchant_order_id) {
//       return res.status(400).json({
//         error: "amount and merchant_order_id are required"
//       });
//     }

//     const token = await getAirwallexToken();

//     const airwallexRes = await axios.post(
//       `${TEST_BASE}/api/v1/pa/payment_intents/create`,
//       {
//         request_id: crypto.randomUUID(),
//         amount,
//         currency,
//         merchant_order_id,
//         return_url: `${process.env.FRONTEND_URL}`,
//         ...(payment_customer_id && { customer_id: payment_customer_id }),
//       },
//       {
//         headers: {
//           Authorization: `Bearer ${token}`,
//           "Content-Type": "application/json"
//         }
//       }
//     );
//     console.log("PaymentIntent created:", {
//       id: airwallexRes.data.id,
//     });
//     console.log("Airwallex payment intent response:", airwallexRes.data);
//     res.json(airwallexRes.data);

//   } catch (err) {
//     console.error(
//       "Create payment intent error:",
//       err.response?.status,
//       err.response?.data || err.message
//     );

//     res.status(err.response?.status || 500).json({
//       error: err.response?.data || "Failed to create payment intent"
//     });
//   }
// });



// /**
//  * RETRIEVE PAYMENT INTENT
//  */

// router.get('/payment-intents/:id', async (req, res) => {
//   try {
//     const token = await getAirwallexToken();

//     const airwallexRes = await axios.get(
//       `${TEST_BASE}/api/v1/pa/payment_intents/${req.params.id}`,
//       {
//         headers: {
//           Authorization: `Bearer ${token}`,
//           'Content-Type': 'application/json',
//         },
//       }
//     );

//     console.log("📥 Fetched payment intent:", airwallexRes.data); 

//     res.json(airwallexRes.data);
//   } catch (err) {
//     console.error(
//       'Get payment intent error:',
//       err.response?.status,
//       err.response?.data || err.message
//     );

//     res.status(err.response?.status || 500).json({
//       error: err.response?.data || 'Failed to fetch payment intent',
//     });
//   }
// });


/**
 * CREATE PAYMENT INTENT
 */
router.post('/payment-intents', async (req, res) => {
  try {
    const { amount, currency, merchant_order_id, payment_customer_id } = req.body;

    logInfo('📥 [payment-intents/create] Incoming request:', req.body);

    if (!amount || !merchant_order_id) {
      return res.status(400).json({
        error: 'amount and merchant_order_id are required',
      });
    }

    const token = await getAirwallexToken();

    const createPayload = {
      request_id: crypto.randomUUID(),
      amount,
      currency,
      merchant_order_id,
      return_url: `${process.env.FRONTEND_URL}`,
      ...(payment_customer_id && { customer_id: payment_customer_id }),
    };

    logInfo('📤 [payment-intents/create] Payload:', createPayload);

    const airwallexRes = await axios.post(
      `${TEST_BASE}/api/v1/pa/payment_intents/create`,
      createPayload,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    logInfo('✅ PaymentIntent created:', {
      id: airwallexRes.data?.id,
    });

    logInfo('📥 Airwallex payment intent response:', airwallexRes.data);

    return res.json(airwallexRes.data);
  } catch (err) {
    logError('❌ Create payment intent error:', err, {
      route: '/payment-intents',
      requestBody: req.body,
    });

    return res.status(err.response?.status || 500).json({
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
      `${TEST_BASE}/api/v1/pa/payment_intents/${req.params.id}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    logInfo('📥 Fetched payment intent:', airwallexRes.data);

    return res.json(airwallexRes.data);
  } catch (err) {
    logError('❌ Get payment intent error:', err, {
      route: '/payment-intents/:id',
      paymentIntentId: req.params.id,
    });

    return res.status(err.response?.status || 500).json({
      error: err.response?.data || 'Failed to fetch payment intent',
    });
  }
});


router.post('/subscriptions/provision', async (req, res) => {
  const log = (label, payload) => {
    if (payload === undefined) {
      console.log(label);
      return;
    }

    try {
      const normalized =
        payload && typeof payload.toJSON === 'function'
          ? payload.toJSON()
          : payload;

      console.log(`${label}\n${JSON.stringify(normalized, null, 2)}`);
    } catch (err) {
      console.log(label, util.inspect(payload, { depth: 8, colors: false }));
    }
  };

  const logError = (label, err, extra = {}) => {
    const serialized = serializeError(err, extra);
    console.error(`${label}\n${JSON.stringify(serialized, null, 2)}`);
  };

  const serializeError = (err, extra = {}) => {
    const responseData = err?.response?.data;
    const requestData = err?.config?.data;

    return {
      ...extra,
      name: err?.name,
      message: err?.message,
      code: err?.code,
      stack: err?.stack,
      status: err?.response?.status || null,
      statusText: err?.response?.statusText || null,
      responseData:
        typeof responseData === 'string'
          ? responseData
          : responseData || null,
      request: {
        method: err?.config?.method || null,
        url: err?.config?.url || null,
        headers: err?.config?.headers || null,
        data:
          typeof requestData === 'string'
            ? tryParseJson(requestData)
            : requestData || null,
      },
    };
  };

  const tryParseJson = (value) => {
    if (typeof value !== 'string') return value;
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  };

  const safePrefix = (value, visible = 10) => {
    if (!value || typeof value !== 'string') return null;
    return value.length <= visible ? value : `${value.substring(0, visible)}...`;
  };

  console.log('Provision');

  try {
    const {
      orderId,
      cart,
      bigcommerceCustomer,
      airwallexCustomer,
      paymentSourceId,
    } = req.body;

    log('📥 [PROVISION] Received request:', {
      orderId,
      paymentSourceId,
      paymentSourceIdPrefix: paymentSourceId?.substring(0, 5) || null,
      hasCart: !!cart,
      cartItemsCount: Array.isArray(cart?.lineItems?.physicalItems)
        ? cart.lineItems.physicalItems.length
        : Array.isArray(cart?.items)
        ? cart.items.length
        : Array.isArray(cart)
        ? cart.length
        : null,
      hasBigcommerceCustomer: !!bigcommerceCustomer,
      bigcommerceCustomerId: bigcommerceCustomer?.id || null,
      hasAirwallexCustomer: !!airwallexCustomer,
      airwallexCustomerId:
        airwallexCustomer?.airwallexCustomerId || airwallexCustomer?.id || null,
    });

    if (!orderId || !cart || !bigcommerceCustomer || !airwallexCustomer) {
      log('❌ [PROVISION] Missing required fields:', {
        orderIdPresent: !!orderId,
        cartPresent: !!cart,
        bigcommerceCustomerPresent: !!bigcommerceCustomer,
        airwallexCustomerPresent: !!airwallexCustomer,
      });

      return res.status(400).json({
        error: 'orderId, cart, bigcommerceCustomer and airwallexCustomer are required',
      });
    }

    if (!bigcommerceCustomer.id) {
      log('❌ [PROVISION] Missing bigcommerceCustomer.id:', {
        bigcommerceCustomer,
      });

      return res.status(400).json({
        error: 'bigcommerceCustomer.id is required',
      });
    }

    if (!paymentSourceId) {
      log('❌ [PROVISION] Missing paymentSourceId for AUTO_CHARGE subscription:', {
        orderId,
        airwallexCustomerId:
          airwallexCustomer?.airwallexCustomerId || airwallexCustomer?.id || null,
        collection_method: 'AUTO_CHARGE',
      });

      return res.status(400).json({
        error: 'paymentSourceId is required for AUTO_CHARGE subscription provisioning',
        code: 'MISSING_PAYMENT_SOURCE_ID',
        details: {
          orderId,
          collection_method: 'AUTO_CHARGE',
          hasAirwallexCustomer: !!airwallexCustomer,
          hasBigcommerceCustomer: !!bigcommerceCustomer,
        },
      });
    }

    if (!paymentSourceId.startsWith('psrc_')) {
      log('❌ [PROVISION] Invalid paymentSourceId format:', {
        paymentSourceId,
        prefix: paymentSourceId?.substring(0, 5) || null,
        expected: 'psrc_',
      });

      return res.status(400).json({
        error: `Invalid paymentSourceId format. Expected 'psrc_xxx', got '${paymentSourceId?.substring(0, 4)}xxx'`,
        code: 'INVALID_PAYMENT_SOURCE_ID',
        received_id: paymentSourceId,
        expected_prefix: 'psrc_',
        received_prefix: paymentSourceId?.substring(0, 4),
      });
    }

    const airwallexCustomerId =
      airwallexCustomer.airwallexCustomerId || airwallexCustomer.id;

    if (!airwallexCustomerId) {
      log('❌ [PROVISION] Missing Airwallex customer id:', {
        airwallexCustomer,
      });

      return res.status(400).json({
        error: 'airwallex customer id is required',
      });
    }

    const subscriptionProductIds = await getEnabledSubscriptionProductIds();
    log('📦 [PROVISION] Enabled subscription product ids:', subscriptionProductIds);

    const subscriptionProducts = findDistinctSubscriptionProducts(
      cart,
      subscriptionProductIds
    );

    log('🛒 [PROVISION] Distinct subscription products found in cart:', subscriptionProducts);

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
        log('🔄 [PROVISION] Processing subscription product:', {
          productId,
          subscriptionProduct,
        });

        const plan = await SubscriptionPlan.findOne({
          bigcommerceProductId: productId,
        }).lean();

        log('📄 [PROVISION] Subscription plan lookup result:', {
          productId,
          found: !!plan,
          plan,
        });

        if (!plan) {
          errors.push({
            productId,
            error: 'No SubscriptionPlan found for BigCommerce product',
          });
          continue;
        }

        if (plan.status === 'disabled' || plan.active === false) {
          errors.push({
            productId,
            error: 'SubscriptionPlan is disabled',
          });
          continue;
        }

        const existing = await CustomerSubscription.findOne({
          airwallexCustomerId,
          airwallexProductId: plan.airwallexProductId,
        }).lean();

        log('🔍 [PROVISION] Existing subscription lookup:', {
          productId,
          airwallexCustomerId,
          airwallexProductId: plan.airwallexProductId,
          existing,
        });

        if (existing) {
          subscriptions.push(existing);
          continue;
        }

        let trialEndsAt = null;

        if (plan.trialDays && plan.trialDays > 0) {
          trialEndsAt =
            dayjs.utc()
              .add(plan.trialDays + 1, 'day')
              .startOf('day')
              .format('YYYY-MM-DDTHH:mm:ss') + '+0000';

          log('🧮 [PROVISION] Trial calculation:', {
            trialDays: plan.trialDays,
            nowUtc: dayjs.utc().format('YYYY-MM-DDTHH:mm:ss') + '+0000',
            trialEndsAt,
            note: 'created_at will be set by Airwallex',
          });
        }

        const subscriptionPayload = {
          request_id: crypto.randomUUID(),
          billing_customer_id: airwallexCustomerId,
          collection_method: 'AUTO_CHARGE',
          currency: plan.currency,
          items: [
            {
              price_id: plan.airwallexPriceId,
              quantity: 1,
            },
          ],
          duration: {
            period_unit: plan.interval,
            period: 1,
          },
          ...(trialEndsAt && { trial_ends_at: trialEndsAt }),
          legal_entity_id: process.env.AIRWALLEX_LEGAL_ENTITY_ID,
          linked_payment_account_id: process.env.AIRWALLEX_LINKED_PAYMENT_ACCOUNT_ID,
          payment_source_id: paymentSourceId,
          metadata: {
            bigcommerceOrderId: String(orderId),
            bigcommerceCustomerId: String(bigcommerceCustomer.id),
            bigcommerceProductId: String(productId),
          },
        };

        log('📤 [SUBSCRIPTION CREATE] Payload being sent to Airwallex:', {
          billing_customer_id: subscriptionPayload.billing_customer_id,
          collection_method: subscriptionPayload.collection_method,
          currency: subscriptionPayload.currency,
          items: subscriptionPayload.items,
          duration: subscriptionPayload.duration,
          trial_ends_at: subscriptionPayload.trial_ends_at || null,
          legal_entity_id: subscriptionPayload.legal_entity_id,
          linked_payment_account_id: subscriptionPayload.linked_payment_account_id,
          payment_source_id: safePrefix(subscriptionPayload.payment_source_id),
          metadata: subscriptionPayload.metadata,
        });

        const subscriptionRes = await axios.post(
          `${TEST_BASE}/api/v1/subscriptions/create`,
          subscriptionPayload,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          }
        );

        log('📥 [SUBSCRIPTION CREATE] Airwallex response:', {
          httpStatus: subscriptionRes.status,
          subscriptionId: subscriptionRes.data?.id,
          status: subscriptionRes.data?.status,
          trial_ends_at: subscriptionRes.data?.trial_ends_at || null,
          next_billing_at: subscriptionRes.data?.next_billing_at || null,
          created_at: subscriptionRes.data?.created_at || null,
          responseBody: subscriptionRes.data,
        });

        if (plan.trialDays > 0) {
          if (subscriptionRes.data?.status === 'IN_TRIAL') {
            log('✅ [PROVISION] Trial successfully applied:', {
              subscriptionId: subscriptionRes.data?.id,
              status: subscriptionRes.data?.status,
              trial_ends_at: subscriptionRes.data?.trial_ends_at || null,
            });
          } else {
            log('⚠️ [PROVISION] Trial expected but status was different:', {
              expected: 'IN_TRIAL',
              actual: subscriptionRes.data?.status || null,
              subscriptionId: subscriptionRes.data?.id || null,
            });
          }

          if (!subscriptionRes.data?.trial_ends_at) {
            log('⚠️ [PROVISION] trial_ends_at missing from Airwallex response:', {
              subscriptionId: subscriptionRes.data?.id || null,
              responseBody: subscriptionRes.data,
            });
          }
        }

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
          startedAt: awSubscription.created_at
            ? dayjs(awSubscription.created_at).toDate()
            : new Date(),
          nextBillingAt: awSubscription.next_billing_at
            ? dayjs(awSubscription.next_billing_at).toDate()
            : null,
          metadata: {
            source: 'bigcommerce-checkout',
          },
        });

        log('💾 [PROVISION] CustomerSubscription saved:', saved);

        const subscriptionProjection = await upsertSubscriptionProjection(saved, {
          lastSyncedAt: new Date(),
          syncStatus: 'ok',
        });

        log('[order-flow] Subscription projection upserted:', {
          subscriptionId: subscriptionProjection?._id || null,
          externalSubscriptionId:
            subscriptionProjection?.externalSubscriptionId || null,
          projection: subscriptionProjection,
        });

        subscriptions.push(saved);
      } catch (productErr) {
        logError('❌ [PROVISION][PRODUCT ERROR]', productErr, {
          productId,
        });

        errors.push({
          productId,
          status: productErr.response?.status || 500,
          error: productErr.response?.data || productErr.message,
        });
      }
    }

    if (subscriptions.length === 0) {
      log('❌ [PROVISION] No subscriptions provisioned:', { errors });

      return res.status(400).json({
        success: false,
        provisioned: false,
        error: 'Failed to provision any subscriptions for this order',
        subscriptions: [],
        subscription: null,
        errors,
      });
    }

    log('✅ [PROVISION] Completed successfully:', {
      provisionedCount: subscriptions.length,
      errorCount: errors.length,
      subscriptionIds: subscriptions.map(
        (s) => s.airwallexSubscriptionId || s._id || null
      ),
      errors,
    });

    return res.status(201).json({
      success: true,
      provisioned: true,
      subscriptions,
      subscription: subscriptions[0] || null,
      errors,
    });
  } catch (err) {
    logError('❌ [PROVISION] Unhandled route error', err);

    return res.status(err.response?.status || 500).json({
      error: err.response?.data || 'Failed to provision subscription',
    });
  }
});

/**
 * CREATE PAYMENT SOURCE (for AUTO_CHARGE subscriptions)
 * Call this AFTER successful payment to get reusable psrc_ ID
 */
router.post('/payment-sources/create', async (req, res) => {
  try {
    const {
      billing_customer_id,
      payment_method_id,
      payment_customer_id, // cus_ ID — used to find verified payment consent
    } = req.body;

    if (!billing_customer_id || !payment_method_id) {
      return res.status(400).json({
        error: "billing_customer_id and payment_method_id are required"
      });
    }

    const linked_payment_account_id = process.env.AIRWALLEX_LINKED_PAYMENT_ACCOUNT_ID;

    if (!linked_payment_account_id) {
      return res.status(500).json({
        error: "AIRWALLEX_LINKED_PAYMENT_ACCOUNT_ID is not configured on the server"
      });
    }

    // Wait for the payment consent to become VERIFIED (it is set asynchronously after capture).
    // Poll the payment consents for this customer up to 5 times with a 2s gap.
    let verifiedMethodId = payment_method_id;
    let verifiedConsentId = null;

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
            `${TEST_BASE}/api/v1/pa/payment_consents`,
            {
              headers: { Authorization: `Bearer ${token}` },
              params: { customer_id: payment_customer_id, page_size: 20 },
            }
          );

          const consents = consentsRes.data?.items || [];
          console.log(`[payment-sources] attempt ${attempt}: consents for ${payment_customer_id}:`,
            JSON.stringify(consents.map(c => ({
              id: c.id,
              status: c.status,
              next_triggered_by: c.next_triggered_by,
              merchant_trigger_reason: c.merchant_trigger_reason,
              pm: c.payment_method?.id,
            })), null, 2)
          );

          // Find a verified merchant-triggered consent (required for AUTO_CHARGE payment source)
          const verified = consents.find(
            c =>
              c.status === 'VERIFIED' &&
              c.next_triggered_by === 'merchant' &&
              c.payment_method?.id
          );

          if (verified) {
            verifiedMethodId = verified.payment_method.id;
            verifiedConsentId = verified.id;
            console.log(`[payment-sources] verified merchant consent found on attempt ${attempt}:`, verifiedConsentId, 'mtd:', verifiedMethodId);
            break;
          }

          if (attempt === RETRIES) {
            console.warn('[payment-sources] consent not verified after all retries — proceeding anyway');
          }
        } catch (pollErr) {
          console.warn(`[payment-sources] consent poll attempt ${attempt} failed:`, pollErr.message);
        }
      }
    }

    const token = await getAirwallexToken();

    // const externalIdForPaymentSource = verifiedMethodId;
    // const externalIdForPaymentSource = verifiedConsentId;

    const candidates = [
      { type: 'consent', id: verifiedConsentId },
      { type: 'method',  id: verifiedMethodId }
    ].filter(c => c.id); // remove empty

    let lastError = null;
    let createdPaymentSource = null;

    for (const candidate of candidates) {
      const externalId = candidate.id;
      console.log(`[payment-sources] 🔍 Attempting with external_id: ${externalId} (${candidate.type})`);

    // console.log(`[payment-sources] Checking for existing payment source: billing_customer_id=${billing_customer_id}, external_id=${verifiedMethodId}`);
    
    // 1. Check if a payment source already exists for this external_id
      try {
        const listRes = await axios.get(`${TEST_BASE}/api/v1/payment_sources`, {
          headers: { Authorization: `Bearer ${token}` },
          params: { billing_customer_id, page_size: 50 },
        });
        const existingSource = listRes.data?.items?.find(src => src.external_id === externalId);
        if (existingSource) {
          console.log(`[payment-sources] ♻️ Existing payment source found for ${externalId}: ${existingSource.id}`);
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
            }
          });
        }
      } catch (listErr) {
        console.warn(`[payment-sources] ⚠️ Could not list payment sources for ${externalId}:`, listErr.message);
        // continue to creation attempt
      }

      // 2. Try to create a new payment source
      try {
        const airwallexRes = await axios.post(
          `${TEST_BASE}/api/v1/payment_sources/create`,
          {
            request_id: crypto.randomUUID(),
            billing_customer_id,
            external_id: externalId,
            linked_payment_account_id,
          },
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          }
        );

        console.log(`[payment-sources] ✅ Created payment source with ${candidate.type} ID:\n${JSON.stringify({
          id: airwallexRes.data.id,
          external_id: airwallexRes.data.external_id,
        }, null, 2)}`);
        createdPaymentSource = airwallexRes.data;
        break; // success, exit loop
      } catch (err) {
        lastError = err;
        const errorMsg = err.response?.data?.message || err.message;
        console.warn(`[payment-sources] ❌ Attempt with ${candidate.type} ID failed: ${errorMsg}`);

        // If this is the consent ID attempt and the error says "should start with mtd_",
        // we continue to the next candidate (method ID). Otherwise, break and report error.
        if (candidate.type === 'consent' && errorMsg.includes('should start with mtd_')) {
          console.log('[payment-sources] 🔁 Demo environment quirk detected – retrying with method ID');
          continue;
        }
        // For any other error, stop trying
        break;
      }
    }

    if (createdPaymentSource) {
      return res.status(201).json({
        success: true,
        paymentSource: {
          id: createdPaymentSource.id,
          billing_customer_id: createdPaymentSource.billing_customer_id,
          external_id: createdPaymentSource.external_id,
          linked_payment_account_id: createdPaymentSource.linked_payment_account_id,
          created_at: createdPaymentSource.created_at,
        }
      });
    } else {
      // All attempts failed
      console.error('[payment-sources] All external_id attempts failed', lastError);
      throw lastError || new Error('Failed to create payment source with all available IDs');
    }

    // console.log(
    //   "PaymentSource created:",
    //   JSON.stringify({
    //     id: airwallexRes.data.id,
    //     billing_customer_id: airwallexRes.data.billing_customer_id,
    //     external_id: airwallexRes.data.external_id,
    //   })
    // );

    // res.status(201).json({
    //   success: true,
    //   paymentSource: {
    //     id: airwallexRes.data.id,
    //     billing_customer_id: airwallexRes.data.billing_customer_id,
    //     external_id: airwallexRes.data.external_id,
    //     linked_payment_account_id: airwallexRes.data.linked_payment_account_id,
    //     created_at: airwallexRes.data.created_at,
    //   }
    // });
  } catch (err) {
    console.error(
      'Create payment source error:',
      err.response?.status,
      JSON.stringify(err.response?.data, null, 2)
    );
    res.status(err.response?.status || 500).json({
      error: err.response?.data || "Failed to create payment source"
    });
  }
});

module.exports = router;
