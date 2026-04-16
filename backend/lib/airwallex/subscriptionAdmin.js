const axios = require('axios');
const dayjs = require('dayjs');

const Subscription = require('../../models/Subscription');
const CustomerSubscription = require('../../models/CustomerSubscription');
const SubscriptionCustomer = require('../../models/SubscriptionCustomer');
const { getAirwallexToken } = require('./token');

const STORE_HASH = process.env.BC_STORE_HASH || 'eapn6crf58';
const AIRWALLEX_BASE_URL = 'https://api-demo.airwallex.com/api/v1';

function normaliseStatus(airwallexStatus) {
  if (!airwallexStatus) return 'pending';
  
  const statusMap = {
    'PENDING': 'pending',
    'IN_TRIAL': 'trialing',
    'ACTIVE': 'active',
    'UNPAID': 'past_due',
    'CANCELLED': 'cancelled',
  };
  
  // Handle case-insensitive input
  const normalized = String(airwallexStatus).toUpperCase().trim();
  
  return statusMap[normalized] || 'pending';
}

function asDate(value) {
  if (!value) return null;
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.toDate() : null;
}

async function airwallexRequest(config, retry = true) {
  try {
    console.log('[subscriptionAdmin] Airwallex request start', {
      method: config.method,
      url: config.url,
      retry,
    })

    const token = await getAirwallexToken()

    const response = await axios({
      baseURL: AIRWALLEX_BASE_URL,
      ...config,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(config.headers || {}),
      },
    })

    console.log('[subscriptionAdmin] Airwallex request success', {
      method: config.method,
      url: config.url,
      status: response.status,
    })

    return response
  } catch (err) {
    const status = err.response?.status

    console.log('[subscriptionAdmin] Airwallex request failed', {
      method: config.method,
      url: config.url,
      status,
      data: err.response?.data || err.message,
      retry,
    })

    if (status === 401 && retry) {
      console.log('[subscriptionAdmin] retrying with force refresh token')

      const freshToken = await getAirwallexToken(true)

      return axios({
        baseURL: AIRWALLEX_BASE_URL,
        ...config,
        headers: {
          Authorization: `Bearer ${freshToken}`,
          'Content-Type': 'application/json',
          ...(config.headers || {}),
        },
      })
    }

    throw err
  }
} 

async function fetchAirwallexSubscription(airwallexSubscriptionId) {
  const response = await airwallexRequest({
    method: 'GET',
    url: `https://api-demo.airwallex.com/api/v1/subscriptions/${airwallexSubscriptionId}`,
  });

  return response.data;
}

async function cancelAirwallexSubscription(airwallexSubscriptionId, options = {}) {
  const {
    prorationBehavior = 'PRORATED', // Default to fair prorated refund
    requestId = crypto.randomUUID(), // Auto-generate if not provided
  } = options;

  // Validate proration_behavior
  const VALID_PRORATION = ['ALL', 'PRORATED', 'NONE'];
  if (!VALID_PRORATION.includes(prorationBehavior)) {
    throw new Error(`Invalid proration_behavior: ${prorationBehavior}. Must be one of: ${VALID_PRORATION.join(', ')}`);
  }

  const response = await airwallexRequest({
    method: 'POST',
    url: `https://api-demo.airwallex.com/api/v1/subscriptions/${airwallexSubscriptionId}/cancel`,
    data: {
      request_id: requestId,
      proration_behavior: prorationBehavior,
    },
  });

  return response.data;
}

async function updateAirwallexSubscription(airwallexSubscriptionId, payload) {
  const response = await airwallexRequest({
    method: 'POST',
    url: `/subscriptions/${airwallexSubscriptionId}/update`,
    data: payload,
  });

  return response.data;
}

