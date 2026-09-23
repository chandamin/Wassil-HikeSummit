# GBP Display, USD Billing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep customer-facing storefront and checkout amounts in GBP while charging Airwallex in USD and maintaining GBP-equivalent recurring renewals.

**Architecture:** A backend FX service obtains an Airwallex rate and owns GBP-to-USD calculations. Checkout intent creation and order verification use durable payment pricing records. New subscriptions use USD Billing prices, refreshed before each renewal by a scheduled, idempotent worker; the GBP source price remains authoritative.

**Tech Stack:** Node.js/Express, MongoDB/Mongoose, React, BigCommerce API, Airwallex Payment Acceptance and Billing APIs.

**Spec:** `docs/superpowers/specs/2026-09-21-gbp-display-usd-billing-design.md`

## Global Constraints

- Product pages and checkout order summary stay GBP; do not add a separate USD display in application UI.
- Airwallex-hosted payment text must not be hidden or relabeled.
- The existing £24.99 renewal wording remains unchanged; each renewal is GBP-equivalent at a fresh Airwallex rate.
- Existing subscriptions are not migrated.
- Fail closed on missing/stale rates, mismatched cart or payment totals, or unverified Airwallex status.
- Feature remains disabled in production until sandbox renewal and BigCommerce currency behavior are verified.
- Preserve all pre-existing dirty-worktree changes in payment and subscription files.

## Review Focus

1. A forged browser GBP amount or currency must not affect the USD charge; test authoritative cart recalculation.
2. A shipping or discount change after intent creation must invalidate the old charge; test cart fingerprint mismatch.
3. A failed, stale, or reversed Airwallex FX response must not fall back to a guessed rate; test rejection.
4. Worker retry for the same billing period must not create a second effective subscription item; test idempotency and retrieval.
5. An already-finalized upcoming invoice or failed replacement must never silently bill the old USD amount; test alert/fail-closed path.

---

### Task 1: Verify Airwallex and BigCommerce currency capabilities

**Files:**
- Create: `backend/test/currencyCapabilities.test.js`
- Create: `backend/scripts/verifyCurrencyCapabilities.js`

**Interfaces:**
- Consumes: configured sandbox credentials only when the script is explicitly run.
- Produces: documented capability result for GBP→USD conversion quote/current rate, USD intent, USD Billing price, no-proration item replacement, and BigCommerce order currency.

- [ ] **Step 1: Write the failing test** for a read-only capability report parser: `assert.equal(parseCapabilityResult({ currency: 'USD', amount: 12.34 }).currency, 'USD')` and reject missing currency, amount, or source. Name the production change that makes it fail: adding `parseCapabilityResult`.

```js
assert.deepEqual(parseCapabilityResult({ currency: 'USD', amount: 12.34, source: 'airwallex' }), { currency: 'USD', amount: 12.34, source: 'airwallex' });
assert.throws(() => parseCapabilityResult({ currency: 'USD', amount: 12.34 }), /source/);
```
- [ ] **Step 2: Run** `node --test backend/test/currencyCapabilities.test.js`; expect failure for missing helper, not an import error.
- [ ] **Step 3: Implement** the parser and an opt-in sandbox script. The script must print endpoint response summaries, never credentials, and must not create paid charges without an explicit sandbox-only flag. Compare conversion quote with current FX `CLIENT` rate; do not assume a conversion quote can be attached to a GBP-priced/USD-charged intent. For BigCommerce, inspect order creation response currency against configured store currencies. Capture the result in the spec or this plan before choosing the production path.

```js
function parseCapabilityResult({ currency, amount, source }) {
  if (currency !== 'USD' || !Number.isFinite(amount) || amount <= 0 || !source) throw new Error('Invalid currency, amount or source');
  return { currency, amount, source };
}
```
- [ ] **Step 4: Run** the focused test and the explicit sandbox checks if credentials are available. If not, keep rollout disabled and record `NOT_VERIFIED`; do not invent success.
- [ ] **Step 5: Commit** only Task 1 files and capability notes.

### Task 2: Centralize Airwallex FX and pricing math

**Files:**
- Create: `backend/lib/airwallex/fx.js`
- Create: `backend/test/airwallexFx.test.js`

