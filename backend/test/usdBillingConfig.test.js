const test = require('node:test');
const assert = require('node:assert/strict');
const { isUsdBillingEnabled, isUsdCheckoutEnabled, isRenewalFxWorkerEnabled, assertUsdBigCommerceOrdersEnabled, assertUsdCheckoutConfiguration } = require('../lib/usdBillingConfig');

test('keeps USD checkout disabled without an approved Airwallex host', () => {
  assert.equal(isUsdBillingEnabled({}), false);
});

test('enables USD checkout on exact Airwallex demo, sandbox, and production hosts', () => {
  assert.equal(isUsdCheckoutEnabled({ AIRWALLEX_BASE_URL: 'https://api-demo.airwallex.com' }), true);
  assert.equal(isUsdCheckoutEnabled({ AIRWALLEX_BASE_URL: 'https://api.airwallex.com' }), true);
  assert.equal(isUsdCheckoutEnabled({ AIRWALLEX_BASE_URL: 'https://api.sandbox.airwallex.com' }), true);
});

test('subscription creation uses USD whenever USD checkout is enabled', () => {
  assert.equal(isUsdBillingEnabled({ AIRWALLEX_BASE_URL: 'https://api-demo.airwallex.com' }), true);
  assert.equal(isUsdBillingEnabled({ AIRWALLEX_BASE_URL: 'https://api.airwallex.com' }), true);
});

test('never enables USD checkout on a lookalike or insecure host', () => {
  assert.equal(isUsdCheckoutEnabled({ AIRWALLEX_BASE_URL: 'https://api.airwallex.com.attacker.test' }), false);
  assert.equal(isUsdCheckoutEnabled({ AIRWALLEX_BASE_URL: 'http://api-demo.airwallex.com' }), false);
});

test('allows explicitly disabling direct sandbox checkout', () => {
  assert.equal(isUsdCheckoutEnabled({ AIRWALLEX_BASE_URL: 'https://api-demo.airwallex.com', ENABLE_USD_CHECKOUT_TEST: 'false' }), false);
  assert.equal(isUsdCheckoutEnabled({ AIRWALLEX_BASE_URL: 'https://api.airwallex.com', ENABLE_USD_CHECKOUT_TEST: 'false' }), true);
});

test('starts the renewal worker only after its separate readiness checks', () => {
  const production = { AIRWALLEX_BASE_URL: 'https://api.airwallex.com' };
  assert.equal(isRenewalFxWorkerEnabled(production), false);
  assert.equal(isRenewalFxWorkerEnabled({ ...production, ENABLE_RENEWAL_FX_WORKER: 'true' }), false);
  assert.equal(isRenewalFxWorkerEnabled({
    ...production, ENABLE_RENEWAL_FX_WORKER: 'true',
    AIRWALLEX_RENEWAL_SANDBOX_VERIFIED: 'true', AIRWALLEX_BILLING_WEBHOOK_SECRET: 'secret',
  }), true);
});

test('enables USD BigCommerce orders whenever USD checkout is enabled', () => {
  assert.throws(() => assertUsdBigCommerceOrdersEnabled({}), /USD BigCommerce orders/i);
  assert.equal(assertUsdBigCommerceOrdersEnabled({ AIRWALLEX_BASE_URL: 'https://api-demo.airwallex.com' }), true);
  assert.equal(assertUsdBigCommerceOrdersEnabled({ AIRWALLEX_BASE_URL: 'https://api.airwallex.com' }), true);
});

test('does not require a separate USD BigCommerce environment flag', () => {
  assert.equal(assertUsdCheckoutConfiguration({
    AIRWALLEX_BASE_URL: 'https://api.airwallex.com',
  }), true);
});
