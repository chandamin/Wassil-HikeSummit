# USD BigCommerce Orders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The user asked to handle Git, so do not commit or push.

**Goal:** Create new BigCommerce orders in USD at exactly the USD amount already paid through Airwallex, while keeping the storefront, checkout summary, and custom thank-you page in GBP.

**Architecture:** Preserve the authoritative GBP BigCommerce cart and the saved `CheckoutPayment` FX/charge snapshot. A focused order-pricing builder creates a USD V2 order payload from that snapshot; the existing order route verifies the payment and cart, creates the order, and reconciles its returned transactional currency and total before claiming success. The frontend thank-you view only uses GBP cart values for GBP labels.

**Tech Stack:** Node.js/CommonJS, Express, Mongoose, BigCommerce V2/V3 REST APIs, Airwallex Payment Intents, React, Node `node:test`.

**Spec:** `docs/superpowers/specs/2026-09-21-usd-bigcommerce-orders-design.md`

## Global Constraints

- Keep product pages, cart, checkout summary, and custom thank-you page in GBP; BigCommerce order history/invoices/native emails may show USD.
- Do not change store default currency, catalog prices, existing orders, or existing subscriptions.
- Never use browser-supplied amount, rate, currency, or payment status as the source of truth.
- BigCommerce order `default_currency_code` and returned `total_inc_tax` must be USD and equal saved `CheckoutPayment.usdAmount` to the cent.
- A paid-but-unreconciled order must retain its BigCommerce ID and require manual reconciliation; never charge again automatically.
- Do not create a real BigCommerce order in automated tests; the controlled live-store test uses the user's existing test identity and explicit test workflow.
- Preserve current dirty worktree changes and do not commit/push.

## Review Focus

- Coupon/discount cart: converted product and shipping components minus discount must equal the paid USD total; Task 1 pins this.
- Quantity greater than one: rounding must not produce a one-cent mismatch or negative discount; Task 1 pins this.
- Tax-inclusive checkout: the order's tax-inclusive total must equal the charge; Task 1 and Task 2 pin this.
- BigCommerce accepts an order but returns GBP or a wrong total: retain order ID, mark reconciliation-required, and do not report success; Task 2 pins this.
- Lost GBP cart after payment: thank-you must never render a USD order total with a GBP symbol; Task 3 pins this.

---

### Task 1: Build a deterministic USD order-pricing snapshot

**Files:**
- Modify: `backend/lib/checkoutPricing.js`
- Create: `backend/lib/usdOrderPricing.js`
- Modify: `backend/test/checkoutPricing.test.js`
- Create: `backend/test/usdOrderPricing.test.js`

**Interfaces:**
- Consumes: `calculateCheckoutGbp({ cart, checkout, shippingOptionId })` and `CheckoutPayment` fields `{ gbpAmount, usdAmount, fxRate }`.
- Produces: `buildUsdOrderPricing({ checkoutPricing, payment })` returning `{ products, shippingCost, discountAmount, totalIncTax }` in USD. Product entries retain cart product/variant/options and include USD `price_inc_tax` and `price_ex_tax`.

- [ ] **Step 1: Write failing tests** for a £54.90 single item charged $73.04, a quantity-three cart with a £2 discount and £4 shipping, a zero-price VIP line, and tax-inclusive totals. Use literal expected USD cents. Also test rejection of non-finite amounts, negative residual discount, and a component sum that cannot represent the saved GBP total. The test imports `buildUsdOrderPricing` from `../lib/usdOrderPricing`.

```js
test('uses the saved USD payment for a GBP item', () => {
  const result = buildUsdOrderPricing({
    checkoutPricing: {
      gbpAmount: 54.90, shippingCost: 0, discountAmount: 0, taxAmount: 0,
      lineItems: [{ product_id: 265, quantity: 1, extended_sale_price: 54.90 }],
    },
    payment: { gbpAmount: 54.90, usdAmount: 73.04, fxRate: 73.04 / 54.90 },
  });
  assert.equal(result.totalIncTax, 73.04);
  assert.equal(result.products[0].price_inc_tax, 73.04);
  assert.equal(result.shippingCost, 0);
});
```

