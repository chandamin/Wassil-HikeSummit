const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { verifyAirwallexWebhook } = require('../lib/airwallex/webhookSignature');

test('accepts an Airwallex HMAC over timestamp plus raw JSON', () => {
  const body = '{"id":"evt_1"}';
  const timestamp = '1758456000';
  const signature = crypto.createHmac('sha256', 'secret').update(timestamp + body).digest('hex');
  assert.equal(verifyAirwallexWebhook({ rawBody: body, timestamp, signature, secret: 'secret', now: Number(timestamp) * 1000 }), true);
});

test('rejects altered payload and stale webhook', () => {
  const body = '{"id":"evt_1"}';
  const timestamp = '1758456000';
  const signature = crypto.createHmac('sha256', 'secret').update(timestamp + body).digest('hex');
  assert.throws(() => verifyAirwallexWebhook({ rawBody: body + ' ', timestamp, signature, secret: 'secret', now: Number(timestamp) * 1000 }), /signature/i);
  assert.throws(() => verifyAirwallexWebhook({ rawBody: body, timestamp, signature, secret: 'secret', now: Number(timestamp) * 1000 + 600_000 }), /timestamp/i);
});
