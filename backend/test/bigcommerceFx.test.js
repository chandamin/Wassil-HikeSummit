const test = require('node:test');
const assert = require('node:assert/strict');
const { extractGbpUsdRate, getGbpToUsdRate } = require('../lib/bigcommerce/fx');

const currencies = [
  { currency_code: 'GBP', currency_exchange_rate: '1.0000000000', is_transactional: true },
  { currency_code: 'USD', currency_exchange_rate: '1.3534000001', is_transactional: true },
];

test('extracts the configured GBP-to-USD rate from BigCommerce currencies', () => {
  const fx = extractGbpUsdRate(currencies, new Date('2026-09-21T10:00:00Z'));
  assert.equal(fx.rate, 1.3534000001);
  assert.equal(fx.source, 'bigcommerce');
  assert.equal(fx.timestamp, '2026-09-21T10:00:00.000Z');
});

test('uses the ratio when the GBP base rate is not one', () => {
  const fx = extractGbpUsdRate([
    { currency_code: 'GBP', currency_exchange_rate: '2', is_transactional: true },
    { currency_code: 'USD', currency_exchange_rate: '2.7', is_transactional: true },
  ]);
  assert.equal(fx.rate, 1.35);
});

test('rejects missing, disabled, or invalid configured currencies', () => {
  assert.throws(() => extractGbpUsdRate(currencies.slice(0, 1)), /USD/i);
  assert.throws(() => extractGbpUsdRate(currencies.map(c => c.currency_code === 'USD' ? { ...c, is_transactional: false } : c)), /transactional/i);
  assert.throws(() => extractGbpUsdRate(currencies.map(c => c.currency_code === 'USD' ? { ...c, currency_exchange_rate: '0' } : c)), /rate/i);
});

test('requests currencies from the BigCommerce management API', async () => {
  const calls = [];
  const http = { get: async (url, options) => {
    calls.push({ url, options });
    return { data: currencies };
  } };
  const fx = await getGbpToUsdRate({ storeHash: 'store123', apiToken: 'secret', http });
  assert.equal(fx.rate, 1.3534000001);
  assert.equal(calls[0].url, 'https://api.bigcommerce.com/stores/store123/v2/currencies');
  assert.equal(calls[0].options.headers['X-Auth-Token'], 'secret');
});
