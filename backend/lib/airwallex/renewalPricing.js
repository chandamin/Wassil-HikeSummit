const { priceUsd } = require('./fx');

function buildUsdBillingPrice({ productId, gbpAmount, rate, interval, requestId }) {
  if (!productId || !requestId || !['MONTH', 'YEAR'].includes(interval)) throw new Error('Invalid recurring price');
  return {
    request_id: requestId,
    product_id: productId,
    currency: 'USD',
    pricing_model: 'FLAT',
    flat_amount: priceUsd({ gbpAmount, rate }),
    recurring: { period: 1, period_unit: interval },
  };
}

function buildReplacementPayload({ itemId, priceId, requestId }) {
  if (!itemId || !priceId || !requestId) throw new Error('Missing subscription item or price');
  return {
    request_id: requestId,
    billing_action: 'DEFER_CHARGE_AND_KEEP_CYCLE',
    default_proration_mode: 'NONE',
    items: [
      { id: itemId, deleted: true, proration_mode: 'NONE' },
      { price_id: priceId, quantity: 1, proration_mode: 'NONE' },
    ],
  };
}

function buildHoldBillingPayload(requestId) {
  if (!requestId) throw new Error('Request ID required to hold billing');
  return { request_id: requestId, collection_method: 'OUT_OF_BAND' };
}

module.exports = { buildUsdBillingPrice, buildReplacementPayload, buildHoldBillingPayload };
