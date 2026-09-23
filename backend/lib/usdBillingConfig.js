function isUsdBillingEnabled(env = process.env) {
  return isUsdCheckoutEnabled(env);
}

function isUsdCheckoutTestEnabled(env = process.env) {
  if (env.ENABLE_USD_CHECKOUT_TEST === 'false') return false;
  try {
    const url = new URL(env.AIRWALLEX_BASE_URL || '');
    return url.protocol === 'https:'
      && ['api-demo.airwallex.com', 'api.sandbox.airwallex.com'].includes(url.hostname);
  } catch {
    return false;
  }
}

function isUsdCheckoutEnabled(env = process.env) {
  try {
    const url = new URL(env.AIRWALLEX_BASE_URL || '');
    if (url.protocol !== 'https:') return false;
    if (url.hostname === 'api.airwallex.com') return true;
    return isUsdCheckoutTestEnabled(env);
  } catch {
    return false;
  }
}

function isRenewalFxWorkerEnabled(env = process.env) {
  return isUsdCheckoutEnabled(env)
    && env.ENABLE_RENEWAL_FX_WORKER === 'true'
    && env.AIRWALLEX_RENEWAL_SANDBOX_VERIFIED === 'true'
    && Boolean(env.AIRWALLEX_BILLING_WEBHOOK_SECRET);
}

function isUsdBigCommerceOrderEnabled(env = process.env) {
  return isUsdCheckoutEnabled(env);
}

function assertUsdBigCommerceOrdersEnabled(env = process.env) {
  if (!isUsdBigCommerceOrderEnabled(env)) {
    const error = new Error('USD BigCommerce orders are not enabled');
    error.status = 503;
    throw error;
  }
  return true;
}

function assertUsdCheckoutConfiguration(env = process.env) {
  if (isUsdBigCommerceOrderEnabled(env) && !isUsdCheckoutEnabled(env)) {
    const error = new Error('USD checkout is not enabled for USD BigCommerce orders');
    error.status = 503;
    throw error;
  }
  return true;
}

module.exports = {
  isUsdBillingEnabled, isUsdCheckoutEnabled, isUsdCheckoutTestEnabled,
  isRenewalFxWorkerEnabled,
  isUsdBigCommerceOrderEnabled, assertUsdBigCommerceOrdersEnabled, assertUsdCheckoutConfiguration,
};
