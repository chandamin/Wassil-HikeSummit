function assertUsdOrderMatchesPayment(order, payment) {
  if (!Number.isInteger(Number(order?.id)) || Number(order.id) <= 0) {
    throw new Error('BigCommerce order ID missing');
  }
  if (order.default_currency_code !== 'USD') {
    throw new Error('BigCommerce transactional currency is not USD');
  }
  const total = Number(order.total_inc_tax);
  const paid = Number(payment?.usdAmount);
  if (!Number.isFinite(total) || !Number.isFinite(paid) ||
      Math.round(total * 100) !== Math.round(paid * 100)) {
    throw new Error('BigCommerce USD total differs from paid amount');
  }
  return true;
}

function buildUsdOrderFields(pricing) {
  return {
    default_currency_code: 'USD',
    products: pricing.products,
    shipping_cost_inc_tax: pricing.shippingCost,
    shipping_cost_ex_tax: pricing.shippingCostExTax,
    discount_amount: pricing.discountAmount,
    total_inc_tax: pricing.totalIncTax,
    total_ex_tax: pricing.totalExTax,
    // is_tax_inclusive_pricing: true,
  };
}

function requiresUsdOrderVerification(usdCheckoutEnabled, storedPayment, usdOrderEnabled = false) {
  return Boolean(usdCheckoutEnabled || storedPayment || usdOrderEnabled);
}

function classifyOrderCreateFailure({ paidUsd, httpStatus, apiError }) {
  return paidUsd
    ? { status: 409, reconciliationRequired: true,
        error: 'Payment succeeded but BigCommerce USD order could not be created; manual review required' }
    : { status: 400, reconciliationRequired: false,
        error: apiError || `Failed to create order: ${httpStatus}` };
}

module.exports = {
  assertUsdOrderMatchesPayment, buildUsdOrderFields,
  requiresUsdOrderVerification, classifyOrderCreateFailure,
};
