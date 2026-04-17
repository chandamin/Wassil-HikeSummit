const express = require('express');
const router = express.Router();
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
dayjs.extend(utc);

const Subscription = require('../models/Subscription');
const CustomerSubscription = require('../models/CustomerSubscription');
const SubscriptionCustomer = require('../models/SubscriptionCustomer');

const axios = require('axios');
const { getAirwallexToken } = require('../lib/airwallex/token');

const {
  fetchAirwallexSubscription,
  cancelAirwallexSubscription,
  updateAirwallexSubscription,
  upsertSubscriptionProjection,
  syncLocalSubscriptionFromAirwallex,
} = require('../lib/airwallex/subscriptionAdmin');

function logRoute(label, payload = null) {
  const now = new Date().toISOString();
  if (payload !== null) {
    console.log(`[subscriptions] ${now} ${label}`, payload);
  } else {
    console.log(`[subscriptions] ${now} ${label}`);
  }
}

function logError(label, err) {
  console.error(`[subscriptions] ${new Date().toISOString()} ${label}`);
  console.error('message:', err.message);
  if (err.response?.status) console.error('status:', err.response.status);
  if (err.response?.data) console.error('response data:', err.response.data);
  if (err.stack) console.error(err.stack);
}

/**
 * LIST SUBSCRIPTIONS (ADMIN)
 * GET /api/subscriptions
 */
router.get('/', async (req, res) => {
  try {
    logRoute('GET / hit', {
      query: req.query,
      headers: {
        origin: req.headers.origin,
        referer: req.headers.referer,
      },
    });

    const { status, customerId, productId, externalSubscriptionId } = req.query;

    const query = {};

    if (status) query.status = status;
    if (customerId) query.bigcommerceCustomerId = Number(customerId);
    if (productId) query.productId = Number(productId);
    if (externalSubscriptionId) query.externalSubscriptionId = externalSubscriptionId;

    logRoute('GET / mongo query', query);

    const subs = await Subscription.find(query).sort({ createdAt: -1 });

    logRoute('GET / result', {
      count: subs.length,
      ids: subs.map((s) => s._id.toString()),
    });

    return res.json(subs);
  } catch (err) {
    logError('GET / failed', err);
    return res.status(500).json({
      error: 'Failed to list subscriptions',
      details: err.message,
    });
  }
});

/**
 * UPSERT ADMIN PROJECTION FROM CUSTOMER SUBSCRIPTION
 * POST /api/subscriptions/internal/upsert-from-customer-subscription
 */
router.post('/internal/upsert-from-customer-subscription', async (req, res) => {
  try {
    logRoute('POST /internal/upsert-from-customer-subscription hit', {
      body: req.body,
    });

    const { customerSubscriptionId, airwallexSubscriptionId } = req.body;

    let customerSubscription = null;

    if (customerSubscriptionId) {
      customerSubscription = await CustomerSubscription.findById(customerSubscriptionId);
      logRoute('lookup by customerSubscriptionId', {
        customerSubscriptionId,
        found: !!customerSubscription,
      });
    } else if (airwallexSubscriptionId) {
      customerSubscription = await CustomerSubscription.findOne({
        airwallexSubscriptionId,
      });
      logRoute('lookup by airwallexSubscriptionId', {
        airwallexSubscriptionId,
        found: !!customerSubscription,
      });
    }

    if (!customerSubscription) {
      logRoute('CustomerSubscription not found');
      return res.status(404).json({ error: 'CustomerSubscription not found' });
    }

    logRoute('customerSubscription found', {
      id: customerSubscription._id,
      airwallexSubscriptionId: customerSubscription.airwallexSubscriptionId,
      bigcommerceCustomerId: customerSubscription.bigcommerceCustomerId,
      bigcommerceProductId: customerSubscription.bigcommerceProductId,
      status: customerSubscription.status,
    });

    const projection = await upsertSubscriptionProjection(customerSubscription, {
      lastSyncedAt: new Date(),
    });

    logRoute('projection upserted', {
      projectionId: projection._id,
      externalSubscriptionId: projection.externalSubscriptionId,
      status: projection.status,
    });

    return res.status(201).json({
      success: true,
      subscription: projection,
    });
  } catch (err) {
    logError('POST /internal/upsert-from-customer-subscription failed', err);
    return res.status(500).json({
      error: 'Failed to upsert subscription projection',
      details: err.message,
    });
  }
});

