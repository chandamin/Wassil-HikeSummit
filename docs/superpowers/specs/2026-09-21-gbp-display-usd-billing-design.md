# GBP display, USD billing design

## Purpose and constraints

UK visitors continue to see GBP prices on product pages and in the checkout order summary. The application does not add a separate USD amount before payment; an Airwallex-hosted payment element may disclose USD and must not be obscured. Airwallex payment intents and new recurring billing are in USD. The GBP monthly renewal promise, including the existing £24.99 wording, remains unchanged. Each renewal's USD charge must be recalculated from the GBP price using an Airwallex rate; it is not fixed at signup. Existing subscriptions are not migrated in this change.

## Source of truth and currency boundary

The server determines the GBP payable amount from authoritative BigCommerce cart, product, discount, tax, and shipping data. It must not trust an amount, rate, or currency supplied by the browser. A focused FX service obtains the Airwallex GBP-to-USD client rate, validates currency pair, amount, freshness, and positivity, and rounds only the resulting USD charge to cents. Do not substitute a guessed or static rate if Airwallex is unavailable. Airwallex's Payment Acceptance conversion quote is a short-lived quote intended for merchant-to-shopper pricing; confirm its suitability for this merchant-priced-GBP/shopper-charged-USD case in sandbox before attaching its ID to an intent. If unsuitable, use Airwallex's current transactional FX client rate as a pricing input, without representing it as a guaranteed executed conversion. Record source, timestamp, rate, original GBP amount, and charged USD amount.

Payment intent creation accepts a cart identifier and checkout shipping selection, computes the GBP total server-side, derives the USD amount, and sends only USD to Airwallex. It returns the payment intent plus pricing metadata needed for later verification, but no separate USD display is added to the checkout UI. The existing GBP cart and summary remain GBP. A changed cart or shipping selection invalidates a previous intent; a retry creates a fresh quote/intent with a stable idempotency strategy.

## Order integrity

Before an order is marked paid, retrieve the Airwallex payment intent server-side and verify success, currency USD, amount, and cart/order association. Persist the GBP source total and USD charged total with the FX details and Airwallex reference in durable order/payment metadata. Do not mark an order paid from a browser-provided status alone. Determine, in sandbox, whether BigCommerce v2 order creation can express USD while the storefront/catalog remain GBP. If it cannot, retain the BigCommerce order's GBP accounting currency and record the actual USD Airwallex charge separately; do not mislabel GBP totals as USD. Reconcile discrepancies and fail closed rather than silently creating a mismatched paid order.

## Subscription signup and renewals

The GBP recurring price is authoritative in the local plan; the Airwallex Billing subscription currency is USD. At signup, create a USD recurring price from the current Airwallex rate and attach it to the new subscription. Persist the GBP renewal amount, current USD price ID and amount, rate details, subscription/item IDs, billing anchor, and next billing time. A durable renewal worker runs sufficiently ahead of each billing boundary, obtains a fresh Airwallex rate, creates a new USD recurring price, and replaces the subscription item with the new price using `DEFER_CHARGE_AND_KEEP_CYCLE` and `NONE` proration. Its requests are idempotent per subscription and billing period. It confirms the resulting subscription and upcoming invoice in sandbox before enabling automatic renewal updates. Billing webhooks reconcile payment status and next billing time; signature verification and duplicate-event handling are required.

Airwallex documents that an existing subscription item's `price_id` cannot be edited directly, so the worker must replace the item. The worker must account for trial expiry, missed runs, retries, disabled/cancelled subscriptions, and any invoice already finalized. If rate lookup, replacement, or confirmation fails, alert operations and prevent an unchecked old-USD renewal where the API permits; do not silently treat the previous price as equivalent to the GBP promise. If sandbox proves Airwallex cannot reliably defer the replacement to the next cycle, stop before production rollout and present the limitation; do not deploy a recurring flow that can charge an unintended amount.

## Validation and rollout

Use test-first coverage for FX direction/rounding, stale or invalid rates, cart tampering, USD intent creation, payment verification, order reconciliation, subscription signup, renewal item replacement, idempotent retries, and failure paths. Run backend and frontend test/build commands, plus an Airwallex sandbox end-to-end rehearsal that includes a trial-to-paid transition and a second renewal. Roll out behind a configuration switch so current billing remains unchanged until sandbox checks and operational monitoring pass. No credentials or real charges are needed in automated tests.

## References

- [Airwallex Payment Acceptance conversion quotes](https://www.airwallex.com/docs/api/payments/conversion_quotes)
- [Airwallex current FX rates](https://www.airwallex.com/docs/api/transactional_fx/rates/api)
- [Airwallex Billing subscriptions](https://www.airwallex.com/docs/api/billing/subscriptions)
- [Airwallex subscription update guidance](https://www.airwallex.com/docs/billing/subscriptions/subscriptions-via-api)