async function buildProjectionPayload(customerSubscriptionDoc, overrides = {}) {
  const subscriptionCustomer = await SubscriptionCustomer.findOne({
    bigcommerceCustomerId: customerSubscriptionDoc.bigcommerceCustomerId,
    subscriptionProductId: customerSubscriptionDoc.bigcommerceProductId,
  });

  if (!subscriptionCustomer) {
    throw new Error(
      `SubscriptionCustomer not found for bigcommerceCustomerId=${customerSubscriptionDoc.bigcommerceCustomerId} and subscriptionProductId=${customerSubscriptionDoc.bigcommerceProductId}`
    );
  }

  const existingProjection = await Subscription.findOne({
    externalSubscriptionId: customerSubscriptionDoc.airwallexSubscriptionId,
  });

  return {
    subscriptionCustomerId: subscriptionCustomer._id,
    customerSubscriptionId: customerSubscriptionDoc._id,

    externalSubscriptionId: customerSubscriptionDoc.airwallexSubscriptionId,

    airwallexCustomerId:
      customerSubscriptionDoc.airwallexCustomerId ||
      subscriptionCustomer.airwallexCustomerId ||
      null,

    bigcommerceCustomerId: customerSubscriptionDoc.bigcommerceCustomerId,

    customerEmail:
      overrides.customerEmail ||
      subscriptionCustomer.bigcommerceEmail ||
      subscriptionCustomer.airwallexEmail ||
      existingProjection?.customerEmail ||
      null,

    planName:
      overrides.planName ||
      customerSubscriptionDoc.planName ||
      existingProjection?.planName ||
      subscriptionCustomer.subscriptionProductName ||
      null,

    productId:
      customerSubscriptionDoc.bigcommerceProductId ||
      existingProjection?.productId ||
      subscriptionCustomer.subscriptionProductId ||
      null,

    price:
      overrides.price ??
      customerSubscriptionDoc.amount ??
      existingProjection?.price ??
      null,

    currency:
      overrides.currency ||
      customerSubscriptionDoc.currency ||
      existingProjection?.currency ||
      null,

    interval:
      overrides.interval ||
      customerSubscriptionDoc.interval ||
      existingProjection?.interval ||
      null,

    status: normaliseStatus(
      overrides.status || customerSubscriptionDoc.status || existingProjection?.status
    ),

    nextBillingAt:
      overrides.nextBillingAt ||
      customerSubscriptionDoc.nextBillingAt ||
      existingProjection?.nextBillingAt ||
      null,

    orders: existingProjection?.orders || [],

    lastSyncedAt: overrides.lastSyncedAt || new Date(),
    syncStatus: overrides.syncStatus || 'ok',
    syncError: overrides.syncError || null,
  };
}

async function upsertSubscriptionProjection(customerSubscriptionDoc, overrides = {}) {
  const payload = await buildProjectionPayload(customerSubscriptionDoc, overrides);

  return Subscription.findOneAndUpdate(
    { externalSubscriptionId: customerSubscriptionDoc.airwallexSubscriptionId },
    { $set: payload },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
  );
}

async function syncLocalSubscriptionFromAirwallex(airwallexSubscription, options = {}) {
  const externalSubscriptionId = airwallexSubscription.id;
  const airwallexCustomerId =
    airwallexSubscription.billing_customer_id ||
    airwallexSubscription.customer_id ||
    options.airwallexCustomerId;

  // Find local CustomerSubscription
  let localSubscription = await CustomerSubscription.findOne({
    airwallexSubscriptionId: externalSubscriptionId,
  });

  if (!localSubscription && airwallexCustomerId) {
    localSubscription = await CustomerSubscription.findOne({
      airwallexCustomerId,
    }).sort({ createdAt: -1 });
  }

  if (!localSubscription) {
    throw new Error('Local CustomerSubscription not found for Airwallex subscription');
  }

  // ✅ Apply status mapping here
  const normalizedStatus = normaliseStatus(airwallexSubscription.status);

  // Update local subscription fields
  localSubscription.status = normalizedStatus;
  localSubscription.nextBillingAt =
    asDate(airwallexSubscription.next_billing_at) || localSubscription.nextBillingAt;
  localSubscription.startedAt =
    asDate(airwallexSubscription.created_at) || localSubscription.startedAt;
  
  // Store raw Airwallex status for debugging/audit
  localSubscription.metadata = {
    ...(localSubscription.metadata || {}),
    latestAirwallexSyncAt: new Date().toISOString(),
    airwallexRawStatus: airwallexSubscription.status, // Keep original for reference
  };

  await localSubscription.save();

  // Upsert the admin projection (Subscription model)
  const projection = await upsertSubscriptionProjection(localSubscription, {
    status: normalizedStatus, // ✅ Use mapped status
    cancelAtPeriodEnd: airwallexSubscription.cancel_at_period_end,
    nextBillingAt: asDate(airwallexSubscription.next_billing_at),
    lastSyncedAt: new Date(),
    metadata: {
      latestAirwallexSyncAt: new Date().toISOString(),
      airwallexRawStatus: airwallexSubscription.status,
    },
  });

  return { localSubscription, projection };
}

module.exports = {
  asDate,
  normaliseStatus,
  fetchAirwallexSubscription,
  cancelAirwallexSubscription,
  updateAirwallexSubscription,
  upsertSubscriptionProjection,
  syncLocalSubscriptionFromAirwallex,
};