- [ ] **Step 2: Run** `node --test backend/test/usdOrderPricing.test.js backend/test/checkoutPricing.test.js`. Confirm RED because the export or required pricing fields do not exist.
- [ ] **Step 3: Extend** `calculateCheckoutGbp` to return the cart's `discount_amount`, `tax_amount`, and per-item authoritative `extended_sale_price`/quantity information without changing its fingerprint or GBP total. In `usdOrderPricing.js`, validate that the component GBP sum (item gross plus shipping minus discount) matches `gbpAmount` to a penny; use integer cents for component allocation, distribute residual cents deterministically over nonzero lines, keep zero lines zero, and derive the final USD discount from the saved `usdAmount`. Do not fetch a new rate. Preserve product options/variant IDs for the V2 payload. If item-specific tax data is unavailable, derive tax-exclusive unit prices from the cart's total tax proportion, never exceeding inclusive prices; reject inconsistent tax input.

```js
function toCents(value) {
  if (!Number.isFinite(value) || value < 0) throw new Error('Invalid order amount');
  return Math.round((value + Number.EPSILON) * 100);
}
function cents(value) { return Math.round(value) / 100; }
// Export buildUsdOrderPricing({ checkoutPricing, payment }).
// Return values in USD; assert toCents(totalIncTax) === toCents(payment.usdAmount).
```

- [ ] **Step 4: Re-run** the two focused files, then `node --test backend/test/*.test.js`. Confirm GREEN with zero failures. Do not alter production order creation yet.

### Task 2: Create and reconcile the BigCommerce USD order

**Files:**
- Modify: `backend/routes/bigcommerceRoutes.js` (the `/orders/create` handler)
- Modify: `backend/models/CheckoutPayment.js`
- Create: `backend/lib/usdOrderReconciliation.js`
- Create: `backend/test/usdOrderReconciliation.test.js`

**Interfaces:**
- Consumes: `buildUsdOrderPricing({ checkoutPricing, payment })` from Task 1 and existing `verifyPaidIntent`/`assertOrderMatchesCart`.
- Produces: `assertUsdOrderMatchesPayment(order, payment)` throwing a reconciliation error unless `order.default_currency_code === 'USD'` and `total_inc_tax` equals `payment.usdAmount` to the cent.

- [ ] **Step 1: Write failing tests** for an accepted USD order, wrong transactional currency, wrong USD total, missing order ID, and a valid USD total whose `currency_code` is unexpected (only `default_currency_code` is the transactional field). Use a literal $73.04 fixture.

```js
test('rejects an order returned in GBP even when the numeric total matches', () => {
  assert.throws(() => assertUsdOrderMatchesPayment(
    { id: 4139, default_currency_code: 'GBP', total_inc_tax: '73.04' },
    { usdAmount: 73.04 }
  ), /transactional currency/i);
});
```

- [ ] **Step 2: Run** `node --test backend/test/usdOrderReconciliation.test.js` and confirm RED because the function does not exist.
- [ ] **Step 3: Implement** `assertUsdOrderMatchesPayment` with strict integer-cent comparison. Add a `reconciliationStatus` enum (`matched`, `required`) and `reconciliationReason` to `CheckoutPayment`. In `/orders/create`, retain the existing cart and Airwallex verification, then call `buildUsdOrderPricing`. For verified USD payments, fill V2 `products`, `shipping_cost_inc_tax`, `shipping_cost_ex_tax`, `discount_amount`, `default_currency_code: 'USD'`, and `store_default_currency_code: 'GBP'` from the builder; send no read-only `currency_code`. The legacy non-USD path remains unchanged. After V2 creation, persist the order ID first, assert USD currency/total, set `reconciliationStatus`, and only then update status/inventory/return success. Replace the old GBP-total comparison. A mismatch returns HTTP 409 with order ID and a non-sensitive reconciliation message. Never retry the Airwallex charge.

```js
function assertUsdOrderMatchesPayment(order, payment) {
  if (!Number.isInteger(Number(order?.id))) throw new Error('BigCommerce order ID missing');
  if (order.default_currency_code !== 'USD') throw new Error('BigCommerce transactional currency is not USD');
  if (Math.round(Number(order.total_inc_tax) * 100) !== Math.round(Number(payment.usdAmount) * 100)) {
    throw new Error('BigCommerce USD total differs from paid amount');
  }
  return true;
}
```

