const test = require('node:test');
const assert = require('node:assert/strict');
const { verifyPaidIntent } = require('../lib/paymentVerification');

const stored = { cartId: 'cart-1', usdAmount: 31.24, currency: 'USD', fingerprint: 'abc' };
const paid = { status: 'SUCCEEDED', currency: 'USD', amount: 31.24, merchant_order_id: 'cart-1' };

test('accepts a successful USD payment matching stored checkout pricing', () => {
  assert.equal(verifyPaidIntent(paid, stored, 'abc'), true);
});

test('rejects a forged successful status with mismatched amount or currency', () => {
  assert.throws(() => verifyPaidIntent({ ...paid, amount: 30 }, stored, 'abc'), /amount/i);
  assert.throws(() => verifyPaidIntent({ ...paid, currency: 'GBP' }, stored, 'abc'), /currency/i);
});

test('rejects a changed cart after payment intent creation', () => {
  assert.throws(() => verifyPaidIntent(paid, stored, 'changed'), /cart/i);
});