/**
 * GET SUBSCRIPTION DETAIL
 * GET /api/subscriptions/:id
 */
router.get('/:id', async (req, res) => {
  try {
    logRoute('GET /:id hit', {
      params: req.params,
    });

    const subscription = await Subscription.findById(req.params.id).lean();

    logRoute('GET /:id subscription lookup result', {
      found: !!subscription,
      id: req.params.id,
    });

    if (!subscription) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    let customerSubscription = null;
    let subscriptionCustomer = null;

    if (subscription.externalSubscriptionId) {
      customerSubscription = await CustomerSubscription.findOne({
        airwallexSubscriptionId: subscription.externalSubscriptionId,
      }).lean();

      logRoute('lookup customerSubscription by externalSubscriptionId', {
        externalSubscriptionId: subscription.externalSubscriptionId,
        found: !!customerSubscription,
      });
    }

    if (!customerSubscription && subscription.bigcommerceCustomerId && subscription.productId) {
      customerSubscription = await CustomerSubscription.findOne({
        bigcommerceCustomerId: subscription.bigcommerceCustomerId,
        bigcommerceProductId: subscription.productId,
      })
        .sort({ createdAt: -1 })
        .lean();

      logRoute('fallback lookup customerSubscription by bc ids', {
        bigcommerceCustomerId: subscription.bigcommerceCustomerId,
        productId: subscription.productId,
        found: !!customerSubscription,
      });
    }

    if (customerSubscription) {
      subscriptionCustomer = await SubscriptionCustomer.findOne({
        bigcommerceCustomerId: customerSubscription.bigcommerceCustomerId,
        subscriptionProductId: customerSubscription.bigcommerceProductId,
      }).lean();

      logRoute('lookup subscriptionCustomer result', {
        found: !!subscriptionCustomer,
      });
    }

    return res.json({
      subscription,
      customerSubscription,
      subscriptionCustomer,
    });
  } catch (err) {
    logError('GET /:id failed', err);
    return res.status(500).json({
      error: 'Failed to fetch subscription details',
      details: err.message,
    });
  }
});

/**
 * SYNC SUBSCRIPTION FROM AIRWALLEX
 * POST /api/subscriptions/:id/sync
 */
router.post('/:id/sync', async (req, res) => {
  try {
    logRoute('POST /:id/sync hit', {
      params: req.params,
    });

    const projection = await Subscription.findById(req.params.id);

    logRoute('sync projection lookup', {
      found: !!projection,
      id: req.params.id,
    });

    if (!projection) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    if (!projection.externalSubscriptionId) {
      logRoute('sync aborted: missing externalSubscriptionId', {
        projectionId: projection._id,
      });

      return res.status(400).json({
        error: 'Subscription does not have externalSubscriptionId',
      });
    }

    logRoute('fetching Airwallex subscription', {
      externalSubscriptionId: projection.externalSubscriptionId,
    });

    const airwallexSubscription = await fetchAirwallexSubscription(
      projection.externalSubscriptionId
    );

    logRoute('Airwallex subscription fetched', {
      id: airwallexSubscription?.id,
      status: airwallexSubscription?.status,
      next_billing_at: airwallexSubscription?.next_billing_at,
    });

    const result = await syncLocalSubscriptionFromAirwallex(airwallexSubscription);

    logRoute('local sync completed', {
      localSubscriptionId: result.localSubscription?._id,
      projectionId: result.projection?._id,
      projectionStatus: result.projection?.status,
    });

    return res.json({
      success: true,
      subscription: result.projection,
      customerSubscription: result.localSubscription,
      airwallex: airwallexSubscription,
    });
  } catch (err) {
    logError('POST /:id/sync failed', err);
    return res.status(500).json({
      error: 'Failed to sync subscription',
      details: err.response?.data || err.message,
    });
  }
});

/**
 * CANCEL SUBSCRIPTION IN AIRWALLEX + LOCAL
 * POST /api/subscriptions/:id/cancel
 */