- [ ] **Step 4: Run** `node --test backend/test/*.test.js`, `node --check backend/routes/bigcommerceRoutes.js`, and `git diff --check -- backend/routes/bigcommerceRoutes.js`. Review the route manually for the paid-order failure path and no repeated charge. Confirm GREEN.

### Task 3: Keep GBP-only values on the custom thank-you page

**Files:**
- Modify: `frontend/src/components/Checkout/ThankYouStep.jsx`
- Modify: `frontend/src/components/Checkout/CheckoutLayout.jsx` only if the navigation state fails to carry the GBP cart snapshot.
- Create: `frontend/src/components/Checkout/ThankYouStep.test.jsx` using the installed `react-scripts` Jest runner and `@testing-library/react`.

**Interfaces:**
- Consumes: `cart` GBP snapshot already passed through `navigate('/thank-you', { state: { cart: latestCart } })`.
- Produces: GBP summary from cart values, or order reference without an amount when the GBP snapshot is missing.

- [ ] **Step 1: Write a failing render test** passing `{ order: { id: 4139, default_currency_code: 'USD', total_inc_tax: '73.04' }, cart: null }`; assert that neither `£73.04` nor `$73.04` is rendered as a GBP total. Add a second fixture with a £54.90 cart and USD order, asserting `£54.90` appears in the summary.

```jsx
import { render, screen } from '@testing-library/react';
import ThankYouStep from './ThankYouStep';

test('does not label a USD order total as GBP when the cart snapshot is missing', () => {
  render(<ThankYouStep order={{ id: 4139, default_currency_code: 'USD', total_inc_tax: '73.04' }} cart={null} />);
  expect(screen.queryByText('£73.04')).not.toBeInTheDocument();
  expect(screen.getByText(/GBP summary unavailable/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run** `cd frontend && CI=true ./node_modules/.bin/react-scripts test --watch=false --runTestsByPath src/components/Checkout/ThankYouStep.test.jsx`; confirm RED on the missing-cart fixture. Existing `App.test.js` is unrelated and need not run for this red check.
- [ ] **Step 3: Remove the order-total, order-subtotal, order-shipping, order-discount, and order-currency fallbacks used for GBP labels.** Use only the saved GBP cart for those fields. When `cart` is missing, show the order number and a short message that the GBP summary is unavailable, without any currency amount. Preserve the existing renewal wording and checkout UI.

```jsx
const hasGbpCart = cart?.currency?.code === 'GBP';
const currency = 'GBP';
// Render GBP summary only when hasGbpCart; never format order.total_inc_tax as GBP.
```

- [ ] **Step 4: Run** the focused Jest command above and `npm run build --prefix frontend`; confirm GREEN. Restore only generated build artifacts that were clean before this task, not user edits.

### Task 4: Controlled BigCommerce/API validation and rollout gate

**Files:**
- Modify: `docs/operations/gbp-usd-billing.md`
- Test: `backend/test/*.test.js`

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces: a documented, explicit go/no-go check for the V2 transactional-currency behavior on the target store.

- [ ] **Step 1: Add the controlled test procedure** to the operations document: confirm USD enabled; place one sandbox-Airwallex/test-identity order; inspect BigCommerce V2 response (`default_currency_code`, `currency_code`, `total_inc_tax`, item prices, shipping, tax); compare with `CheckoutPayment.usdAmount`; verify GBP checkout/thank-you; check order history/email; record the order ID for cleanup/reconciliation. Do not create or delete a real order automatically.
- [ ] **Step 2: If the V2 API rejects `default_currency_code: 'USD'`, silently ignores it, or recalculates a different USD amount, stop rollout and report the evidence.** Do not remove the currency/total verification or fall back to a GBP order. Revisit the spec before choosing a USD-cart alternative.
- [ ] **Step 3: Run** `node --test backend/test/*.test.js`, `node --check backend/routes/bigcommerceRoutes.js`, `npm run build --prefix frontend`, and scoped `git diff --check`. Record exact results and any external validation not performed. Leave the feature disabled in production until the controlled check passes.
