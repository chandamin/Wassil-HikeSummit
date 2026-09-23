const test = require('node:test');
const assert = require('node:assert/strict');
const { assertUsdOrderMatchesPayment, buildUsdOrderFields, requiresUsdOrderVerification, classifyOrderCreateFailure } = require('../lib/usdOrderReconciliation');

test('classifies a failed BigCommerce request after USD payment as manual reconciliation', () => {
  const failure = classifyOrderCreateFailure({ paidUsd: true, httpStatus: 400 });
  assert.equal(failure.status, 409);
  assert.equal(failure.reconciliationRequired, true);
  assert.match(failure.error, /payment succeeded/i);
});

test('preserves a useful BigCommerce error for an unpaid legacy order', () => {
  const failure = classifyOrderCreateFailure({ paidUsd: false, httpStatus: 422, apiError: 'Product is unavailable' });
  assert.equal(failure.status, 400);
  assert.equal(failure.error, 'Product is unavailable');
});

test('continues USD verification for an already-paid intent after checkout switch changes', () => {
  assert.equal(requiresUsdOrderVerification(false, { intentId: 'int_123' }), true);
  assert.equal(requiresUsdOrderVerification(false, null), false);
  assert.equal(requiresUsdOrderVerification(true, null), true);
});

test('requires a stored USD payment when USD BigCommerce orders are enabled', () => {
  assert.equal(requiresUsdOrderVerification(false, null, true), true);
});

test('accepts only a real USD transactional order matching the paid cents', () => {
  assert.equal(assertUsdOrderMatchesPayment(
    { id: 4139, default_currency_code: 'USD', currency_code: 'GBP', total_inc_tax: '73.0400' },
    { usdAmount: 73.04 }
  ), true);
});

test('rejects a GBP transactional order even when its numeric total matches', () => {
  assert.throws(() => assertUsdOrderMatchesPayment(
    { id: 4139, default_currency_code: 'GBP', total_inc_tax: '73.04' },
    { usdAmount: 73.04 }
  ), /transactional currency/i);
});

test('rejects a USD order that differs by one cent', () => {
  assert.throws(() => assertUsdOrderMatchesPayment(
    { id: 4139, default_currency_code: 'USD', total_inc_tax: '73.03' },
    { usdAmount: 73.04 }
  ), /USD total/i);
});

test('rejects an order missing an ID or numeric total', () => {
  assert.throws(() => assertUsdOrderMatchesPayment(
    { default_currency_code: 'USD', total_inc_tax: '73.04' },
    { usdAmount: 73.04 }
  ), /order ID/i);
  assert.throws(() => assertUsdOrderMatchesPayment(
    { id: 4139, default_currency_code: 'USD', total_inc_tax: 'n/a' },
    { usdAmount: 73.04 }
  ), /USD total/i);
});

test('builds USD V2 fields without setting read-only display currency', () => {
  const fields = buildUsdOrderFields({
    products: [{ product_id: 265, quantity: 1, price_inc_tax: 73.04, price_ex_tax: 73.04 }],
    shippingCost: 0, shippingCostExTax: 0, discountAmount: 0,
    totalIncTax: 73.04, totalExTax: 73.04, taxAmount: 0,
  });
  assert.equal(fields.default_currency_code, 'USD');
  assert.equal(Object.hasOwn(fields, 'store_default_currency_code'), false);
  assert.equal(fields.total_inc_tax, 73.04);
  assert.equal(fields.products[0].price_inc_tax, 73.04);
  assert.equal(Object.hasOwn(fields, 'currency_code'), false);
});
