const crypto = require('crypto');

function verifyAirwallexWebhook({ rawBody, timestamp, signature, secret, now = Date.now() }) {
  if (!rawBody || !timestamp || !signature || !secret) throw new Error('Missing webhook signature fields');
  const digest = crypto.createHmac('sha256', secret).update(String(timestamp) + rawBody).digest('hex');
  const expected = Buffer.from(digest, 'hex');
  const received = Buffer.from(signature, 'hex');
  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) {
    throw new Error('Invalid webhook signature');
  }
  const signedAt = Number(timestamp) < 1e12 ? Number(timestamp) * 1000 : Number(timestamp);
  if (!Number.isFinite(signedAt) || Math.abs(now - signedAt) > 5 * 60_000) throw new Error('Webhook timestamp expired');
  return true;
}

module.exports = { verifyAirwallexWebhook };