router.post('/:id/cancel', async (req, res) => {
  try {
    const { id } = req.params;
    const { proration_behavior } = req.body;

    logRoute('POST /:id/cancel hit', {
      subscriptionId: id,
      proration_behavior,
    });

    // 🔍 Validate proration_behavior
    const VALID_PRORATION = ['ALL', 'PRORATED', 'NONE'];
    if (!proration_behavior || !VALID_PRORATION.includes(proration_behavior)) {
      return res.status(400).json({
        error: `proration_behavior is required and must be one of: ${VALID_PRORATION.join(', ')}`,
        code: 'INVALID_PRORATION_BEHAVIOR',
      });
    }

    // 🔍 Find subscription projection
    const projection = await Subscription.findById(id);

    logRoute('cancel projection lookup', {
      found: !!projection,
      id,
      externalSubscriptionId: projection?.externalSubscriptionId,
    });

    if (!projection) {
      return res.status(404).json({ 
        error: 'Subscription not found',
        code: 'SUBSCRIPTION_NOT_FOUND',
      });
    }

    if (!projection.externalSubscriptionId) {
      return res.status(400).json({
        error: 'Subscription does not have externalSubscriptionId',
        code: 'MISSING_EXTERNAL_ID',
      });
    }

    // 🔍 Check if already cancelled
    if (projection.status === 'cancelled') {
      return res.json({
        success: true,
        already_cancelled: true,
        message: 'Subscription is already cancelled',
        subscription: projection,
      });
    }

    // 🔍 Call Airwallex cancel with proration_behavior
    logRoute('calling Airwallex cancel', {
      externalSubscriptionId: projection.externalSubscriptionId,
      proration_behavior,
    });

    const airwallexResponse = await cancelAirwallexSubscription(
      projection.externalSubscriptionId,
      {
        prorationBehavior: proration_behavior,
        // requestId is auto-generated in subscriptionAdmin.js
      }
    );

    logRoute('Airwallex cancel response received', {
      status: airwallexResponse.status,
      subscription_id: airwallexResponse.id,
      cancel_requested_at: airwallexResponse.cancel_requested_at,
      ends_at: airwallexResponse.ends_at,
    });

    // 🔍 Update MongoDB Projection (Subscription model)
    projection.status = 'cancelled';
    projection.lastSyncedAt = new Date();
    projection.syncStatus = 'ok';
    projection.syncError = null;
    // Capture Airwallex cancellation timestamps
    if (airwallexResponse.cancel_requested_at) {
      projection.metadata = {
        ...(projection.metadata || {}),
        cancelledAt: airwallexResponse.cancel_requested_at,
        endsAt: airwallexResponse.ends_at,
        prorationBehavior: proration_behavior,
      };
    }
    await projection.save();

    // 🔍 Update MongoDB CustomerSubscription (main subscription record)
    const updatedCustomerSub = await CustomerSubscription.findOneAndUpdate(
      { airwallexSubscriptionId: projection.externalSubscriptionId },
      {
        $set: {
          status: 'cancelled',
          nextBillingAt: null,
          cancelledAt: airwallexResponse.cancel_requested_at 
            ? dayjs(airwallexResponse.cancel_requested_at).toDate() 
            : new Date(),
          endedAt: airwallexResponse.ends_at 
            ? dayjs(airwallexResponse.ends_at).toDate() 
            : null,
          'metadata.cancelledFromAdminAt': new Date().toISOString(),
          'metadata.prorationBehavior': proration_behavior,
          lastSyncedAt: new Date(),
          syncStatus: 'ok',
          syncError: null,
        },
      },
      { new: true }
    );

    logRoute('local cancel persisted', {
      projectionId: projection._id,
      updatedCustomerSubscriptionId: updatedCustomerSub?._id,
      status: updatedCustomerSub?.status,
      cancelledAt: updatedCustomerSub?.cancelledAt,
    });

    // 🔍 Return success response
    return res.json({
      success: true,
      subscription: projection,
      customerSubscription: updatedCustomerSub,
      airwallex: {
        id: airwallexResponse.id,
        status: airwallexResponse.status,
        cancel_requested_at: airwallexResponse.cancel_requested_at,
        ends_at: airwallexResponse.ends_at,
        proration_behavior,
      },
    });

  } catch (err) {
    logError('POST /:id/cancel failed', err);
    
    // Handle Airwallex-specific errors
    if (err.response?.status === 404) {
      return res.status(404).json({
        error: 'Subscription not found in Airwallex',
        code: 'AIRWALLEX_NOT_FOUND',
        details: err.response.data,
      });
    }
    
    if (err.response?.status === 400) {
      return res.status(400).json({
        error: err.response.data?.message || 'Invalid request to Airwallex',
        code: 'AIRWALLEX_VALIDATION_ERROR',
        details: err.response.data,
      });
    }

    return res.status(500).json({
      error: 'Failed to cancel subscription',
      code: 'CANCEL_ERROR',
      details: err.response?.data || err.message,
    });
  }
});

