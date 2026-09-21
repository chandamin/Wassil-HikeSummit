const test = require('node:test');
const assert = require('node:assert/strict');
const { priceUsd, extractGbpUsdRate } = require('../lib/airwallex/fx');

test('prices a GBP amount in USD cents using an Airwallex rate', () => {
  assert.equal(priceUsd({ gbpAmount: 24.99, rate: 1.25 }), 31.24);
});

test('rejects missing or invalid GBP amounts and rates', () => {
  assert.throws(() => priceUsd({ gbpAmount: 24.99, rate: 0 }), /rate/i);
  assert.throws(() => priceUsd({ gbpAmount: 0, rate: 1.25 }), /amount/i);
});

test('extracts the client GBP-to-USD rate from Airwallex response', () => {
  const rate = extractGbpUsdRate({
    buy_currency: 'USD', sell_currency: 'GBP',
    created_at: '2026-09-21T10:00:00Z',
    rate_details: [{ level: 'CLIENT', buy_amount: 31.25, sell_amount: 25, rate: 1.25 }],
  }, Date.parse('2026-09-21T10:01:00Z'));
  assert.equal(rate.rate, 1.25);
  assert.equal(rate.source, 'airwallex');
});

test('rejects wrong currency direction or stale Airwallex response', () => {
  const response = {
    buy_currency: 'GBP', sell_currency: 'USD',
    created_at: '2026-09-21T10:00:00Z',
    rate_details: [{ level: 'CLIENT', rate: 1.25 }],
  };
  assert.throws(() => extractGbpUsdRate(response, Date.parse('2026-09-21T10:01:00Z')), /currency/i);
  assert.throws(() => extractGbpUsdRate({ ...response, buy_currency: 'USD', sell_currency: 'GBP' }, Date.parse('2026-09-21T10:10:00Z')), /stale/i);
});
