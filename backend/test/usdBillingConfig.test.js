const test = require('node:test');
const assert = require('node:assert/strict');
const { isUsdBillingEnabled, isUsdCheckoutEnabled, assertUsdBigCommerceOrdersEnabled, assertUsdCheckoutConfiguration } = require('../lib/usdBillingConfig');

test('keeps USD billing disabled without explicit checkout and renewal switches', () => {
  assert.equal(isUsdBillingEnabled({}), false);
  assert.equal(isUsdBillingEnabled({ ENABLE_GBP_USD_BILLING: 'true' }), false);
});

test('enables USD checkout directly on the Airwallex demo host without renewal credentials', () => {
  assert.equal(isUsdCheckoutEnabled({ AIRWALLEX_BASE_URL: 'https://api.airwallex.com' }), true);
  assert.equal(isUsdCheckoutEnabled({ AIRWALLEX_BASE_URL: 'https://api.sandbox.airwallex.com' }), true);
});

test('sandbox subscription billing uses USD so renewals match the USD checkout', () => {
  assert.equal(isUsdBillingEnabled({ AIRWALLEX_BASE_URL: 'https://api.airwallex.com' }), true);
  assert.equal(isUsdBillingEnabled({ AIRWALLEX_BASE_URL: 'https://api.sandbox.airwallex.com' }), true);
});

test('never enables sandbox checkout on a live or lookalike host', () => {
  assert.equal(isUsdCheckoutEnabled({ AIRWALLEX_BASE_URL: 'https://api.airwallex.com' }), false);
  assert.equal(isUsdCheckoutEnabled({ AIRWALLEX_BASE_URL: 'https://api.airwallex.com.attacker.test' }), false);
  assert.equal(isUsdCheckoutEnabled({ AIRWALLEX_BASE_URL: 'http://api-demo.airwallex.com' }), false);
});

test('allows explicitly disabling direct sandbox checkout', () => {
  assert.equal(isUsdCheckoutEnabled({ AIRWALLEX_BASE_URL: 'https://api.airwallex.com', ENABLE_USD_CHECKOUT_TEST: 'false' }), false);
});

test('enables USD billing only when checkout and renewal worker are both enabled', () => {
  assert.equal(isUsdBillingEnabled({ ENABLE_GBP_USD_BILLING: 'true', ENABLE_RENEWAL_FX_WORKER: 'true' }), false);
  assert.equal(isUsdBillingEnabled({ ENABLE_GBP_USD_BILLING: 'true', ENABLE_RENEWAL_FX_WORKER: 'true', AIRWALLEX_RENEWAL_SANDBOX_VERIFIED: 'true' }), false);
  assert.equal(isUsdBillingEnabled({ ENABLE_GBP_USD_BILLING: 'true', ENABLE_RENEWAL_FX_WORKER: 'true', AIRWALLEX_RENEWAL_SANDBOX_VERIFIED: 'true', AIRWALLEX_BILLING_WEBHOOK_SECRET: 'secret' }), true);
});

test('enables USD BigCommerce orders whenever USD checkout is enabled', () => {
  assert.throws(() => assertUsdBigCommerceOrdersEnabled({}), /USD BigCommerce orders/i);
  assert.equal(assertUsdBigCommerceOrdersEnabled({ AIRWALLEX_BASE_URL: 'https://api.airwallex.com' }), true);
  assert.equal(assertUsdBigCommerceOrdersEnabled({
    ENABLE_GBP_USD_BILLING: 'true', ENABLE_RENEWAL_FX_WORKER: 'true',
    AIRWALLEX_RENEWAL_SANDBOX_VERIFIED: 'true', AIRWALLEX_BILLING_WEBHOOK_SECRET: 'secret',
  }), true);
});

test('does not require a separate USD BigCommerce environment flag', () => {
  assert.equal(assertUsdCheckoutConfiguration({
    AIRWALLEX_BASE_URL: 'https://api.airwallex.com',
  }), true);
});
