# GBP storefront / USD Airwallex billing

The storefront and checkout summary remain in GBP. The backend reads BigCommerce's configured GBP and USD exchange rates from `GET /v2/currencies`, calculates the GBP-to-USD ratio, and creates the Airwallex payment intent in USD. The same saved rate and exact USD amount are used for the BigCommerce order. The application does not add a USD amount to the summary; Airwallex's payment element may show USD. The GBP cart amount, USD charge, rate, timestamp, and payment intent are saved in `CheckoutPayment`. USD checkout and BigCommerce order creation are enabled automatically only for the exact HTTPS Airwallex demo, sandbox, and production API hosts; they do not require separate feature flags.

## Before enabling

1. Confirm the BigCommerce cart and checkout APIs return GBP totals and the selected shipping option for the store. The server rejects a non-GBP cart or unverifiable shipping option.
2. Confirm the BigCommerce API token can call `GET /v2/currencies`, that GBP and USD are transactional currencies, and that both have positive `currency_exchange_rate` values. Checkout fails closed when this configuration is missing or invalid.
3. In Airwallex sandbox, test a USD payment intent, a USD Billing recurring price, and a trial-to-paid renewal. Then test replacing an existing subscription item with a new USD price using `DEFER_CHARGE_AND_KEEP_CYCLE` and `NONE` proration, including a second renewal. Confirm no immediate adjustment invoice or unintended charge.
4. Configure an Airwallex Billing webhook at `/api/webhooks/airwallex-billing` for subscription status events and set `AIRWALLEX_BILLING_WEBHOOK_SECRET`. Confirm a signed event updates `nextBillingAt` and duplicate delivery is harmless.
5. Confirm USD is enabled in the BigCommerce store. In a controlled sandbox-Airwallex checkout using the designated test identity, create one test order. This creates a real BigCommerce order; record its ID. Verify the V2 order response and a subsequent GET both report `default_currency_code=USD` and `total_inc_tax` exactly equal to `CheckoutPayment.usdAmount`. Inspect `currency_code`, product unit prices, shipping, discounts, and tax; confirm that the GBP checkout and custom thank-you page still show their original GBP values. Check order history, native invoice/email, and inventory behavior. Do not delete or refund the test order automatically.
6. If BigCommerce rejects `default_currency_code=USD`, returns a GBP transactional currency, or changes the USD total, stop rollout. The application records a reconciliation-required state and does not claim order success. Resolve the paid order manually; do not retry charging the customer or silently create a GBP replacement order.
7. Production USD checkout is enabled by the exact `https://api.airwallex.com` base URL. Separately set `ENABLE_RENEWAL_FX_WORKER=true` and `AIRWALLEX_RENEWAL_SANDBOX_VERIFIED=true`, and configure `AIRWALLEX_BILLING_WEBHOOK_SECRET`, only after the subscription renewal checks. These values control the renewal worker, not checkout or BigCommerce order currency. Do not use the verification flag to bypass testing.

On 2026-09-21, read-only checks confirmed that this Airwallex account returned a current GBP→USD `CLIENT` rate and that the BigCommerce store has GBP as default currency with USD enabled. A sandbox one-time checkout charged USD while order #4139 was created in GBP; it predates the USD BigCommerce order change. A USD BigCommerce order and the renewal replacement flow have not yet been verified end-to-end.

## Monitoring and recovery

- Watch logs for `PAID ORDER RECONCILIATION REQUIRED` and `[renewal-fx] ACTION REQUIRED`. A successful payment with a failed order requires manual reconciliation; do not retry charging the customer.
- Watch `CheckoutPayment.orderCreationStatus` for `creating` without an order ID and `reconciliationStatus=required`. These are not auto-retried because the external order may already exist or have a mismatched total/currency.
- Watch `RenewalPriceRefresh` for `failed` or expired `claimed` records and `CustomerSubscription.renewalFxStatus=failed` or `held`. On failure the worker attempts to switch collection to `OUT_OF_BAND`; confirm it actually succeeded in Airwallex and resolve the invoice manually. An old USD price is not GBP-equivalent after rates move.
- The worker runs hourly and attempts each renewal between 6 and 2 hours before billing. It uses subscription ID plus billing date as its idempotency key. The GBP equivalent is based on the rate at that refresh time, not the exact later invoice time.
- To stop new production USD payments and orders, deploy a non-production Airwallex base URL only in the corresponding non-production environment; the production hostname intentionally activates USD checkout. Already-created USD intents remain eligible for verified order reconciliation. To stop only renewal refreshes, unset `ENABLE_RENEWAL_FX_WORKER`. This does not cancel or change already-created USD subscriptions; monitor and handle them separately.

## Known constraints

- There is no guarantee that Airwallex's current transactional FX rate will equal an executed wallet conversion rate; the API rate is used to set a USD charge amount.
- This code cannot prevent an automatic renewal if Airwallex is unavailable at the deadline and still holds an older USD price. Do not enable production renewal billing until the sandbox test establishes a safe operational stop/failover procedure.
- Existing GBP subscriptions are unchanged and are not automatically migrated.
- BigCommerce V2 USD order creation has not yet been confirmed against this store. Do not enable this change for live customers until the controlled test demonstrates the exact USD currency and total.