**Interfaces:**
- Produces: `getGbpToUsdRate({ gbpAmount, token, baseUrl, http }) -> { rate, source, timestamp, reference }` and `priceUsd({ gbpAmount, rate }) -> number`.

- [ ] **Step 1: Write failing tests**: `priceUsd({ gbpAmount: 24.99, rate: 1.25 }) === 31.24`; zero, NaN, reversed pair, stale timestamp, and absent `CLIENT` rate all throw. Name the production change that makes each fail: FX validation and cent rounding.

```js
assert.equal(priceUsd({ gbpAmount: 24.99, rate: 1.25 }), 31.24);
assert.throws(() => priceUsd({ gbpAmount: 24.99, rate: 0 }), /rate/);
```
- [ ] **Step 2: Run** `node --test backend/test/airwallexFx.test.js`; expect assertion failures for missing exports.
- [ ] **Step 3: Implement** the Airwallex adapter using the verified API from Task 1, validate `GBP` source/`USD` target, use amount-aware rate where supported, and round decimal money to USD cents. Never use `currency_exchange_rate` from BigCommerce or a client-provided rate.

```js
function priceUsd({ gbpAmount, rate }) {
  if (!Number.isFinite(gbpAmount) || gbpAmount <= 0 || !Number.isFinite(rate) || rate <= 0) throw new Error('Invalid GBP amount or rate');
  return Math.round((gbpAmount * rate + Number.EPSILON) * 100) / 100;
}
```
- [ ] **Step 4: Run** focused and backend suites: `node --test backend/test/airwallexFx.test.js` and `npm test --prefix backend`.
- [ ] **Step 5: Commit** Task 2 files.

### Task 3: Make checkout USD intent creation authoritative

**Files:**
- Modify: `backend/routes/airwallexLivePlan.js`
- Modify: `frontend/src/components/Checkout/PaymentStep.jsx`
- Create: `backend/models/CheckoutPayment.js`
- Create: `backend/lib/checkoutPricing.js`
- Create: `backend/test/checkoutPricing.test.js`

**Interfaces:**
- Consumes: Task 2 `getGbpToUsdRate`, `priceUsd`.
- Produces: `priceCheckout({ cartId, shippingOptionId, customerContext }) -> { gbpAmount, fingerprint }`; intent response with `id`, `client_secret`, `currency: 'USD'`, and a server-stored pricing record keyed by intent ID.

- [ ] **Step 1: Write failing tests** for authoritative BigCommerce cart totals, shipping-option verification, cart fingerprint changes, rejection of browser `amount/currency`, and USD intent payload. Name the production change that makes them fail: server-owned checkout pricing and intent creation.

```js
assert.equal(await priceCheckout({ cartId: 'cart-1', shippingOptionId: 'ship-1' }).gbpAmount, 24.99);
assert.notEqual((await priceCheckout({ cartId: 'cart-1', shippingOptionId: 'ship-1' })).fingerprint, (await priceCheckout({ cartId: 'cart-1', shippingOptionId: 'ship-2' })).fingerprint);
```
- [ ] **Step 2: Run** `node --test backend/test/checkoutPricing.test.js`; expect behavior failures.
- [ ] **Step 3: Implement** server cart and selected shipping validation using the existing BigCommerce cart/shipping APIs, persist GBP/USD amount, rate and fingerprint before returning an intent, and send only USD to Airwallex. On the frontend send `cartId` and shipping selection instead of amount/currency. Keep GBP summary components unchanged. Use a stable request ID on safe retry and invalidate stale payment elements when cart/shipping changes.

```js
const pricing = await priceCheckout({ cartId: req.body.cartId, shippingOptionId: req.body.shippingOptionId });
const fx = await getGbpToUsdRate({ gbpAmount: pricing.gbpAmount, token, baseUrl: LIVE_BASE, http: axios });
const usdAmount = priceUsd({ gbpAmount: pricing.gbpAmount, rate: fx.rate });
// Persist pricing.fingerprint and both amounts against the returned Airwallex intent ID.
```
- [ ] **Step 4: Run** focused/backend tests and `npm run build --prefix frontend`.
- [ ] **Step 5: Commit** Task 3 files.

