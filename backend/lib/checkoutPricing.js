const crypto = require('crypto');

function calculateCheckoutGbp({ cart, checkout, shippingOptionId }) {
  if (!cart?.id || cart.currency?.code !== 'GBP') throw new Error('Expected a GBP cart');
  const cartAmount = Number(cart.cart_amount);
  if (!Number.isFinite(cartAmount) || cartAmount <= 0) throw new Error('Invalid cart amount');
  const consignments = checkout?.consignments || [];
  let shippingCost = 0;
  if (shippingOptionId) {
    const option = consignments.flatMap(item => item.available_shipping_options || [])
      .find(item => item.id === shippingOptionId);
    if (!option) throw new Error('Selected shipping option is unavailable');
    shippingCost = Number(option.cost_inc_tax ?? option.cost ?? option.cost_ex_tax);
    if (!Number.isFinite(shippingCost) || shippingCost < 0) throw new Error('Invalid shipping cost');
  } else if ((cart.line_items?.physical_items || []).length > 0) {
    throw new Error('Shipping option required for physical cart');
  }
  const gbpAmount = Math.round((cartAmount + shippingCost + Number.EPSILON) * 100) / 100;
  const fingerprint = crypto.createHash('sha256').update(JSON.stringify({
    id: cart.id, cartAmount, shippingOptionId: shippingOptionId || null, shippingCost,
    lineItems: cart.line_items, coupons: cart.coupons, tax: cart.tax_amount,
  })).digest('hex');
  return {
    cartId: cart.id, gbpAmount, shippingCost, fingerprint,
    discountAmount: Number(cart.discount_amount || 0),
    taxAmount: Number(checkout?.tax_total ?? cart.tax_amount ?? 0),
    lineItems: [
    ...(cart.line_items?.physical_items || []),
    ...(cart.line_items?.digital_items || []),
    ],
  };
}

function assertOrderMatchesCart(cartItems, orderItems) {
  const normalizeOptions = (options, fromCart) => (options || []).map(option => {
    const id = fromCart ? (option.nameId ?? option.name_id) : option.id;
    const value = fromCart ? (option.valueId ?? option.value_id) : option.value;
    if (id == null || value == null) throw new Error('Order products contain unverifiable options');
    return `${id}:${value}`;
  }).sort().join(',');
  const normalize = (items, fromCart) => (items || [])
    .map(item => `${Number(item.product_id)}:${Number(item.quantity)}:${normalizeOptions(fromCart ? item.options : item.product_options, fromCart)}`)
    .sort();
  if (JSON.stringify(normalize(cartItems, true)) !== JSON.stringify(normalize(orderItems, false))) {
    throw new Error('Order products do not match paid cart');
  }
  return true;
}

async function fetchCheckoutGbp({ cartId, shippingOptionId, storeHash, apiToken, fetcher = fetch }) {
  if (!cartId || !storeHash || !apiToken) throw new Error('Missing BigCommerce checkout configuration');
  const base = `https://api.bigcommerce.com/stores/${storeHash}/v3`;
  const headers = { 'X-Auth-Token': apiToken, Accept: 'application/json' };
  const [cartResponse, checkoutResponse] = await Promise.all([
    fetcher(`${base}/carts/${encodeURIComponent(cartId)}?include=line_items.physical_items.options,line_items.digital_items,coupons`, { headers }),
    fetcher(`${base}/checkouts/${encodeURIComponent(cartId)}?include=consignments.available_shipping_options`, { headers }),
  ]);
  if (!cartResponse.ok || !checkoutResponse.ok) throw new Error('Unable to verify BigCommerce cart or shipping');
  const [cartBody, checkoutBody] = await Promise.all([cartResponse.json(), checkoutResponse.json()]);
  return calculateCheckoutGbp({ cart: cartBody.data, checkout: checkoutBody.data, shippingOptionId });
}

module.exports = { calculateCheckoutGbp, fetchCheckoutGbp, assertOrderMatchesCart };
