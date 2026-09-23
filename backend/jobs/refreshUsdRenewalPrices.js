const crypto = require('crypto');
const axios = require('axios');
const CustomerSubscription = require('../models/CustomerSubscription');
const RenewalPriceRefresh = require('../models/RenewalPriceRefresh');
const { getAirwallexToken } = require('../lib/airwallex/token');
const { getGbpToUsdRate } = require('../lib/bigcommerce/fx');
const { buildUsdBillingPrice, buildReplacementPayload, buildHoldBillingPayload } = require('../lib/airwallex/renewalPricing');

const BASE_URL = process.env.AIRWALLEX_BASE_URL || 'https://api.airwallex.com';

function renewalWindow(nextBillingAt, now = Date.now()) {
  const remaining = new Date(nextBillingAt).getTime() - now;
  if (!Number.isFinite(remaining) || remaining <= 2 * 60 * 60 * 1000) return 'late';
  return remaining <= 6 * 60 * 60 * 1000 ? 'refresh' : 'early';
}

function renewalCycleKey(subscriptionId, nextBillingAt) {
  return `${subscriptionId}:${new Date(nextBillingAt).toISOString()}`;
}

async function holdAutomaticCollection(subscription) {
  try {
    const token = await getAirwallexToken();
    await axios.post(
      `${BASE_URL}/api/v1/subscriptions/${encodeURIComponent(subscription.airwallexSubscriptionId)}/update`,
      buildHoldBillingPayload(crypto.createHash('sha256').update(`${subscription.airwallexSubscriptionId}:${subscription.nextBillingAt?.toISOString()}:hold`).digest('hex')),
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'x-api-version': '2026-02-27' } }
    );
    subscription.renewalFxStatus = 'held';
    await subscription.save();
  } catch (holdError) {
    console.error('[renewal-fx] CRITICAL: automatic collection could not be held', subscription.airwallexSubscriptionId, holdError);
  }
}

async function claimCycle(subscription, now) {
  const cycleKey = renewalCycleKey(subscription.airwallexSubscriptionId, subscription.nextBillingAt);
  const leaseUntil = new Date(now + 15 * 60 * 1000);
  const claimed = await RenewalPriceRefresh.findOneAndUpdate(
    { cycleKey, $or: [{ status: 'failed' }, { status: 'claimed', leaseUntil: { $lt: new Date(now) } }] },
    { $set: { status: 'claimed', error: null, leaseUntil } },
    { new: true }
  );
  if (claimed) return claimed;
  try {
    return await RenewalPriceRefresh.create({ cycleKey, subscriptionId: subscription.airwallexSubscriptionId, status: 'claimed', leaseUntil });
  } catch (err) {
    if (err.code === 11000) return null;
    throw err;
  }
}