/**
 * LOCAL PATCH
 * PATCH /api/subscriptions/:id
 */
router.patch('/:id', async (req, res) => {
  try {
    logRoute('PATCH /:id hit', {
      params: req.params,
      body: req.body,
    });

    const { status } = req.body;

    const updated = await Subscription.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );

    logRoute('PATCH /:id result', {
      found: !!updated,
      updatedId: updated?._id || null,
      updatedStatus: updated?.status || null,
    });

    if (!updated) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    return res.json(updated);
  } catch (err) {
    logError('PATCH /:id failed', err);
    return res.status(500).json({
      error: 'Failed to update subscription',
      details: err.message,
    });
  }
});

/**
 * GET /api/subscriptions/:id/payment-sources
 * Fetches available Airwallex payment sources for the subscription's billing customer.
 * Used by the admin UI to populate the AUTO_CHARGE payment source dropdown.
 */
router.get('/:id/payment-sources', async (req, res) => {
  try {
    const subscription = await Subscription.findById(req.params.id);

    if (!subscription) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    const billingCustomerId = subscription.airwallexCustomerId;

    if (!billingCustomerId) {
      return res.status(400).json({ error: 'Subscription has no airwallexCustomerId' });
    }

    const token = await getAirwallexToken();

    const response = await axios.get(
      'https://api.airwallex.com/api/v1/payment_sources',
      {
        headers: { Authorization: `Bearer ${token}` },
        params: { billing_customer_id: billingCustomerId, page_size: 50 },
      }
    );

    const sources = response.data?.items || [];

    return res.json({ payment_sources: sources });
  } catch (err) {
    logError('GET /:id/payment-sources failed', err);
    return res.status(500).json({
      error: 'Failed to fetch payment sources',
      details: err.response?.data || err.message,
    });
  }
});

/**
 * OPTIONAL AIRWALLEX UPDATE BRIDGE
 * POST /api/subscriptions/:id/update-airwallex
 */
