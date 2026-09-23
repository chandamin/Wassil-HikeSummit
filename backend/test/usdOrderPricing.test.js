const test = require('node:test');
const assert = require('node:assert/strict');
const { buildUsdOrderPricing, quoteUsdOrderAmount } = require('../lib/usdOrderPricing');

test('checks that a USD order can be priced before creating a payment intent', () => {
  assert.equal(quoteUsdOrderAmount({
    checkoutPricing: { gbpAmount: 54.90, shippingCost: 0, taxAmount: 0,
      lineItems: [{ product_id: 265, quantity: 1, extended_sale_price: 54.90 }] },
    rate: 73.04 / 54.90,
  }), 73.04);
  assert.throws(() => quoteUsdOrderAmount({
    checkoutPricing: { gbpAmount: 54.90, shippingCost: 0, taxAmount: 0,
      lineItems: [{ product_id: 265, quantity: 1 }] },
    rate: 73.04 / 54.90,
  }), /amount/i);
});

test('uses the saved USD payment for a GBP item', () => {
  const result = buildUsdOrderPricing({
    checkoutPricing: { gbpAmount: 54.90, shippingCost: 0, discountAmount: 0, taxAmount: 0,
      lineItems: [{ product_id: 265, quantity: 1, extended_sale_price: 54.90 }] },
    payment: { gbpAmount: 54.90, usdAmount: 73.04, fxRate: 73.04 / 54.90 },
  });
  assert.equal(result.totalIncTax, 73.04);
  assert.equal(result.products[0].price_inc_tax, 73.04);
  assert.equal(result.shippingCost, 0);
});

test('converts quantity, shipping, and order discount without changing paid total', () => {
  const result = buildUsdOrderPricing({
    checkoutPricing: { gbpAmount: 32, shippingCost: 4, discountAmount: 2, taxAmount: 0,
      lineItems: [{ product_id: 101, variant_id: 6, quantity: 3, extended_sale_price: 30,
        options: [{ nameId: 7, valueId: 2 }] }] },
    payment: { gbpAmount: 32, usdAmount: 40, fxRate: 1.25 },
  });
  assert.deepEqual(result.products[0], {
    product_id: 101, variant_id: 6, quantity: 3,
    price_inc_tax: 12.5, price_ex_tax: 12.5,
    product_options: [{ id: 7, value: 2 }],
  });
  assert.equal(result.shippingCost, 5);
  assert.equal(result.discountAmount, 2.5);
  assert.equal(result.totalIncTax, 40);
});

test('keeps zero-price subscription lines at zero and allocates rounding cents', () => {
  const result = buildUsdOrderPricing({
    checkoutPricing: { gbpAmount: 0.02, shippingCost: 0, discountAmount: 0, taxAmount: 0,
      lineItems: [
        { product_id: 1, quantity: 1, extended_sale_price: 0.01 },
        { product_id: 2, quantity: 1, extended_sale_price: 0.01 },
        { product_id: 271, quantity: 1, extended_sale_price: 0 },
      ] },
    payment: { gbpAmount: 0.02, usdAmount: 0.03, fxRate: 1.25 },
  });
  assert.equal(result.products[2].price_inc_tax, 0);
  assert.equal(result.products[0].price_inc_tax + result.products[1].price_inc_tax, 0.03);
  assert.equal(result.totalIncTax, 0.03);
});

test('keeps tax-inclusive and tax-exclusive totals coherent', () => {
  const result = buildUsdOrderPricing({
    checkoutPricing: { gbpAmount: 20, shippingCost: 0, discountAmount: 0, taxAmount: 5,
      lineItems: [{ product_id: 1, quantity: 1, extended_sale_price: 20 }] },
    payment: { gbpAmount: 20, usdAmount: 30, fxRate: 1.5 },
  });
  assert.equal(result.totalIncTax, 30);
  assert.equal(result.totalExTax, 22.5);
  assert.equal(result.products[0].price_inc_tax, 30);
  assert.equal(result.products[0].price_ex_tax, 22.5);
});

test('allocates tax rounding to priced items rather than free shipping', () => {
  const result = buildUsdOrderPricing({
    checkoutPricing: { gbpAmount: 0.02, shippingCost: 0, discountAmount: 0, taxAmount: 0.01,
      lineItems: [
        { product_id: 1, quantity: 1, extended_sale_price: 0.01 },
        { product_id: 2, quantity: 1, extended_sale_price: 0.01 },
      ] },
    payment: { gbpAmount: 0.02, usdAmount: 0.03, fxRate: 1.33711 },
  });
  assert.equal(result.shippingCostExTax, 0);
  assert.equal(result.products.reduce((sum, item) => sum + item.price_inc_tax - item.price_ex_tax, 0), 0.01);
  assert.ok(result.products.every(item => item.price_ex_tax <= item.price_inc_tax));
});

test('rejects invalid FX, impossible discounts, and inconsistent GBP components', () => {
  const base = { gbpAmount: 10, shippingCost: 0, discountAmount: 0, taxAmount: 0,
    lineItems: [{ product_id: 1, quantity: 1, extended_sale_price: 10 }] };
  assert.throws(() => buildUsdOrderPricing({ checkoutPricing: base,
    payment: { gbpAmount: 10, usdAmount: NaN, fxRate: 1 } }), /amount/i);
  assert.throws(() => buildUsdOrderPricing({ checkoutPricing: base,
    payment: { gbpAmount: 10, usdAmount: 11, fxRate: 1 } }), /rate|amount/i);
  assert.throws(() => buildUsdOrderPricing({ checkoutPricing: { ...base, gbpAmount: 12 },
    payment: { gbpAmount: 12, usdAmount: 12, fxRate: 1 } }), /components|discount/i);
  assert.throws(() => buildUsdOrderPricing({ checkoutPricing: { ...base, taxAmount: 11 },
    payment: { gbpAmount: 10, usdAmount: 10, fxRate: 1 } }), /tax/i);
});
