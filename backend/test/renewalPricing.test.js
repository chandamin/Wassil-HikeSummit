const test = require('node:test');
const assert = require('node:assert/strict');
const { buildUsdBillingPrice, buildReplacementPayload, buildHoldBillingPayload } = require('../lib/airwallex/renewalPricing');

test('creates a recurring USD price from the promised GBP amount', () => {
  const price = buildUsdBillingPrice({ productId: 'prd_1', gbpAmount: 24.99, rate: 1.25, interval: 'MONTH', requestId: 'req_1' });
  assert.equal(price.currency, 'USD');
  assert.equal(price.flat_amount, 31.24);
  assert.deepEqual(price.recurring, { period: 1, period_unit: 'MONTH' });
});

test('replaces a subscription item without an immediate or prorated charge', () => {
  const payload = buildReplacementPayload({ itemId: 'item_1', priceId: 'pri_new', requestId: 'req_2' });
  assert.equal(payload.billing_action, 'DEFER_CHARGE_AND_KEEP_CYCLE');
  assert.equal(payload.default_proration_mode, 'NONE');
  assert.deepEqual(payload.items, [
    { id: 'item_1', deleted: true, proration_mode: 'NONE' },
    { price_id: 'pri_new', quantity: 1, proration_mode: 'NONE' },
  ]);
});

test('holds automatic collection when GBP-equivalent renewal cannot be prepared', () => {
  assert.deepEqual(buildHoldBillingPayload('req_hold'), { request_id: 'req_hold', collection_method: 'OUT_OF_BAND' });
});