### Task 4: Verify payment and reconcile the BigCommerce order

**Files:**
- Modify: `backend/routes/bigcommerceRoutes.js`
- Modify: `frontend/src/components/Checkout/CheckoutLayout.jsx`
- Create: `backend/test/orderPaymentVerification.test.js`

**Interfaces:**
- Consumes: Task 3 checkout payment record and Airwallex intent ID.
- Produces: verified paid order with durable GBP source/USD charge audit metadata; no paid status on an unverified intent.

- [ ] **Step 1: Write failing tests** for `SUCCEEDED` + USD + exact amount + cart association, rejection of forged success, and BigCommerce GBP order/actual USD payment reconciliation. Name the production change that makes them fail: server verification before paid status.

```js
assert.equal(verifyIntent({ status: 'SUCCEEDED', currency: 'USD', amount: 31.24, merchant_order_id: 'cart-1' }, { usdAmount: 31.24, cartId: 'cart-1' }), true);
assert.throws(() => verifyIntent({ status: 'SUCCEEDED', currency: 'GBP', amount: 31.24, merchant_order_id: 'cart-1' }, { usdAmount: 31.24, cartId: 'cart-1' }), /currency/);
```
- [ ] **Step 2: Run** `node --test backend/test/orderPaymentVerification.test.js`; expect behavior failures.
- [ ] **Step 3: Implement** Airwallex intent retrieval in the order route, match the stored checkout record and fresh cart fingerprint, preserve BigCommerce accounting currency when USD order creation is unsupported, and store both values in durable metadata. Do not accept `paymentMethod.paid` or browser status as authority. Return a recoverable mismatch state for payment-succeeded/order-failed cases.

```js
const verifiedIntent = await retrieveAirwallexIntent(paymentIntentId);
verifyIntent(verifiedIntent, checkoutPayment);
if (checkoutPayment.fingerprint !== (await priceCheckout({ cartId, shippingOptionId })).fingerprint) throw new Error('Cart changed after payment');
```
- [ ] **Step 4: Run** focused/backend tests and frontend build. Verify sandbox BigCommerce order currency before enabling USD order records.
- [ ] **Step 5: Commit** Task 4 files.

### Task 5: Create new USD-billed subscriptions from GBP plans

**Files:**
- Modify: `backend/routes/airwallexLivePlan.js`
- Modify: `backend/models/SubscriptionPlan.js`
- Modify: `backend/models/CustomerSubscription.js`
- Create: `backend/test/subscriptionSignupCurrency.test.js`

**Interfaces:**
- Consumes: Task 2 FX pricing and verified GBP plan amount.
- Produces: new USD Airwallex Billing price/subscription, with persisted GBP base amount, USD amount, FX record, item ID, and next billing time.

- [ ] **Step 1: Write failing tests** that a GBP 24.99 plan produces a USD recurring price and USD subscription, an existing GBP subscription remains untouched, and signup is idempotent. Name the production change that makes them fail: USD subscription provisioning.

```js
assert.equal(priceUsd({ gbpAmount: plan.amount, rate: 1.25 }), 31.24);
assert.equal(newSubscription.currency, 'USD');
assert.equal(existingGbpSubscription.currency, 'GBP');
```
- [ ] **Step 2: Run** `node --test backend/test/subscriptionSignupCurrency.test.js`; expect behavior failures.
- [ ] **Step 3: Implement** USD price creation at signup from server-stored GBP plan amount, preserve original plan display amount, persist the new billing fields, and avoid retroactively changing existing records. Confirm Billing uses major units for `flat_amount`.

```js
const usdAmount = priceUsd({ gbpAmount: plan.amount, rate: fx.rate });
const price = await createBillingPrice({ product_id: plan.airwallexProductId, currency: 'USD', flat_amount: usdAmount, recurring: { period: 1, period_unit: plan.interval } });
const subscription = await createBillingSubscription({ currency: 'USD', items: [{ price_id: price.id, quantity: 1 }] });
```
- [ ] **Step 4: Run** focused/backend tests and a sandbox signup. Mark trial transition `NOT_VERIFIED` if sandbox time controls or a suitable existing test subscription are unavailable; do not enable production renewal billing.
- [ ] **Step 5: Commit** Task 5 files.