router.post('/:id/update', async (req, res) => {
  try {
    logRoute('POST /:id/update hit', {
      subscriptionId: req.params.id,
      body: req.body,
    });

    const { id } = req.params;
    const {
      cancel_at_period_end,
      collection_method,
      days_until_due,
      default_invoice_template,
      default_tax_percent,
      duration,
      legal_entity_id,
      linked_payment_account_id,
      metadata,
      payment_options,
      payment_source_id,
      trial_ends_at,
    } = req.body;

    // 🔍 STEP 1: Validate subscription exists in MongoDB
    const subscription = await Subscription.findById(id);
    
    logRoute('update subscription lookup', {
      found: !!subscription,
      id,
      externalSubscriptionId: subscription?.externalSubscriptionId,
    });

    if (!subscription) {
      return res.status(404).json({ 
        error: 'Subscription not found',
        code: 'SUBSCRIPTION_NOT_FOUND',
      });
    }

    if (!subscription.externalSubscriptionId) {
      return res.status(400).json({
        error: 'Subscription does not have externalSubscriptionId',
        code: 'MISSING_EXTERNAL_ID',
      });
    }

    // 🔍 STEP 2: Build Airwallex payload (only include provided fields)

    // AUTO_CHARGE requires a payment_source_id (psrc_)
    if (collection_method === 'AUTO_CHARGE' && !payment_source_id) {
      return res.status(400).json({
        error: 'payment_source_id (psrc_...) is required when switching to AUTO_CHARGE.',
        code: 'PAYMENT_SOURCE_REQUIRED',
      });
    }

    const trialEndsAtParsed = trial_ends_at ? dayjs.utc(trial_ends_at) : null;
    if (trial_ends_at && !trialEndsAtParsed.isValid()) {
      return res.status(400).json({
        error: 'Invalid trial_ends_at date format. Use ISO 8601 (e.g. 2026-04-01 or 2026-04-01T00:00:00Z).',
        code: 'INVALID_TRIAL_ENDS_AT',
      });
    }
    // Airwallex requires "YYYY-MM-DDTHH:mm:ss+0000" format (not .toISOString())
    const trialEndsAtIso = trialEndsAtParsed
      ? trialEndsAtParsed.startOf('day').format('YYYY-MM-DDTHH:mm:ss') + '+0000'
      : null;

    const airwallexPayload = {
      request_id: crypto.randomUUID(), // Auto-generate for idempotency
      ...(cancel_at_period_end !== undefined && { cancel_at_period_end }),
      ...(collection_method && { collection_method }),
      ...(days_until_due !== undefined && { days_until_due: Number(days_until_due) }),
      ...(default_invoice_template && { default_invoice_template }),
      ...(default_tax_percent !== undefined && { default_tax_percent: Number(default_tax_percent) }),
      ...(duration && { duration }),
      ...(legal_entity_id && { legal_entity_id }),
      // OUT_OF_BAND → must explicitly null linked_payment_account_id
      // AUTO_CHARGE / CHARGE_ON_CHECKOUT → required; use provided value or fall back to env
      // no collection_method change → include if provided, else omit
      ...(collection_method === 'OUT_OF_BAND'
        ? { linked_payment_account_id: null }
        : (collection_method === 'AUTO_CHARGE' || collection_method === 'CHARGE_ON_CHECKOUT')
          ? { linked_payment_account_id: linked_payment_account_id || process.env.AIRWALLEX_LINKED_PAYMENT_ACCOUNT_ID }
          : linked_payment_account_id
            ? { linked_payment_account_id }
            : {}),
      ...(metadata && { metadata }),
      ...(payment_options && { payment_options }),
      // AUTO_CHARGE → must provide payment_source_id
      // CHARGE_ON_CHECKOUT / OUT_OF_BAND → must explicitly null payment_source_id
      // no collection_method change → omit payment_source_id unless caller supplied one
      ...(collection_method === 'AUTO_CHARGE'
        ? { payment_source_id }                           // required; validated below
        : collection_method                               // switching away from AUTO_CHARGE
          ? { payment_source_id: null }
          : payment_source_id                             // no method change, but psrc provided
            ? { payment_source_id }
            : {}),
      ...(trialEndsAtIso && { trial_ends_at: trialEndsAtIso }),
    };

    // 🔍 STEP 3: Validate enum values (optional but recommended)
    const VALID_COLLECTION_METHODS = ['AUTO_CHARGE', 'CHARGE_ON_CHECKOUT', 'OUT_OF_BAND'];
    const VALID_PERIOD_UNITS = ['DAY', 'WEEK', 'MONTH', 'YEAR'];
    
    if (collection_method && !VALID_COLLECTION_METHODS.includes(collection_method)) {
      return res.status(400).json({
        error: `Invalid collection_method. Must be one of: ${VALID_COLLECTION_METHODS.join(', ')}`,
        code: 'INVALID_COLLECTION_METHOD',
      });
    }
    
    if (duration?.period_unit && !VALID_PERIOD_UNITS.includes(duration.period_unit)) {
      return res.status(400).json({
        error: `Invalid duration.period_unit. Must be one of: ${VALID_PERIOD_UNITS.join(', ')}`,
        code: 'INVALID_PERIOD_UNIT',
      });
    }

    // 🔍 STEP 4: Call Airwallex update endpoint
    logRoute('calling Airwallex update', {
      externalSubscriptionId: subscription.externalSubscriptionId,
      payload: airwallexPayload,
    });

    const { updateAirwallexSubscription, normaliseStatus, asDate } = require('../lib/airwallex/subscriptionAdmin');

    const airwallexRes = await updateAirwallexSubscription(
      subscription.externalSubscriptionId,
      airwallexPayload
    );

    logRoute('Airwallex update response received', {
      status: airwallexRes.status,
      subscription_id: airwallexRes.id,
      updated_at: airwallexRes.updated_at,
    });

    // 🔍 STEP 5: Sync response to MongoDB (Subscription projection)
    
    subscription.status = normaliseStatus(airwallexRes.status);
    subscription.nextBillingAt = asDate(airwallexRes.next_billing_at) || subscription.nextBillingAt;
    subscription.cancelAtPeriodEnd = airwallexRes.cancel_at_period_end;
    subscription.collectionMethod = airwallexRes.collection_method;
    subscription.paymentSourceId = airwallexRes.payment_source_id;
    subscription.lastSyncedAt = new Date();
    subscription.syncStatus = 'ok';
    subscription.syncError = null;
    
    // Store raw Airwallex fields in metadata for audit
    subscription.metadata = {
      ...(subscription.metadata || {}),
      latestAirwallexUpdateAt: new Date().toISOString(),
      airwallexRawStatus: airwallexRes.status,
    };
    
    await subscription.save();

    // 🔍 STEP 6: Sync to CustomerSubscription as well
    const updatedCustomerSub = await CustomerSubscription.findOneAndUpdate(
      { airwallexSubscriptionId: subscription.externalSubscriptionId },
      {
        $set: {
          status: normaliseStatus(airwallexRes.status),
          nextBillingAt: asDate(airwallexRes.next_billing_at),
          'metadata.lastAirwallexUpdateAt': new Date().toISOString(),
          'metadata.airwallexRawStatus': airwallexRes.status,
        },
      },
      { new: true }
    );

    logRoute('local update persisted', {
      subscriptionId: subscription._id,
      updatedCustomerSubscriptionId: updatedCustomerSub?._id,
      status: subscription.status,
    });

    // 🔍 STEP 7: Return success response
    return res.json({
      success: true,
      subscription,
      customerSubscription: updatedCustomerSub,
      airwallex: {
        id: airwallexRes.id,
        status: airwallexRes.status,
        updated_at: airwallexRes.updated_at,
        next_billing_at: airwallexRes.next_billing_at,
        collection_method: airwallexRes.collection_method,
      },
    });

  } catch (err) {
    logError('POST /:id/update failed', err);
    
    // Handle Airwallex-specific errors
    if (err.response?.status === 404) {
      return res.status(404).json({
        error: 'Subscription not found in Airwallex',
        code: 'AIRWALLEX_NOT_FOUND',
        details: err.response.data,
      });
    }
    
    if (err.response?.status === 400) {
      return res.status(400).json({
        error: err.response.data?.message || 'Invalid request to Airwallex',
        code: 'AIRWALLEX_VALIDATION_ERROR',
        details: err.response.data,
      });
    }

    return res.status(500).json({
      error: 'Failed to update subscription',
      code: 'UPDATE_ERROR',
      details: err.response?.data || err.message,
    });
  }
});

