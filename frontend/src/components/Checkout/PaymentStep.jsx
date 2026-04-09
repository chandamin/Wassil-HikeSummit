import { useEffect, useRef, useState } from "react";
import { init, createElement } from "@airwallex/components-sdk";

export default function PaymentStep({
  active,
  data,
  onContinue,
  isDisabled,
  cart,
  clientData,
  deliveryData,
  onPlaceOrder,
  airwallexCustomerId,
}) {
  const containerRef = useRef(null);
  const elementRef = useRef(null);
  const initializedRef = useRef(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [intent, setIntent] = useState(null);
  

  const successHandledRef = useRef(false);
  
  const lastAmountKeyRef = useRef(null);

  // Reset initialization when payment step becomes inactive
  useEffect(() => {
    if (!active) {
      console.log("🔄 Payment step became inactive, resetting initialization...");
      initializedRef.current = false;
      successHandledRef.current = false;

      // Unmount the element if it exists
      if (elementRef.current?.unmount) {
        elementRef.current.unmount();
      }
      elementRef.current = null;
    }
  }, [active]);

  useEffect(() => {
    if (!active || isDisabled) return;
    if (!cart?.id || !cart?.cartAmount) return;
    // if (initializedRef.current) return;

    // initializedRef.current = true;

    //  Calculate the unique key for this payment session
    const expectedAmount = Number(cart.cartAmount) + Number(deliveryData?.price || 0);
    const currency = cart?.currency?.code || 'EUR';
    const amountKey = `${expectedAmount}-${currency}`;

    // Skip only if we already have an element for THIS exact amount+currency
    if (lastAmountKeyRef.current === amountKey && elementRef.current) {
      return;
    }
    lastAmountKeyRef.current = amountKey;
    let isMounted = true;

    const setupPayment = async () => {
      try {
        setLoading(true);
        setError("");

        const currency = cart?.currency?.code || "EUR";

        // 1. Create a payment customer (cus_) required for payment consent
        let paymentCustomerId = null;
        if (airwallexCustomerId && clientData?.email) {
          try {
            const cusRes = await fetch(
              `${import.meta.env.VITE_BACKEND_URL}/api/subscription-plans/payment-customers`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "true" },
                body: JSON.stringify({ email: clientData.email }),
              }
            );
            if (cusRes.ok) {
              const cusData = await cusRes.json();
              paymentCustomerId = cusData.id;
              console.log("💳 Payment customer (cus_):", paymentCustomerId);
            } else {
              console.warn("⚠️ Failed to create payment customer:", await cusRes.text());
            }
          } catch (cusErr) {
            console.warn("⚠️ Payment customer creation error:", cusErr.message);
          }
        }

        console.log("💳 [PAYMENT_INTENT_CREATE] Request payload:", {
          amount: Number(cart.cartAmount) + Number(deliveryData?.price || 0),
          currency,
          merchant_order_id: cart.id,
          payment_customer_id: paymentCustomerId,
        });

        const response = await fetch(
          `${import.meta.env.VITE_BACKEND_URL}/api/subscription-plans/payment-intents`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
              "ngrok-skip-browser-warning": "true",
            },
            body: JSON.stringify({
              amount: Number(cart.cartAmount) + Number(deliveryData?.price || 0),
              currency,
              merchant_order_id: cart.id,
              ...(paymentCustomerId && { payment_customer_id: paymentCustomerId }),
            }),
          }
        );

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result?.error || "Failed to create payment intent");
        }

        if (!isMounted) return;
        setIntent(result);

        await init({
          env: "prod",
          enabledElements: ["payments"],
          locale: "fr",
        });

        const element = await createElement("dropIn", {
          intent_id: result.id,
          client_secret: result.client_secret,
          currency: result.currency,
          methods: ["card"],
          autoCapture: false,
          // showConfirmButton: false,
          // Plain container ID (not CSS selector) — renders 3DS auth challenge inline
          authFormContainer: "airwallex-auth-container",
          // Tell the dropIn to create and verify a merchant-triggered consent automatically
          ...(paymentCustomerId && {
            payment_consent: {
              next_triggered_by: "merchant",
              merchant_trigger_reason: "unscheduled",
            },
          }),
          // appearance intentionally omitted — Airwallex only allows its own
          // component tokens here; arbitrary selectors are silently ignored.
        });

        if (!element) {
          throw new Error("Failed to create Airwallex payment element");
        }

        elementRef.current = element;
        element.mount(containerRef.current);

        element.on("ready", () => {
          if (!isMounted) return;
          setLoading(false);

          // --- Mandate-text hider ---
          // The mandate paragraph lives inside the Airwallex iframe (cross-origin),
          // so we cannot reach it with CSS. Instead we clip the *host* container to
          // the height of everything ABOVE the mandate paragraph, then let a
          // ResizeObserver keep that clip up-to-date whenever the iframe resizes
          // (e.g. switching between "Add new" and "Use saved cards").
          const clipMandateText = () => {
            const iframe = containerRef.current?.querySelector('iframe');
            if (!iframe) return;

            // The mandate paragraph is approximately 55 px tall (one or two lines
            // of small text + its top margin). We shrink the wrapper by that amount
            // so the paragraph is scrolled out of view behind overflow:hidden.
            const MANDATE_HEIGHT_PX = 58;
            const rawHeight = iframe.offsetHeight;
            if (!rawHeight) return;

            const clippedHeight = Math.max(0, rawHeight - MANDATE_HEIGHT_PX);
            if (containerRef.current) {
              containerRef.current.style.height = `${clippedHeight}px`;
              containerRef.current.style.overflow = 'hidden';
            }
          };

          // Run immediately, then watch for future iframe resizes.
          clipMandateText();
          const ro = new ResizeObserver(clipMandateText);
          const iframe = containerRef.current?.querySelector('iframe');
          if (iframe) ro.observe(iframe);

          // Also re-clip on any DOM mutations inside the container (e.g. Airwallex
          // swaps the form content when the user toggles saved-card / new-card).
          const mo = new MutationObserver(clipMandateText);
          if (containerRef.current) {
            mo.observe(containerRef.current, { childList: true, subtree: true });
          }

          // Clean up observers when the component unmounts.
          const prevCleanup = elementRef.current?._mandateCleanup;
          if (prevCleanup) prevCleanup();
          if (elementRef.current) {
            elementRef.current._mandateCleanup = () => {
              ro.disconnect();
              mo.disconnect();
            };
          }
        });



        element.on("success", async (event) => {
          if (successHandledRef.current) return;
          successHandledRef.current = true;

          const paymentIntent = event?.detail?.intent || result;
          const intentId = paymentIntent?.id || result.id;

          console.log("💳 [STEP 1] Payment success event received");
          console.log("   intentId:", intentId);
          console.log("   airwallexCustomerId:", airwallexCustomerId);
          console.log("   event.detail keys:", event?.detail ? Object.keys(event.detail) : []);
          console.log("   event.detail.payment_method:", event?.detail?.payment_method);

          // Extract the payment method ID (must start with mtd_) from the success event
          let paymentMethodId =
            event?.detail?.payment_method?.id ||
            event?.detail?.intent?.payment_method?.id ||
            event?.detail?.intent?.latest_payment_attempt?.payment_method?.id;

          // Filter out non-mtd_ IDs (e.g. att_ attempt IDs are not valid)
          if (paymentMethodId && !paymentMethodId.startsWith('mtd_')) {
            paymentMethodId = null;
          }

          console.log("💳 [STEP 2] paymentMethodId from event:", paymentMethodId);

          let paymentConsentId =
            event?.detail?.payment_consent?.id ||
            event?.detail?.intent?.payment_consent_id ||
            event?.detail?.intent?.latest_payment_attempt?.payment_consent_id ||
            null;

          if (paymentConsentId && !paymentConsentId.startsWith("cst_")) {
            paymentConsentId = null;
          }

          console.log("💳 [STEP 2d] paymentConsentId from event:", paymentConsentId);

          // If not in event, fetch the payment intent to get the mtd_ payment method ID
          if ((!paymentMethodId || !paymentConsentId) && intentId)  {
            try {
              console.log("💳 [STEP 2b] Fetching payment intent to get payment_method id...");
              const fetchRes = await fetch(
                `${import.meta.env.VITE_BACKEND_URL}/api/subscription-plans/payment-intents/${intentId}`,
                {
                  method: "GET",
                  headers: {
                    "Accept": "application/json",
                    "ngrok-skip-browser-warning": "true",
                  },
                }
              );

              if (fetchRes.ok) {
                const fetchedIntent = await fetchRes.json();
                console.log("📥 Fetched PaymentIntent:", JSON.stringify(fetchedIntent, null, 2));

                // Try all known paths that may return an mtd_ payment method ID
                const candidates = [
                  fetchedIntent?.payment_method_id,
                  fetchedIntent?.payment_method?.id,
                  fetchedIntent?.latest_payment_attempt?.payment_method_id,
                  fetchedIntent?.latest_payment_attempt?.payment_method?.id,
                ];

                paymentMethodId = candidates.find(id => id?.startsWith('mtd_')) || null;

                console.log("💳 [STEP 2c] Extracted mtd_ ID for PaymentSource:", paymentMethodId);
              } else {
                console.warn("⚠️ Failed to fetch payment intent:", fetchRes.status);
              }
            } catch (fetchErr) {
              console.warn("⚠️ Could not fetch payment intent:", fetchErr.message);
            }
          }

          // Create Payment Source to get psrc_ ID (required for AUTO_CHARGE subscriptions)
          let paymentSourceId = null;

          if (airwallexCustomerId) {
            try {
              console.log(":arrows_counterclockwise: [STEP 3] Creating Payment Source for AUTO_CHARGE...");
              console.log("   billing_customer_id:", airwallexCustomerId);
              console.log("   external_id:", paymentMethodId || intentId);

              const requestBody = {
                billing_customer_id: airwallexCustomerId,
                payment_method_id: paymentMethodId || intentId,
                // payment_consent_id: paymentConsentId || undefined,
                ...(paymentCustomerId && { payment_customer_id: paymentCustomerId }),
              };

              console.log("   Request body:", JSON.stringify(requestBody));

              const sourceRes = await fetch(
                `${import.meta.env.VITE_BACKEND_URL}/api/subscription-plans/payment-sources/create`,
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "ngrok-skip-browser-warning": "true"
                  },
                  body: JSON.stringify(requestBody),
                }
              );

              const responseText = await sourceRes.text();
              console.log("   Response status:", sourceRes.status);
              console.log("   Response body:", responseText);

              if (sourceRes.ok) {
                const sourceData = JSON.parse(responseText);
                paymentSourceId = sourceData.paymentSource?.id;
                console.log(" [STEP 4] PaymentSource created:", paymentSourceId);
              } else {
                console.warn("⚠️ Failed to create PaymentSource:", sourceRes.status, responseText);
              }
            } catch (sourceErr) {
              console.error("❌ [STEP 3 ERROR] PaymentSource creation error:", sourceErr);
            }
          } else {
            console.warn("⚠️ [STEP 3 SKIP] Cannot create PaymentSource - missing airwallexCustomerId");
          }

          const successPayload = {
            status: "SUCCEEDED",
            paymentIntentId: paymentIntent?.id || result.id,
            clientSecret: result.client_secret,
            intent: paymentIntent,
            ...(paymentSourceId && { paymentSourceId }),
          };
          console.log("💳 [STEP 5] Payment success - final payment_source_id:", paymentSourceId);
          console.log("💳 [STEP 5] Success payload:", JSON.stringify(successPayload, null, 2));

          onContinue?.(successPayload);
          onPlaceOrder?.(successPayload);
        });

        element.on("error", (event) => {
          const message =
            event?.detail?.error?.message ||
            event?.detail?.message ||
            "Payment failed";

          setError(message);

          onContinue?.({
            status: "FAILED",
            paymentIntentId: result.id,
            clientSecret: result.client_secret,
          });
        });


        element.on("error", (event) => {
          const message =
            event?.detail?.error?.message ||
            event?.detail?.message ||
            "Payment failed";

          setError(message);

          onContinue?.({
            status: "FAILED",
            paymentIntentId: result.id,
            clientSecret: result.client_secret,
          });
        });
      } catch (err) {
        console.error("❌ Airwallex payment setup error:", err);
        setLoading(false);
        setError(err.message || "Failed to load payment form");
        initializedRef.current = false;
      }
    };

    setupPayment();

    return () => {
      isMounted = false;
      if (elementRef.current?._mandateCleanup) {
        elementRef.current._mandateCleanup();
      }
      if (elementRef.current?.unmount) {
        elementRef.current.unmount();
      }
      elementRef.current = null;
      lastAmountKeyRef.current = null;
    };
  }, [active, isDisabled, cart?.id, cart?.cartAmount, deliveryData?.price, cart?.currency?.code, airwallexCustomerId]);
  
  if (!active) {
    return (
      <section className="pb-4">
        <Header step={3} title="Paiement" />
      </section>
    );
  }

  return (
    <section>
      <Header step={3} title="Paiement" />

      <div className="mt-4">
        <div className="border rounded p-4 bg-[#f5f5f5] pb-[35px]">
          <label className="flex items-center gap-2 text-sm font-medium mb-4">
            <input type="radio" checked readOnly />
            Carte
          </label>

          {/* {loading && (
            <div className="text-sm text-gray-600 md:pl-[58.5px]">
              Loading secure payment form...
            </div>
          )} */}

          {error && (
            <div className="text-sm text-red-600 mb-4 md:pl-[58.5px]">
              {error}
            </div>
          )}

          <div className="md:pl-[58.5px] md:pr-[29.5px]">
            {/* overflow:hidden + dynamic height are set via JS in the ready handler
                so the mandate text is clipped regardless of screen or iframe resize */}
            <div
              ref={containerRef}
              id="airwallex-payment-element"
              className="min-h-[180px]"
            />
            {/* 3DS authentication challenge renders here instead of redirecting */}
            <style>{`
              #airwallex-auth-container,
              #airwallex-auth-container * {
                overflow: visible !important;
                max-height: none !important;
              }
              #airwallex-auth-container {
                width: 100%;
              }
              #airwallex-auth-container iframe {
                width: 100% !important;
                height: 600px !important;
                min-height: 600px !important;
                border: none !important;
              }
              #airwallex-auth-container > div,
              #airwallex-auth-container > div > div {
                width: 100% !important;
                height: auto !important;
              }
            `}</style>
            <div id="airwallex-auth-container" />
          </div>

          <div className="flex items-center gap-2 mt-[24px] text-[14px] md:text-[16px] text-gray-600 pl-0 md:pl-[58.5px] pr-[29.5px]">
            🔒 Paiement sécurisé - Vos informations sont 100% confidentielles.
          </div>

          {/* {intent?.id && (
            <div className="text-xs text-gray-500 mt-3 md:pl-[58.5px]">
              Payment reference: {intent.id}
            </div>
          )} */}
        </div>
      </div>
    </section>
  );
}

function Header({ step, title }) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="nr-step-hed-wr flex items-center gap-2 font-[700] text-[25px] text-[#333]">
        <span className="flex items-center justify-center rounded-full border-[2px] text-[20px] font-[400] border-[#333] h-[35px] w-[35px]">
          {step}
        </span>
        {title}
      </h2>
    </div>
  );
}