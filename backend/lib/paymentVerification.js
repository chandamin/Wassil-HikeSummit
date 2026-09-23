function verifyPaidIntent(intent, stored, currentFingerprint) {
  if (intent?.status !== 'SUCCEEDED') throw new Error('Payment is not successful');
  if (intent.currency !== 'USD' || stored?.currency !== 'USD') throw new Error('Payment currency mismatch');
  if (Math.round(Number(intent.amount) * 100) !== Math.round(Number(stored.usdAmount) * 100)) {
    throw new Error('Payment amount mismatch');
  }
  if (intent.merchant_order_id !== stored.cartId || stored.fingerprint !== currentFingerprint) {
    throw new Error('Cart changed after payment');
  }
  return true;
}

module.exports = { verifyPaidIntent };