/**
 * CREATE SUBSCRIPTION PLACEHOLDER (LOCAL ONLY)
 * NOTE: aligned to current schema
 */
router.post('/', async (req, res) => {
  try {
    logRoute('POST / hit', {
      body: req.body,
    });

    const {
      subscriptionCustomerId,
      customerSubscriptionId,
      externalSubscriptionId,
      bigcommerceCustomerId,
      airwallexCustomerId,
      productId,
      planName,
      price,
      currency,
      interval,
      status,
      nextBillingAt,
    } = req.body;

    if (
      !subscriptionCustomerId ||
      !customerSubscriptionId ||
      !externalSubscriptionId
    ) {
      return res.status(400).json({
        error:
          'subscriptionCustomerId, customerSubscriptionId, and externalSubscriptionId are required',
      });
    }

    const existing = await Subscription.findOne({
      externalSubscriptionId,
    });

    logRoute('POST / existing lookup', {
      externalSubscriptionId,
      found: !!existing,
    });

    if (existing) {
      return res.status(409).json({
        error: 'Subscription already exists',
      });
    }

    const subscription = await Subscription.create({
      subscriptionCustomerId,
      customerSubscriptionId,
      externalSubscriptionId,
      airwallexCustomerId: airwallexCustomerId || null,
      bigcommerceCustomerId: bigcommerceCustomerId || null,
      planName: planName || null,
      productId: productId || null,
      price: price || null,
      currency: currency || null,
      interval: interval || null,
      status: status || 'pending',
      nextBillingAt: nextBillingAt || null,
      lastSyncedAt: new Date(),
    });

    logRoute('POST / created subscription', {
      id: subscription._id,
      externalSubscriptionId: subscription.externalSubscriptionId,
    });

    return res.status(201).json(subscription);
  } catch (err) {
    logError('POST / failed', err);
    return res.status(500).json({
      error: 'Internal server error',
      details: err.message,
    });
  }
});

module.exports = router;