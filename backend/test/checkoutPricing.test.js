const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateCheckoutGbp, fetchCheckoutGbp } = require('../lib/checkoutPricing');

test('uses BigCommerce cart and selected shipping option to price checkout', () => {
  const result = calculateCheckoutGbp({
    cart: { id: 'cart-1', cart_amount: 24.99, currency: { code: 'GBP' } },
    checkout: { consignments: [{ available_shipping_options: [{ id: 'ship-1', cost_inc_tax: 4.5 }] }] },
    shippingOptionId: 'ship-1',
  });
  assert.equal(result.gbpAmount, 29.49);
  assert.equal(result.cartId, 'cart-1');
});

test('preserves authoritative cart components for later USD order pricing', () => {
  const result = calculateCheckoutGbp({
    cart: {
      id: 'cart-2', cart_amount: 32, currency: { code: 'GBP' },
      discount_amount: 2, tax_amount: 1,
      line_items: { physical_items: [{ product_id: 101, quantity: 3, extended_sale_price: 30 }] },
    },
    checkout: { consignments: [{ available_shipping_options: [{ id: 'ship-1', cost_inc_tax: 4 }] }] },
    shippingOptionId: 'ship-1',
  });
  assert.equal(result.discountAmount, 2);
  assert.equal(result.taxAmount, 1);
  assert.equal(result.lineItems[0].extended_sale_price, 30);
});

test('rejects a missing shipping option instead of trusting browser shipping cost', () => {
  assert.throws(() => calculateCheckoutGbp({
    cart: { id: 'cart-1', cart_amount: 24.99, currency: { code: 'GBP' } },
    checkout: { consignments: [{ available_shipping_options: [{ id: 'ship-1', cost: 4.5 }] }] },
    shippingOptionId: 'forged',
  }), /shipping/i);
});

test('rejects a non-GBP cart', () => {
  assert.throws(() => calculateCheckoutGbp({
    cart: { id: 'cart-1', cart_amount: 24.99, currency: { code: 'USD' } },
    checkout: {},
  }), /GBP/);
});

test('fetches authoritative cart and checkout data', async () => {
  const requests = [];
  const fakeFetch = async (url) => {
    requests.push(url);
    return { ok: true, json: async () => ({ data: url.includes('/checkouts/')
      ? { consignments: [{ available_shipping_options: [{ id: 'ship-1', cost: 2 }] }] }
      : { id: 'cart-1', cart_amount: 10, currency: { code: 'GBP' } } }) };
  };
  const result = await fetchCheckoutGbp({ cartId: 'cart-1', shippingOptionId: 'ship-1', storeHash: 'store', apiToken: 'token', fetcher: fakeFetch });
  assert.equal(result.gbpAmount, 12);
  assert.equal(requests.length, 2);
});

test('rejects an order whose products differ from the charged cart', () => {
  const { assertOrderMatchesCart } = require('../lib/checkoutPricing');
  const cartItems = [{ product_id: 271, quantity: 1 }];
  assert.throws(() => assertOrderMatchesCart(cartItems, [{ product_id: 999, quantity: 1 }]), /products/i);
  assert.equal(assertOrderMatchesCart(cartItems, [{ product_id: 271, quantity: 1 }]), true);
});

test('rejects product options changed after the cart was priced', () => {
  const { assertOrderMatchesCart } = require('../lib/checkoutPricing');
  assert.throws(() => assertOrderMatchesCart(
    [{ product_id: 271, quantity: 1, options: [{ nameId: 7, valueId: 2 }] }],
    [{ product_id: 271, quantity: 1, product_options: [{ id: 7, value: 3 }] }]
  ), /products/i);
});