### Task 6: Refresh renewal USD prices safely

**Files:**
- Create: `backend/jobs/refreshUsdRenewalPrices.js`
- Create: `backend/models/RenewalPriceRefresh.js`
- Modify: `backend/routes/webhooks.js` or the existing Airwallex billing webhook route after locating it.
- Create: `backend/test/renewalPriceRefresh.test.js`

**Interfaces:**
- Consumes: Task 2 FX service and Task 5 new-USD-subscription records.
- Produces: one refreshed USD price per subscription/billing period, updated item and next-billing state, or an alertable failed state.

- [ ] **Step 1: Write failing tests** for next-cycle replacement with `DEFER_CHARGE_AND_KEEP_CYCLE` and `NONE`, duplicate-job idempotency, a 6-to-2-hour refresh window, trial expiry, cancellation, finalized invoice, failed rate/replacement, and webhook replay. Name the production change that makes them fail: renewal state machine and worker.

```js
assert.equal(updatePayload.billing_action, 'DEFER_CHARGE_AND_KEEP_CYCLE');
assert.equal(updatePayload.default_proration_mode, 'NONE');
assert.equal(await refreshUsdRenewalPrices(subscriptionId, cycleKey), await refreshUsdRenewalPrices(subscriptionId, cycleKey));
```
- [ ] **Step 2: Run** `node --test backend/test/renewalPriceRefresh.test.js`; expect behavior failures.
- [ ] **Step 3: Implement** a scheduled worker with a unique subscription+cycle key, atomic claim, Airwallex read-before-write, new USD price creation, item replacement, post-update retrieval, and durable failure/alert state. Verify webhook signature before status updates and ignore duplicate events. Never charge immediately or leave a failed refresh marked complete.

```js
const cycleKey = `${subscription.airwallexSubscriptionId}:${subscription.nextBillingAt.toISOString()}`;
const claim = await RenewalPriceRefresh.findOneAndUpdate({ cycleKey }, { $setOnInsert: { cycleKey, status: 'claimed' } }, { upsert: true, new: true });
if (claim.status === 'complete') return claim;
// Create the USD price, replace the item, retrieve the subscription, then mark complete.
```
- [ ] **Step 4: Run** focused/backend tests and an Airwallex sandbox trial-to-paid plus second-renewal rehearsal. If the API cannot safely replace a future price, leave renewal automation disabled and report the blocker.
- [ ] **Step 5: Commit** Task 6 files.

### Task 7: Rollout and whole-flow verification

**Files:**
- Modify: `backend/index.js` to start the worker only when `ENABLE_GBP_USD_BILLING === 'true'` and `ENABLE_RENEWAL_FX_WORKER === 'true'`.
- Create: `docs/operations/gbp-usd-billing.md`

**Interfaces:**
- Consumes: Tasks 1–6.
- Produces: explicit rollout gate, alert/reconciliation runbook, and complete test evidence.

- [ ] **Step 1: Write failing configuration tests** that production defaults to old behavior until sandbox capability, renewal, and BigCommerce checks are marked verified. Name the production change that makes them fail: guarded feature switch.

```js
assert.equal(isUsdBillingEnabled({}), false);
assert.equal(isUsdBillingEnabled({ ENABLE_GBP_USD_BILLING: 'true', ENABLE_RENEWAL_FX_WORKER: 'true' }), true);
```
- [ ] **Step 2: Run** the focused configuration test; expect failure.
- [ ] **Step 3: Implement** the guarded switch, worker startup and operational documentation for failed FX, payment succeeded/order failed, overdue refresh, webhook failure, and rollback. Do not enable the new charge path merely because tests pass.

```js
function isUsdBillingEnabled(env) {
  return env.ENABLE_GBP_USD_BILLING === 'true' && env.ENABLE_RENEWAL_FX_WORKER === 'true';
}
```
- [ ] **Step 4: Run** all backend tests, frontend tests/build, static syntax checks, and sandbox rehearsals. Compare exact GBP/USD values in intent, order metadata, invoice preview, and renewal invoice. Record any unavailable external checks as unverified.
- [ ] **Step 5: Commit** Task 7 files and request a final code review; do not claim production readiness without sandbox evidence.
