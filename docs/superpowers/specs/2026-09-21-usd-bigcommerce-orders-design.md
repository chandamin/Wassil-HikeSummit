# USD BigCommerce orders with GBP storefront display

## Purpose and scope

For new checkouts using the existing USD Airwallex payment path, product pages, cart, checkout order summary, and the custom thank-you page continue to show GBP. The BigCommerce order must instead have USD as its transactional currency and a USD total equal to the amount successfully charged by Airwallex. The user accepts that BigCommerce order history, native invoices, exports, and any native order emails can show USD. Do not change the store's default currency, catalog prices, existing orders, or existing subscriptions.

This design supersedes the GBP-order fallback in the earlier GBP-display/USD-billing design. If BigCommerce cannot create and return a valid USD order for the current store and API path, stop this rollout; do not silently create a GBP order or label GBP figures as USD.

## Currency ownership and order creation

The authoritative BigCommerce cart/checkout remains GBP. The backend obtains the GBP amount, selected shipping, discounts, tax, items, and options from BigCommerce before creating an Airwallex payment intent. It reads the configured GBP and USD exchange rates from BigCommerce's Management Currencies API, derives the GBP-to-USD ratio, and saves the GBP amount, exact USD intent amount, rate, timestamp, cart fingerprint, and intent ID in `CheckoutPayment`. Browser-submitted prices, currency, and payment status are not trusted.

After payment, `/api/orders/create` re-fetches the cart and shipping, verifies the unchanged fingerprint and products/options, then retrieves the Airwallex intent and confirms `SUCCEEDED`, `USD`, and the exact saved USD amount. It builds the BigCommerce V2 order using `default_currency_code: "USD"`; it never sends the read-only `currency_code` field. `store_default_currency_code` and `store_default_to_transactional_exchange_rate` are supplied only if supported by a controlled order test and consistent with BigCommerce's field semantics.

The order builder derives USD line, shipping, discount, and tax amounts from the *saved* checkout FX rate, using integer cents and a deterministic residual allocation so the intended USD total is exactly the Airwallex charge. It uses authoritative cart prices after relevant discounts rather than re-reading catalog base prices as the amount owed. Free subscription/zero-price lines remain zero. It does not re-quote FX during order creation. If the GBP cart cannot be decomposed into coherent order components, it fails with a reconciliation-required outcome rather than inventing prices.

After the V2 create response, the backend verifies `default_currency_code === "USD"` and `total_inc_tax` equals the saved USD payment to the cent. It records the BigCommerce order ID on `CheckoutPayment` even if the returned currency/total is wrong, emits a reconciliation alert, and does not claim checkout success or charge again. Inventory and order status updates occur only after successful reconciliation. The existing duplicate-order claim remains in place.

## GBP customer-facing experience

The storefront cart, checkout summary, and custom thank-you page continue to use the original GBP cart snapshot. The thank-you page must not fall back to USD order totals while labeling them GBP. If the GBP snapshot is unavailable, show an order reference without a misleading amount. Any order data consumed by analytics or custom emails must carry an explicit currency. BigCommerce's own order history and native invoices/emails may show USD as approved.

## Alternatives considered

- Change the store default currency to USD: rejected because it affects unrelated traffic and catalog/checkout behavior.
- Change only the V2 order currency field: rejected because GBP line and shipping figures would be mislabeled or could be recalculated to an unmatched total.
- Rebuild a USD cart and convert it through BigCommerce checkout: not selected because it replaces the authoritative GBP cart and introduces a second cart/pricing path. Reconsider only if a controlled V2 order test proves the selected path cannot create a USD transactional order.

## Validation and rollout

First, use read-only checks to confirm USD is enabled for the store. Then test V2 USD order creation with a controlled test identity/cart, inspect the returned currency fields and each product/shipping/tax amount, and confirm no unintended customer email. This creates a real BigCommerce order, so it requires the user's existing authorization for a controlled test order. Do not run it automatically as part of unit tests.

Add test-first cases for multi-line rounding, discounts, tax, shipping, zero-price subscription lines, cart changes, an Airwallex/BigCommerce USD mismatch, and duplicate order requests. Run the backend suite and frontend build. Perform a sandbox end-to-end checkout: GBP storefront and confirmation, USD Airwallex intent, USD BigCommerce order with an identical total, and correct order history. Keep this change behind a configuration switch until those checks pass. The separate subscription-renewal and production-go-live gates remain in force.

## References

- [BigCommerce Create Order V2](https://docs.bigcommerce.com/developer/api-reference/rest/admin/management/orders/create-order)
- [BigCommerce order currency fields](https://docs.bigcommerce.com/developer/api-reference/rest/admin/management/orders)
- [BigCommerce currency behavior](https://docs.bigcommerce.com/developer/docs/admin/store-configuration/currencies/how-currencies-work)