async function refreshOne(subscription, now = Date.now()) {
  if (!subscription.renewalFxEnabled || subscription.currency !== 'USD') return 'skipped';
  if (subscription.renewalFxStatus === 'held') return 'held';
  if (['CANCELLED', 'UNPAID'].includes(String(subscription.status).toUpperCase())) return 'skipped';
  let window = renewalWindow(subscription.nextBillingAt, now);
  if (window === 'late') {
    try {
      const token = await getAirwallexToken();
      const current = await axios.get(`${BASE_URL}/api/v1/subscriptions/${encodeURIComponent(subscription.airwallexSubscriptionId)}`, {
        headers: { Authorization: `Bearer ${token}`, 'x-api-version': '2026-02-27' },
      });
      const latestDate = new Date(current.data.next_billing_at);
      if (Number.isFinite(latestDate.getTime()) && latestDate > new Date(subscription.nextBillingAt)) {
        subscription.nextBillingAt = latestDate;
        subscription.status = current.data.status;
        await subscription.save();
        window = renewalWindow(latestDate, now);
      }
    } catch (err) {
      console.error('[renewal-fx] Unable to refresh billing date', subscription.airwallexSubscriptionId, err);
    }
  }
  if (window === 'late') {
    subscription.renewalFxStatus = 'failed';
    await subscription.save();
    console.error('[renewal-fx] ACTION REQUIRED: renewal cutoff missed', subscription.airwallexSubscriptionId);
    await holdAutomaticCollection(subscription);
  }
  if (window !== 'refresh') return window;
  const claim = await claimCycle(subscription, now);
  if (!claim) return 'already-claimed';
  try {
    const token = await getAirwallexToken();
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'x-api-version': '2026-02-27' };
    const current = await axios.get(`${BASE_URL}/api/v1/subscriptions/${encodeURIComponent(subscription.airwallexSubscriptionId)}`, { headers });
    const item = current.data.items?.find(entry => entry.price?.id === subscription.airwallexPriceId || entry.price_id === subscription.airwallexPriceId);
    const alreadyUpdated = claim.priceId && current.data.items?.find(entry => entry.price?.id === claim.priceId || entry.price_id === claim.priceId);
    if ((!item?.id && !alreadyUpdated) || current.data.currency !== 'USD') throw new Error('Current USD subscription item mismatch');
    const gbpAmount = Number(subscription.displayAmountGbp);
    let fx = null;
    let usdAmount = claim.usdAmount;
    let priceId = claim.priceId;
    if (!priceId) {
      fx = await getGbpToUsdRate({
        storeHash: process.env.BC_STORE_HASH || 'rnt2jw80we',
        apiToken: process.env.BC_API_TOKEN,
        http: axios,
      });
      const pricePayload = buildUsdBillingPrice({
        productId: subscription.airwallexProductId,
        gbpAmount,
        rate: fx.rate,
        interval: subscription.interval,
        requestId: crypto.createHash('sha256').update(`${claim.cycleKey}:price`).digest('hex'),
      });
      const priceResponse = await axios.post(`${BASE_URL}/api/v1/prices/create`, pricePayload, { headers });
      priceId = priceResponse.data.id;
      usdAmount = pricePayload.flat_amount;
      claim.priceId = priceId;
      claim.usdAmount = usdAmount;
      await claim.save();
    }
    if (!alreadyUpdated) {
      const replacementPayload = buildReplacementPayload({
        itemId: item.id,
        priceId,
        requestId: crypto.createHash('sha256').update(`${claim.cycleKey}:replace`).digest('hex'),
      });
      await axios.post(`${BASE_URL}/api/v1/subscriptions/${encodeURIComponent(subscription.airwallexSubscriptionId)}/update`, replacementPayload, { headers });
    }
    const updated = await axios.get(`${BASE_URL}/api/v1/subscriptions/${encodeURIComponent(subscription.airwallexSubscriptionId)}`, { headers });
    const updatedItem = updated.data.items?.find(entry => entry.price?.id === priceId || entry.price_id === priceId);
    if (!updatedItem?.id) throw new Error('Renewal price replacement was not confirmed');
    subscription.airwallexPriceId = priceId;
    subscription.airwallexItemId = updatedItem.id;
    subscription.billingAmountUsd = usdAmount;
    subscription.amount = usdAmount;
    if (fx) {
      subscription.fxRate = fx.rate;
      subscription.fxTimestamp = new Date(fx.timestamp);
    }
    subscription.renewalFxStatus = 'ready';
    await subscription.save();
    claim.status = 'complete';
    claim.priceId = priceId;
    claim.usdAmount = usdAmount;
    await claim.save();
    return 'complete';
  } catch (err) {
    claim.status = 'failed';
    claim.error = err.message;
    await claim.save();
    subscription.renewalFxStatus = 'failed';
    await subscription.save();
    console.error('[renewal-fx] ACTION REQUIRED', subscription.airwallexSubscriptionId, err);
    await holdAutomaticCollection(subscription);
    return 'failed';
  }
}

async function refreshUsdRenewalPrices(now = Date.now()) {
  const until = new Date(now + 6 * 60 * 60 * 1000);
  const subscriptions = await CustomerSubscription.find({
    renewalFxEnabled: true,
    currency: 'USD',
    nextBillingAt: { $lte: until },
  });
  const results = [];
  for (const subscription of subscriptions) {
    results.push({ id: subscription.airwallexSubscriptionId, result: await refreshOne(subscription, now) });
  }
  return results;
}

module.exports = { renewalWindow, renewalCycleKey, refreshOne, refreshUsdRenewalPrices };
