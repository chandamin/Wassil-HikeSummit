const { priceUsd } = require('./airwallex/fx');

function toCents(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error('Invalid order amount');
  }
  return Math.round((value + Number.EPSILON) * 100);
}

function fromCents(value) {
  return value / 100;
}

function buildUsdOrderPricing({ checkoutPricing, payment }) {
  if (!checkoutPricing || !payment) throw new Error('Missing order pricing');
  const gbpCents = toCents(Number(checkoutPricing.gbpAmount));
  const paidCents = toCents(payment.usdAmount);
  const rate = Number(payment.fxRate);
  if (gbpCents <= 0 || paidCents <= 0 || !Number.isFinite(rate) || rate <= 0) {
    throw new Error('Invalid order amount or FX rate');
  }
  if (toCents(Number(payment.gbpAmount)) !== gbpCents ||
      toCents(fromCents(gbpCents) * rate) !== paidCents) {
    throw new Error('Saved FX rate and payment amount do not match GBP cart');
  }

  const items = checkoutPricing.lineItems || [];
  if (!items.length) throw new Error('Order components contain no products');
  const shippingGbpCents = toCents(Number(checkoutPricing.shippingCost || 0));
  const taxGbpCents = toCents(Number(checkoutPricing.taxAmount || 0));
  if (taxGbpCents > gbpCents) throw new Error('Invalid order tax amount');

  const itemGbpCents = items.map((item) => {
    if (!Number.isInteger(Number(item.product_id)) || !Number.isInteger(Number(item.quantity)) || Number(item.quantity) <= 0) {
      throw new Error('Invalid order product or quantity');
    }
    return toCents(Number(item.extended_sale_price));
  });
  const grossGbpCents = itemGbpCents.reduce((sum, value) => sum + value, shippingGbpCents);
  const discountGbpCents = grossGbpCents - gbpCents;
  if (discountGbpCents < 0 || discountGbpCents > grossGbpCents) {
    throw new Error('GBP order components do not match payable cart amount');
  }

  const itemUsdCents = itemGbpCents.map(value => Math.round(value * rate));
  let shippingUsdCents = Math.round(shippingGbpCents * rate);
  const discountUsdCents = Math.round(discountGbpCents * rate);
  const convertedTotal = itemUsdCents.reduce((sum, value) => sum + value, shippingUsdCents) - discountUsdCents;
  const residual = paidCents - convertedTotal;
  const residualIndex = itemGbpCents.findIndex(value => value > 0);
  if (residualIndex >= 0) {
    itemUsdCents[residualIndex] += residual;
    if (itemUsdCents[residualIndex] < 0) throw new Error('USD order components cannot absorb rounding');
  } else if (shippingGbpCents > 0) {
    shippingUsdCents += residual;
    if (shippingUsdCents < 0) throw new Error('USD shipping cannot absorb rounding');
  } else {
    throw new Error('USD order components contain no payable amount');
  }

  const taxUsdCents = Math.round(taxGbpCents * rate);
  const taxableGbpCents = itemGbpCents.reduce((sum, value) => sum + value, shippingGbpCents);
  const weights = [...itemGbpCents, shippingGbpCents];
  const capacities = [...itemUsdCents, shippingUsdCents];
  const taxShares = weights.map(value => taxUsdCents * value / taxableGbpCents);
  const allocatedTax = taxShares.map((share, index) => Math.min(capacities[index], Math.floor(share)));
  let remainingTax = taxUsdCents - allocatedTax.reduce((sum, value) => sum + value, 0);
  const taxOrder = weights.map((_, index) => index).sort((a, b) =>
    (taxShares[b] - Math.floor(taxShares[b])) - (taxShares[a] - Math.floor(taxShares[a])) || a - b
  );
  while (remainingTax > 0) {
    const index = taxOrder.find(candidate => allocatedTax[candidate] < capacities[candidate]);
    if (index === undefined) throw new Error('USD order tax exceeds priced components');
    allocatedTax[index] += 1;
    remainingTax -= 1;
  }
  const itemTaxCents = allocatedTax.slice(0, items.length);
  const products = items.map((item, index) => {
    const quantity = Number(item.quantity);
    const lineIncCents = itemUsdCents[index];
    const lineExCents = lineIncCents - itemTaxCents[index];
    if (lineExCents < 0) throw new Error('USD order tax exceeds product price');
    return {
      product_id: Number(item.product_id),
      ...(item.variant_id && { variant_id: Number(item.variant_id) }),
      quantity,
      price_inc_tax: Number((fromCents(lineIncCents) / quantity).toFixed(4)),
      price_ex_tax: Number((fromCents(lineExCents) / quantity).toFixed(4)),
      product_options: (item.options || []).map(option => ({
        id: option.nameId ?? option.name_id,
        value: option.valueId ?? option.value_id,
      })),
    };
  });
  const shippingTaxCents = allocatedTax[items.length];
  if (shippingUsdCents - shippingTaxCents < 0) throw new Error('USD order tax exceeds shipping price');

  return {
    products,
    shippingCost: fromCents(shippingUsdCents),
    shippingCostExTax: fromCents(shippingUsdCents - shippingTaxCents),
    discountAmount: fromCents(discountUsdCents),
    totalIncTax: fromCents(paidCents),
    totalExTax: fromCents(paidCents - taxUsdCents),
    taxAmount: fromCents(taxUsdCents),
  };
}

function quoteUsdOrderAmount({ checkoutPricing, rate }) {
  const usdAmount = priceUsd({ gbpAmount: checkoutPricing.gbpAmount, rate });
  buildUsdOrderPricing({
    checkoutPricing,
    payment: { gbpAmount: checkoutPricing.gbpAmount, usdAmount, fxRate: rate },
  });
  return usdAmount;
}

module.exports = { buildUsdOrderPricing, quoteUsdOrderAmount };
