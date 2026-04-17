import { useState, useEffect, useRef } from "react";
import ClientStep from "./ClientStep";
import ShippingStep from "./ShippingStep";
import PaymentStep from "./PaymentStep";
import OrderSummary from "./OrderSummary";
import ThankYouStep from "./ThankYouStep";
import { useNavigate } from "react-router-dom";


// Session storage utilities for checkout persistence
const CHECKOUT_SESSION_KEY = "nh_checkout_state";
const saveToSession = (data) => {
  try {
    sessionStorage.setItem(CHECKOUT_SESSION_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn("⚠️ Failed to save checkout state:", e);
  }
};
const loadFromSession = () => {
  try {
    const raw = sessionStorage.getItem(CHECKOUT_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.warn("⚠️ Failed to load checkout state:", e);
    return null;
  }
};
const clearCheckoutSession = () => {
  try { sessionStorage.removeItem(CHECKOUT_SESSION_KEY); } catch(e) {}
};


export default function CheckoutLayout({
  cart,
  onCustomerCreate,
  onShippingAddress,
  onFetchShippingOptions,
  onAddVipToCart,
  onRemoveVipFromCart,
  onFetchLatestCart,
  onCreateAirwallexCustomer,
  onMapSubscriptionCustomer,
  onProvisionSubscription,
  clearCart,
  onCartCleared,
  onApplyCheckoutCoupon,
  onRemoveCheckoutCoupon,
  onApplyCheckoutDiscount,
  onRemoveCheckoutDiscount,
}) {
  /**
   * activeStep controls which section is expanded.
   * Order: client → delivery → payment
   * State is hydrated from sessionStorage on mount so it survives reloads.
   */
  const savedState = loadFromSession();

  const [activeStep, setActiveStep] = useState(savedState?.activeStep || "client");
  const [isMobileSummaryOpen, setIsMobileSummaryOpen] = useState(false);
  const [clientData, setClientData] = useState(savedState?.clientData || {});
  const [deliveryData, setDeliveryData] = useState(savedState?.deliveryData || {});
  const [paymentData, setPaymentData] = useState(savedState?.paymentData || {});
  const [customerId, setCustomerId] = useState(savedState?.customerId || null);
  const [isSavingAddress, setIsSavingAddress] = useState(false);
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const [bigcommerceCustomer, setBigcommerceCustomer] = useState(savedState?.bigcommerceCustomer || null);
  const [airwallexCustomer, setAirwallexCustomer] = useState(savedState?.airwallexCustomer || null);
  const navigate = useNavigate();
  const [shippingOptions, setShippingOptions] = useState(savedState?.shippingOptions || []);
  const [orderComplete, setOrderComplete] = useState(false);
  const [createdOrder, setCreatedOrder] = useState(null);
  const [checkoutCart, setCheckoutCart] = useState(cart);
  const [isVipChecked, setIsVipChecked] = useState(true);
  const [isVipLoading, setIsVipLoading] = useState(false);
  const [isVipUiChecked, setIsVipUiChecked] = useState(false);
  const hasInitializedVipUiRef = useRef(false);

  

  useEffect(() => {
    setCheckoutCart(prev => prev ?? cart);
  }, [cart]);
  const VIP_PRODUCT_ID = 210; // replace
  const fallbackSubscriptionProductIds = [...new Set([
    VIP_PRODUCT_ID,
    ...(import.meta.env.VITE_SUBSCRIPTION_PRODUCT_IDS || '')
      .split(',')
      .map((id) => Number(id.trim()))
      .filter((id) => Number.isInteger(id) && id > 0),
  ])];
  const [subscriptionProductIds, setSubscriptionProductIds] = useState(fallbackSubscriptionProductIds);


  // Listen for Airwallex customer from ClientStep
  useEffect(() => {
    const handleCustomerReady = (e) => {
      if (e.detail?.customer?.airwallexCustomerId) {
        setAirwallexCustomer(e.detail.customer);
        console.log("Airwallex customer received:", e.detail.customer.airwallexCustomerId);
      }
    };

    window.addEventListener('airwallexCustomerReady', handleCustomerReady);
    return () => window.removeEventListener('airwallexCustomerReady', handleCustomerReady);
  }, []);

  

  const getMappedSubscriptionProducts = (cartToCheck = cart) => {
    const allItems = [
      ...(cartToCheck?.lineItems?.physicalItems || []),
      ...(cartToCheck?.lineItems?.digitalItems || []),
    ];
    const seen = new Set();

    return allItems.filter((item) => {
      const productId = Number(item.product_id);

      if (!subscriptionProductIds.includes(productId) || seen.has(productId)) {
        return false;
      }

      seen.add(productId);
      return true;
    });
  };


  // const vipSelected = !!cart?.lineItems?.physicalItems?.some(
  //   (item) => item.product_id === VIP_PRODUCT_ID
  // );
  const vipSelected = !![
    ...(cart?.lineItems?.physicalItems || []),
    ...(cart?.lineItems?.digitalItems || []),
  ].some((item) => Number(item.product_id) === VIP_PRODUCT_ID);

  useEffect(() => {
    // Only sync once cart has lineItems loaded
    if (cart?.lineItems !== undefined) {
      setIsVipChecked(vipSelected);
    }
  }, [vipSelected, cart?.lineItems]);

  // Timer logic — persisted via a start timestamp so it survives reloads
  const DISCOUNT_DURATION = 10 * 60; // 10 minutes in seconds
  const [timeLeft, setTimeLeft] = useState(() => {
    const TIMER_KEY = "nh_checkout_timer_start";
    let start = Number(sessionStorage.getItem(TIMER_KEY));
    if (!start) {
      start = Date.now();
      sessionStorage.setItem(TIMER_KEY, String(start));
    }
    const elapsed = Math.floor((Date.now() - start) / 1000);
    return Math.max(DISCOUNT_DURATION - elapsed, 0);
  });

  useEffect(() => {
    let mounted = true;

    const loadEnabledPlans = async () => {
      try {
        const res = await fetch(
          // `${import.meta.env.VITE_BACKEND_URL}/api/subscription-plans/plans?status=enabled`,
          `${import.meta.env.VITE_BACKEND_URL}/api/subscription-plans/public/enabled-product-ids`,
          {
            headers: {
              Accept: 'application/json',
              'ngrok-skip-browser-warning': 'true',
            },
          }
        );

        if (!res.ok) {
          throw new Error(`Failed to load enabled plans: ${res.status}`);
        }

        // const plans = await res.json();
        // const ids = [...new Set(
        //   (Array.isArray(plans) ? plans : [])
        //     .map((plan) => Number(plan.bigcommerceProductId))
        //     .filter((id) => Number.isInteger(id) && id > 0)
        // )];

        // if (mounted) {
        //   setSubscriptionProductIds(ids);
        // }
        const payload = await res.json();

        const ids = [...new Set(
          (
            Array.isArray(payload)
              ? payload
              : Array.isArray(payload?.productIds)
                ? payload.productIds
                : []
          )
            .map((id) => Number(id))
            .filter((id) => Number.isInteger(id) && id > 0)
        )];

        console.log('Enabled subscription product IDs:', ids);
        console.log('🛒 Cart product IDs:', [
          ...(cart?.lineItems?.physicalItems || []),
          ...(cart?.lineItems?.digitalItems || []),
        ].map((item) => Number(item.product_id)));

        if (mounted && ids.length > 0) {
          setSubscriptionProductIds(ids);
        }
      } catch (err) {
        console.warn('Failed to load enabled subscription plans, using fallback product IDs:', err.message);
      }
    };

    loadEnabledPlans();

    return () => {
      mounted = false;
    };
  }, []);


  const ensureAirwallexCustomerForSubscription = async (cartToCheck = cart) => {
    const subscriptionProducts = getMappedSubscriptionProducts(cartToCheck);

    if (subscriptionProducts.length === 0) {
      console.log("ℹ️ No subscription product in cart, Airwallex customer not needed yet");
      return null;
    }

    if (airwallexCustomer?.airwallexCustomerId) {
      console.log("Reusing existing Airwallex customer:", airwallexCustomer.airwallexCustomerId);
      return airwallexCustomer;
    }

    const payload = {
      firstName: clientData?.firstName || "",
      lastName: clientData?.lastName || "",
      email: clientData?.email || bigcommerceCustomer?.email || "",
      phone: clientData?.phone || bigcommerceCustomer?.phone || "",
    };

    console.log("👤 [AW CUSTOMER] Ensuring Airwallex customer before payment", {
      subscriptionProductCount: subscriptionProducts.length,
      email: payload.email,
      hasClientData: !!clientData?.email,
      hasBigcommerceCustomer: !!bigcommerceCustomer?.id,
    });

    const awCustomer = await onCreateAirwallexCustomer?.(payload);

    if (awCustomer) {
      console.log("[AW CUSTOMER] Ready before payment:", awCustomer.airwallexCustomerId);
      setAirwallexCustomer(awCustomer);
      return awCustomer;
    }

    throw new Error("Failed to prepare Airwallex customer before payment");
  };


  useEffect(() => {
    const storedPayment = sessionStorage.getItem("airwallex_payment_result");
    if (!storedPayment) return;

    try {
      const parsed = JSON.parse(storedPayment);
      if (parsed?.status === "SUCCEEDED") {
        setPaymentData((prev) => ({
          ...prev,
          status: "SUCCEEDED",
          paymentIntentId: parsed.paymentIntentId,
        }));
      }
    } catch (err) {
      console.warn("Failed to parse stored Airwallex payment result", err);
    }
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const minutes = String(Math.floor(timeLeft / 60)).padStart(2, "0");
  const seconds = String(timeLeft % 60).padStart(2, "0");

  const validUntilDate = new Date();
  validUntilDate.setDate(validUntilDate.getDate());
  const formattedDate = validUntilDate.toLocaleDateString("en-GB");

  const handleVipToggle = async (checked) => {
    if (!cart?.id) return;
    
    //  Immediate UI feedback
    setIsVipUiChecked(checked);
    setIsVipLoading(true);
    
    try {
      if (checked) {
        await onAddVipToCart?.(cart.id);
      } else {
        await onRemoveVipFromCart?.(cart.id);
      }
    } catch (err) {
      console.error('VIP toggle failed:', err);
      //  Rollback UI on error
      setIsVipUiChecked(!checked);
      alert('Failed to update VIP CLUB selection');
    } finally {
      setIsVipLoading(false);
    }
  };


  useEffect(() => {
    saveToSession({
      activeStep,
      clientData,
      deliveryData,
      paymentData,
      customerId,
      bigcommerceCustomer,
      airwallexCustomer,
      shippingOptions,
    });
  }, [activeStep, clientData, deliveryData, paymentData, customerId, bigcommerceCustomer, airwallexCustomer, shippingOptions]);


  useEffect(() => {
    if (activeStep === 'payment') {
      // First time entering payment step with cart data ready
      if (!hasInitializedVipUiRef.current && cart?.lineItems !== undefined) {
        hasInitializedVipUiRef.current = true;
        // Pre-select checkbox by default AND actually add VIP to cart if not already there
        setIsVipUiChecked(true);
        if (!vipSelected && cart?.id) {
          // VIP not in cart yet — actually add it via API so it appears in the real cart
          console.log('🛒 Auto-adding VIP product 210 to cart (pre-selected by default)');
          handleVipToggle(true);
        }
      } 
      // After initialization, always sync with actual cart state
      else if (hasInitializedVipUiRef.current) {
        setIsVipUiChecked(vipSelected);
      }
    } else {
      // Reset initialization flag when leaving payment step (for navigation back/forth)
      hasInitializedVipUiRef.current = false;
      if (cart?.lineItems !== undefined) {
       setIsVipUiChecked(vipSelected);
      }
    }
  }, [activeStep, vipSelected, cart?.lineItems]);

  // Delivery completion check from working version
  const isDeliveryComplete = !!(
    deliveryData?.address &&
    deliveryData?.city &&
    deliveryData?.postalCode &&
    deliveryData?.shippingOptionId
  );

  const hasReachedDelivery = activeStep === "delivery" || activeStep === "payment";


  const handleClientContinue = async (clientFormData) => {
    // :white_check_mark: Step 1: Normalize and save the FRESH form data
    const newClientData = {
      firstName: clientFormData.firstName?.trim() || "",
      lastName: clientFormData.lastName?.trim() || "",
      email: clientFormData.email?.trim()?.toLowerCase() || "",
      phone: clientFormData.phone?.trim() || "",
      company: clientFormData.company?.trim() || ""
    };

    console.log(":floppy_disk: Saving FRESH form data:", newClientData);
    setClientData(newClientData);

    // :white_check_mark: Step 2: Create/fetch customer in background (optional)
    if (onCustomerCreate && cart?.id) {
      try {
        console.log(':bust_in_silhouette: Checking customer in BigCommerce for email:', newClientData.email);
        const result = await onCustomerCreate(clientFormData, cart.id);

        if (result && result.customerId) {
          console.log(':white_check_mark: Customer found/created. ID:', result.customerId);

          // :key: CRITICAL FIX: Only merge SAFE fields from API
          // DO NOT overwrite firstName/lastName/email from API!
          setClientData(prev => ({
            ...prev,                    // Keep ALL fresh form data
            customerId: result.customerId,  // :white_check_mark: Add these from API
            id: result.customerId,
            // :warning: ONLY add these if they don't exist in form data:
            ...(prev.phone || !result.customerData?.phone ? {} : { phone: result.customerData.phone }),
            ...(prev.company || !result.customerData?.company ? {} : { company: result.customerData.company }),
            // :x: NEVER do: ...result.customerData (it overwrites name/email!)
          }));

          setCustomerId(result.customerId);
          // setBigcommerceCustomer(result.customerData || null);
          setBigcommerceCustomer({
            ...(result.customerData || {}),
            id: result.customerId,
          });
        }
      } catch (err) {
        console.error(':x: Customer API error (continuing anyway):', err);
        // Continue checkout even if customer API fails
      }
    }

    // :white_check_mark: Step 3: Move to next step
    setActiveStep("delivery");
  };

  // Shipping continue handler with address saving
  const handleDeliveryContinue = async (deliveryFormData) => {
    // Store delivery data locally
    setDeliveryData(deliveryFormData);

    // Save address to BigCommerce if we have the handler and customer ID
    if (onShippingAddress && customerId) {
      setIsSavingAddress(true);
      try {
        console.log('🏠 Saving shipping address...');
        const addressResult = await onShippingAddress(deliveryFormData, customerId, clientData);

        if (addressResult) {
          console.log('Address saved:', addressResult.addressId);
          // Update delivery data with address ID
          setDeliveryData(prev => ({
            ...prev,
            addressId: addressResult.addressId,
            ...addressResult.address
          }));
        } else {
          console.warn('⚠️ Address save failed or returned no result');
        }
      } catch (err) {
        console.error('❌ Error saving address:', err);
        // Continue checkout even if address save fails
      } finally {
        setIsSavingAddress(false);
      }
    }

    try {
      await ensureAirwallexCustomerForSubscription(cart);
    } catch (err) {
      console.error("❌ Failed to prepare Airwallex customer before payment:", err);
      alert("Unable to prepare subscription billing customer. Please try again.");
      return;
    }


    // Move to payment step
    setActiveStep("payment");
  };


  // Order creation function
  const handlePlaceOrder = async (paymentResultArg = null) => {
    if (!cart?.id) {
      alert("No cart found. Please refresh the page.");
      return;
    }
    if (isPlacingOrder) {
      console.log("🚫 Blocked duplicate call");
      return;
    }

    const finalPaymentData = paymentResultArg || paymentData || {};
    const paymentSourceId = finalPaymentData?.paymentSourceId;

    setIsPlacingOrder(true);


    // let latestCart = cart;
    let latestCart = checkoutCart || cart;

    try {
      if (onFetchLatestCart && cart?.id) {
        latestCart = await onFetchLatestCart(cart.id);
        console.log('🛒 Latest cart before order:', latestCart);
      }
    } catch (cartErr) {
      console.warn('⚠️ Failed to fetch latest cart before order:', cartErr.message);
    }

    let awCustomer = airwallexCustomer;

    const subscriptionProducts = getMappedSubscriptionProducts(latestCart);

    if (subscriptionProducts.length > 0 && !bigcommerceCustomer?.id) {
      setIsPlacingOrder(false);
      alert("Customer details are missing. Please go back to the first step and try again.");
      return;
    }

    if (subscriptionProducts.length > 0) {
      try {
        console.log('🔁 Subscription product found in final cart. Starting mapping flow...');



        if (!awCustomer) {
          awCustomer = await onCreateAirwallexCustomer?.({
            ...clientData,
            ...bigcommerceCustomer,
          });

          if (awCustomer) {
            setAirwallexCustomer(awCustomer);
          }
        }
        if (awCustomer && bigcommerceCustomer) {
          const mappingResult = await onMapSubscriptionCustomer?.({
            cart: latestCart,
            bigcommerceCustomer,
            airwallexCustomer: awCustomer,
          });
          const mappedCustomers = mappingResult?.customers || (
            mappingResult?.customer ? [mappingResult.customer] : []
          );

          console.log(' Subscription customer mapped:', {
            count: mappedCustomers.length,
            productIds: mappedCustomers.map((customer) => Number(customer.subscriptionProductId)),
          });
        } else {
          console.warn('⚠️ Missing Airwallex customer or BigCommerce customer, skipping mapping');
        }
      } catch (mappingErr) {
        console.warn('⚠️ Subscription mapping failed before order creation:', mappingErr.message);
      }
    } else {
      console.log('ℹ️ No subscription product in final cart. Skipping Mongo mapping.');
    }



    console.log("💳 paymentData from state:", paymentData);
    console.log("💳 paymentResultArg:", paymentResultArg);
    console.log("💳 finalPaymentData used for order:", finalPaymentData);

    const intentId = finalPaymentData?.paymentIntentId;
    const isPaymentSuccessful = finalPaymentData?.status === "SUCCEEDED";

    const paymentMethod = isPaymentSuccessful
      ? {
        name: "Airwallex Credit Card",
        method: "airwallex",
        paid: true,
        transaction_id: intentId,
        amount: latestCart?.cartAmount || 0,
        currency: latestCart?.currency?.code || "EUR",
      }
      : null;

    console.log("💳 Derived paymentMethod:", paymentMethod);

    try {
      console.log('🛒 Starting order creation...');
      // Prepare the order data
      const orderData = {
        customerId: customerId || 0, // Use 0 if no customer ID (guest checkout)
        statusId: 1, // Pending status
        billingAddress: {
          first_name: clientData.firstName || deliveryData.firstName || '',
          last_name: clientData.lastName || deliveryData.lastName || '',
          street_1: deliveryData.address || '',
          city: deliveryData.city || '',
          state: deliveryData.state || deliveryData.city || '',
          zip: deliveryData.postalCode || '',
          country: deliveryData.country || 'France',
          country_iso2: getCountryCode(deliveryData.country || 'France'),
          email: clientData.email || '',
          phone: clientData.phone || deliveryData.phone || ''
        },
        products: [
          ...(latestCart?.lineItems?.physicalItems || []),
          ...(latestCart?.lineItems?.digitalItems || []),
        ].map((item) => ({
          product_id: item.product_id,
          quantity: item.quantity || 1,
          product_options: item.options?.map((opt) => ({
            id: opt.nameId,
            value: opt.valueId,
          })) || [],
        })),
        paymentMethod: paymentMethod,
        shippingMethod: deliveryData?.shippingOptionId
          ? {
            id: deliveryData.shippingOptionId,
            name: deliveryData.methodLabel || deliveryData.method,
            costIncTax: deliveryData.price || 0,
            costExTax: deliveryData.price || 0,
          }
          : null,

      };
      // Add shipping address if available
      if (deliveryData.address) {
        orderData.shippingAddress = {
          first_name: deliveryData.firstName || clientData.firstName || '',
          last_name: deliveryData.lastName || clientData.lastName || '',
          street_1: deliveryData.address || '',
          city: deliveryData.city || '',
          state: deliveryData.state || deliveryData.city || '',
          zip: deliveryData.postalCode || '',
          country: deliveryData.country || 'France',
          country_iso2: getCountryCode(deliveryData.country || 'France'),
          email: clientData.email || '',
          phone: clientData.phone || deliveryData.phone || ''
        };
      }
      // console.log('📤 Order data:', orderData);
      console.log('📤 SENDING to /api/orders/create:', {
        url: `${import.meta.env.VITE_BACKEND_URL}/api/orders/create`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(orderData, null, 2)
      });

      console.log("📤 Final order payload:", orderData);

      // Call the order creation endpoint
      const response = await fetch(
        `${import.meta.env.VITE_BACKEND_URL}/api/orders/create`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'ngrok-skip-browser-warning': 'true'
          },
          body: JSON.stringify(orderData)
        }
      );

      console.log("PaymentMethod", paymentMethod);
      const responseText = await response.text();
      console.log('📥 Response status:', response.status);
      console.log('📥 Response body:', responseText);

      if (response.ok) {
        const result = JSON.parse(responseText);
        if (result.success) {
          console.log(' Order created:', result);

          if (subscriptionProducts.length > 0 && awCustomer && bigcommerceCustomer) {
            try {
              console.log('📤 [CHECKOUTLAYOUT] Calling provision with:', {
                orderId: result.orderId,
                paymentSourceId,
                paymentSourceIdPrefix: paymentSourceId?.substring(0, 4),
                hasAwCustomer: !!awCustomer,
                hasBigCommerceCustomer: !!bigcommerceCustomer,
                subscriptionProductIds: subscriptionProducts.map((item) => Number(item.product_id)),
              });
              const subscriptionProvisionResult = await onProvisionSubscription?.({
                orderId: result.orderId,
                cart: latestCart,
                bigcommerceCustomer,
                airwallexCustomer: awCustomer,
                paymentSourceId,
              });
              const provisionedSubscriptions = subscriptionProvisionResult?.subscriptions || (
                subscriptionProvisionResult?.subscription ? [subscriptionProvisionResult.subscription] : []
              );

              console.log('Subscription provisioned:', {
                count: provisionedSubscriptions.length,
                errors: subscriptionProvisionResult?.errors || [],
              });
            } catch (subErr) {
              console.warn('⚠️ Subscription provisioning failed:', subErr.message);
            }
          }


          // Clear cart in backend after successful order creation
          try {
            if (latestCart?.id) {
              const clearCartResult = await clearCart?.(latestCart.id);
              console.log('🧹 Cart cleared successfully:', clearCartResult);
              onCartCleared?.();
            }
          } catch (clearErr) {
            console.warn('⚠️ Failed to clear cart after order creation:', clearErr.message);
          }

          clearCheckoutSession();
          sessionStorage.removeItem("nh_checkout_timer_start");
          navigate("/thank-you", {
            state: {
              order: {
                orderId: result.orderId,
                id: result.orderId,
              },
              customer: {
                firstName: clientData?.firstName || clientData?.first_name || '',
                first_name: clientData?.firstName || clientData?.first_name || '',
              },
              cart: latestCart,
            },
          });
        } else {
          throw new Error(result.error || 'Failed to create order');
        }
      } else {
        throw new Error(`HTTP ${response.status}: ${responseText.substring(0, 100)}`);
      }
    } catch (error) {
      console.error('❌ Order creation error:', error);
      alert(`Failed to create order: ${error.message}`);
    } finally {
      setIsPlacingOrder(false);
    }
  };

  // Helper function to get country code
  const getCountryCode = (countryName) => {
    const countryMap = {
      'United States': 'US',
      'France': 'FR',
      'Canada': 'CA',
      'United Kingdom': 'GB',
      'Germany': 'DE',
      'Australia': 'AU'
    };
    return countryMap[countryName] || 'FR';
  };

  const isTimeUp = Number(minutes) === 0 && Number(seconds) === 0;

  // Optional: Fetch shipping options when delivery step becomes active
  useEffect(() => {
    console.log("🧭 CheckoutLayout step changed:", {
      activeStep,
      hasFetchShippingHandler: !!onFetchShippingOptions,
      shippingOptionsCount: shippingOptions.length,
    });
  }, [activeStep, onFetchShippingOptions, shippingOptions.length]);

  return (
    <div className="min-h-screen bg-[#fff]">
      {/* ================= HEADER ================= */}
      <header className="bg-white">
        <div className="max-w-[1200px] mx-auto md:py-[39px] text-center p-[20px]">
          <img
            src="../images/hike-summit.webp"
            alt="logo"
            className="h-[50px] mx-auto object-contain nr-logo"
          />
        </div>
      </header>


      {/* ================= MAIN CONTENT ================= */}
      <main className="max-w-[1200px] mx-auto py-8 px-[28px] md:px-[35px] flex pt-0 flex-col md:flex-row flex-wrap">
        {/* ================= LEFT COLUMN ================= */}
        <section className="nr-lft-prt w-[100%] lg:w-[66.6666666667%] lg:pr-[78px] pr-0 md:w-[58.3333333333%]">
          {/* ================= PROMO BANNER (using old styles but new logic) ================= */}
          <div className="max-w-[1200px] mx-auto">
            <div className="nr-date-time-wr text-white bg-[#3b4450] rounded-[5px] flex-wrap py-[20px] px-[10px] gap-[5px] text-center flex justify-center align-middle">
              {isTimeUp ? (
                <p className="text-[14px] md:text-[16px] font-[600]">
                  Continue your order
                </p>
              ) : (
                <>
                  <p className="nr-date-time-txt-fir text-[14px] md:text-[16px] font-[600]">
                    Your order is reserved for
                  </p>

                  <p className="nr-date-time-txt-sec text-[13px] md:text-[16px]">
                    <span className="text-[#f4d54c] font-[600]">
                      {minutes}:{seconds}
                    </span>
                  </p>
                </>
              )}
            </div>
          </div>
          <div className="bg-white rounded pt-[24px] space-y-6">
            {/* CLIENT STEP with updated onContinue handler */}
            <ClientStep
              active={activeStep === "client"}
              data={clientData}
              onContinue={handleClientContinue}
              onEdit={() => setActiveStep("client")}
              isDisabled={activeStep !== "client"}
              cart={cart}
            />

            {/* DELIVERY STEP with enhanced props */}
            <ShippingStep
              active={activeStep === "delivery"}
              hasReachedDelivery={hasReachedDelivery}
              data={deliveryData}
              isComplete={isDeliveryComplete}
              onContinue={handleDeliveryContinue}
              onEdit={() => setActiveStep("delivery")}
              isDisabled={activeStep !== "delivery" || isSavingAddress}
              cart={cart}
              customerData={clientData}
              isLoading={isSavingAddress}
              onFetchShippingOptions={onFetchShippingOptions}
              shippingOptions={shippingOptions}
              setShippingOptions={setShippingOptions}
            />

            {/* PAYMENT STEP with cart prop */}
            <PaymentStep
              active={activeStep === "payment"}
              data={paymentData}
              onContinue={(data) => setPaymentData(data)}
              isDisabled={activeStep !== "payment"}
              onPlaceOrder={handlePlaceOrder}
              cart={checkoutCart}
              clientData={clientData}
              deliveryData={deliveryData}
              airwallexCustomerId={airwallexCustomer?.airwallexCustomerId}
            />

            {/* ORDER BUTTON & SECURITY SECTION */}
            {activeStep === "payment" && (
              <>

                {/* <button
                  type="button"
                  onClick={handlePlaceOrder}
                  // disabled={isPlacingOrder}



                  // disabled={isPlacingOrder || paymentData?.status !== "SUCCEEDED"}

                  disabled={isPlacingOrder || isVipLoading || paymentData?.status !== "SUCCEEDED"}

                  // className={`w-full cursor-pointer ${
                  //   isPlacingOrder 
                  //     ? 'bg-gray-400 cursor-not-allowed' 
                  //     : 'bg-[#2fb34a] hover:bg-[#28a745]'
                  // } transition text-white font-semibold py-3 rounded flex items-center justify-center gap-2`}
                  className={`w-full cursor-pointer ${
                    isPlacingOrder || paymentData?.status !== "SUCCEEDED"
                      ? 'bg-gray-400 cursor-not-allowed'
                      : 'bg-[#2fb34a] hover:bg-[#28a745]'
                  } transition text-white font-semibold py-3 rounded flex items-center justify-center gap-2`}
                >

                  {isPlacingOrder ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                      PROCESSING ORDER...
                    </>
                  ) : (
                    'PLACE AN ORDER'
                  )}

                </button> */}

                {isPlacingOrder && (
                  <div className="w-full bg-[#2fb34a] text-white font-semibold py-3 rounded flex items-center justify-center gap-2">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    PROCESSING THE ORDER…
                  </div>
                )}


                <div className="text-xs text-gray-600 text-center mt-3 flex items-center gap-[5px] justify-center">
                  <img src="../images/ssl.webp" alt="lock" className="h-[15px]" />
                  Secure SSL encryption
                </div>

                <div className="flex justify-center gap-6 mt-4">
                  <img
                    src="../images/payment-icon-new.webp"
                    alt="McAfee"
                    className="h-[50px]"
                  />
                </div>



                {/* Warrantly Subscription section */}


                <div className="nr-wrranty-wr py-[10px] px-[12px] border border-[#ccc]">
                  <div className="nr-checkbox-wr bg-[#3b4450] gap-[10px] p-[10px] rounded-[4px] flex items-center my-[10px]">
                    <svg xmlns="http://www.w3.org/2000/svg" version="1.0" width="26px" height="auto" viewBox="0 0 1200.000000 1100.000000" preserveAspectRatio="xMidYMid meet">
                      <g transform="translate(0.000000,1280.000000) scale(0.100000,-0.100000)" fill="#FFF" stroke="none">
                        <path d="M7318 10295 l-3 -1090 -2817 -3 -2818 -2 0 -2430 0 -2430 2820 0 2820 0 2 -1088 3 -1088 2175 2303 c1196 1266 2174 2305 2173 2308 -1 4 -107 117 -235 253 -129 136 -1081 1145 -2117 2242 -1036 1097 -1910 2022 -1942 2055 l-59 60 -2 -1090z"></path>
                      </g>
                    </svg>

                    <div className="nr-checkbox-wr-cntnt flex gap-[10px] items-center">
                      <div className="nr-checkbox-outer">
                        <input
                          type="checkbox"
                          id="vip-club"
                          name="vip-club"
                          className="nr-checkbox"
                          checked={isVipUiChecked}
                          disabled={isVipLoading}
                          onChange={(e) => handleVipToggle(e.target.checked)}
                        />
                      </div>
                      <label htmlFor="vip-club" className="text-[16px] text-white">
                        VIP CLUB - ACCESS
                      </label>
                    </div>
                  </div>

                  <div className="nr-wrranty-text pt-[15px] relative">
                    {/* <p className="text-[13px]">
                      By checking this box, I activate my 30-day free trial to the VIP CLUB, giving me access to exclusive benefits on Hike-Summit. After the trial, the subscription renews automatically at £12.99/month. This membership is non-binding and can be cancelled at any time by contacting support. Consult the {" "}
                      <a
                        href="https://kasweb-c4.mybigcommerce.com/vip-club/"
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: "#007bff", textDecoration: "underline" }}
                      >
                        <span>vip-club </span>
                      </a> 
                      policy for more information.
                    </p> */}

                    <p className="text-[13px]">
                      By ticking this box, I am activating my 30-day free trial of the VIP CLUB, which gives me access to exclusive benefits on Hike-Summit. At the end of the trial period, the subscription will automatically renew at a rate of £12.99 per month. This subscription is non-binding and can be cancelled at any time by contacting customer service. See the /vip-club terms and conditions for more information.
                    </p>

                    {isVipLoading && (
                      <div className="absolute inset-0 bg-white/80 flex items-center justify-center rounded-[4px] z-10">
                        <div className="w-8 h-8 border-4 border-gray-300 border-t-[#3b4450] rounded-full animate-spin"></div>
                      </div>
                    )}
                  </div>
                </div>
                {/* <div className="nr-wrranty-wr py-[10px] px-[12px] border border-[#ccc]">
                  <div className="nr-wrranty-img-outer w-100 flex justify-center">
                    <img className="h-[100px]" src="../images/one-yr-warranty.webp" alt="wrranty-img" />
                  </div>
                  <div className="nr-checkbox-wr bg-[#3b4450] gap-[10px] p-[10px] rounded-[4px] flex items-center my-[10px]">
                    <svg xmlns="http://www.w3.org/2000/svg" version="1.0" width="26px" height="auto" viewBox="0 0 1200.000000 1100.000000" preserveAspectRatio="xMidYMid meet"><g transform="translate(0.000000,1280.000000) scale(0.100000,-0.100000)" fill="#FFF" stroke="none"><path d="M7318 10295 l-3 -1090 -2817 -3 -2818 -2 0 -2430 0 -2430 2820 0 2820 0 2 -1088 3 -1088 2175 2303 c1196 1266 2174 2305 2173 2308 -1 4 -107 117 -235 253 -129 136 -1081 1145 -2117 2242 -1036 1097 -1910 2022 -1942 2055 l-59 60 -2 -1090z"></path></g></svg>
                    <div className="nr-checkbox-wr-cntnt flex gap-[10px] items-center">
                      <input type="checkbox" id="warranty" name="warranty" className="nr-checkbox" />
                      <label htmlFor="warranty" className="text-[16px] text-white">OUI ! JE SOUHAITE EN BÉNÉFICIER !</label>
                    </div>
                  </div>
                  <div className="nr-wrranty-text pt-[15px]">
                    <p className="text-[13px]">EXTENSION GARANTIE 1 AN ! Si cette case est cochée, le montant de 3.97€ sera chargé dans les 24h en tant que transaction additionnelle. Vous bénéficierez d'une extension de garantie de 1 an via notre partenaire AssurPremium. Vous avez 24h pour changer d'avis si vous ne souhaitez plus en bénéficier. Après chargement de la transaction, vous pouvez obtenir un remboursement intégral dans les 90 jours en nous contactant à support@flashventes.com</p>
                  </div>
                </div> */}
              </>
            )}
          </div>
        </section>

        {/* ================= RIGHT COLUMN ================= */}
        <aside className="nr-rght-prt w-100 lg:w-[33.3333333333%] md:w-[41.6666666667%] mt-[38px] md:pl-[15px] pl-0">
          {/* cart prop to OrderSummary (hidden on mobile, visible on desktop) */}
          <div className="nr-desktop-order-summary hidden md:block">
            <OrderSummary
              deliveryPrice={deliveryData?.price ?? 0}
              cart={checkoutCart}
              onCartUpdate={setCheckoutCart}
              onApplyCheckoutCoupon={onApplyCheckoutCoupon}
              onRemoveCheckoutCoupon={onRemoveCheckoutCoupon}
              onApplyCheckoutDiscount={onApplyCheckoutDiscount}
              onRemoveCheckoutDiscount={onRemoveCheckoutDiscount}
            />
          </div>
          {/* first-part */}
          <div className="nr-rght-bottom-info-cntnt pt-[30px] pb-[30px] border-b ">
            <div className="nr-info-hed-prt flex gap-[8px] items-center text-[18px] font-[600] pb-[8px]">
              <img src="../images/shield-2.webp" alt="shield" className="h-[40px] w-[40px] object-contain" />
              <h3>Service Client</h3>
            </div>
            <p className="pb-[20px] text-[15px] text-[#747474]">You can reach us from Monday to Friday, from 8:00 AM to 5:00 PM.</p>
            <div className="nr-contact-info">
              <div className="nr-info-item flex gap-[8px] align-middle pb-[16px]">
                <img src="../images/phone-icon.webp" alt="phone" className="h-[24px] w-[24px] object-contain" />
                <p className="text-[15px] text-[#747474]">+44 20 3885 0312</p>
              </div>
              <div className="nr-info-item flex gap-[8px] align-middle">
                <img src="../images/email-icon.webp" alt="email" className="h-[24px] w-[24px] object-contain" />
                <p className="text-[15px] text-[#747474]">help@hike-summit.com</p>
              </div>
            </div>
          </div>

          {activeStep === "payment" && (
            <div className="nr-wrranty-wr py-[10px] px-[12px] border border-[#ccc] hidden">
              <div className="nr-checkbox-wr bg-[#3b4450] gap-[10px] p-[10px] rounded-[4px] flex items-center my-[10px]">
                <svg xmlns="http://www.w3.org/2000/svg" version="1.0" width="26px" height="auto" viewBox="0 0 1200.000000 1100.000000" preserveAspectRatio="xMidYMid meet">
                  <g transform="translate(0.000000,1280.000000) scale(0.100000,-0.100000)" fill="#FFF" stroke="none">
                    <path d="M7318 10295 l-3 -1090 -2817 -3 -2818 -2 0 -2430 0 -2430 2820 0 2820 0 2 -1088 3 -1088 2175 2303 c1196 1266 2174 2305 2173 2308 -1 4 -107 117 -235 253 -129 136 -1081 1145 -2117 2242 -1036 1097 -1910 2022 -1942 2055 l-59 60 -2 -1090z"></path>
                  </g>
                </svg>

                <div className="nr-checkbox-wr-cntnt flex gap-[10px] items-center">
                  <div className="nr-checkbox-outer">
                    <input
                      type="checkbox"
                      id="vip-club-mobile"
                      name="vip-club"
                      // className="nr-checkbox relative h-[16px] w-[16px] before:absolute before:content-[''] before:w-[14px] before:h-[14px] before:left-[1px] before:top-[1px] before:bg-[url('/loading.png')] before:bg-no-repeat before:bg-contain before:bg-center before:animate-spin"
                      className="nr-checkbox"
                      checked={isVipUiChecked}
                      disabled={isVipLoading}
                      onChange={(e) => handleVipToggle(e.target.checked)}
                    />
                  </div>
                  <label htmlFor="vip-club-mobile" className="text-[16px] text-white">
                    ACCÈS AU CLUB VIP
                  </label>
                </div>
              </div>

              <div className="nr-wrranty-text pt-[15px] relative">
                <p className="text-[13px]">
                  By checking this box, I activate my 30-day free trial of the VIP CLUB, which gives me access to exclusive benefits on Hike-Summit. After the trial period, the subscription automatically renews at a rate of €12.99 per month. This subscription is non-binding and can be cancelled at any time by contacting customer service. See the terms and conditions of the /club-vip.
                </p>
                {/* <p className="text-[13px]">
                En cochant cette case, j'active mon essai gratuit de 30 jours au CLUB VIP, ce qui me donne accès à des avantages exclusifs sur Hike-Summit. À l'issue de la période d'essai, l'abonnement se renouvelle automatiquement au tarif de 12,99€ par mois. Cet abonnement est sans engagement et peut être résilié à tout moment en contactant le service client. Consultez les Terms and Conditions du {" "}
                /club-vip
                {" "}pour plus d'informations.
              </p> */}

                {/* Overlay Loader - Shows when isVipLoading is true */}
                {isVipLoading && (
                  <div className="absolute inset-0 bg-white/80 flex items-center justify-center rounded-[4px] z-10">
                    <div className="w-8 h-8 border-4 border-gray-300 border-t-[#3b4450] rounded-full animate-spin"></div>
                  </div>
                )}
              </div>
            </div>
          )}
          {/* second-part */}
          <div className="nr-rght-bottom-info-cntnt py-[30px] border-b">
            <div className="nr-info-hed-prt flex gap-[8px] items-center text-[18px] font-[600] pb-[8px]">
              <img src="../images/calendar-2.webp" alt="shield" className="h-[40px] w-[40px] object-contain" />
              <h3>Shopping experience</h3>
            </div>
            <p className="text-[15px] text-[#747474]">Enjoy an exceptional shopping experience, 30-day returns.</p>
          </div>
          {/* third-part */}
          <div className="nr-rght-bottom-info-cntnt py-[30px]">
            <div className="nr-info-hed-prt flex gap-[8px] items-center text-[18px] font-[600] pb-[8px]">
              <img src="../images/delivery-truck-icon.webp" alt="shield" className="h-[40px] w-[40px] object-contain" />
              <h3>Order tracking</h3>
            </div>
            <p className="text-[15px] text-[#747474]">Benefit from real-time tracking of your order.</p>
          </div>

            

       
          {/* <div className="nr-review-prt py-[30px]">
            <h2 className="text-[18px] font-[600]">Ce que disent nos clients</h2> */}
            {/* First Review */}
            {/* <div className="nr-review-outer-wr">
              <div className="nr-review-wr bg-[#f4f4f4] p-[15px] rounded-[12px] mt-[17px] relative before:absolute before:content-[''] before:w-[30px] before:h-[30px] before:bg-[#f4f4f4] before:left-[35px] before:bottom-[-5px] before:rotate-[45deg]">
                <p className="text-[14px] text-center">"Hike Summit est mon magasin en ligne favoris. Il y a beaucoup de produits innovants à très bon prix. J'achète régulièrement sur ce site et en suis très satisfait. Je le recommande totalement"</p>
              </div>
              <div className="flex justify-between w-100 mt-[13px] mb-[26px]">
                <p className="text-[14px] font-[600]">Nicolas D. - Paris</p>
                <img src="../images/star.webp" alt="star" className="object-contain" />
              </div>
            </div> */}
            {/* Second Review */}
            {/* <div className="nr-review-outer-wr border-b">
              <div className="nr-review-wr bg-[#f4f4f4] p-[15px] rounded-[12px] mt-[17px] relative before:absolute before:content-[''] before:w-[30px] before:h-[30px] before:bg-[#f4f4f4] before:left-[35px] before:bottom-[-5px] before:rotate-[45deg]">
                <p className="text-[14px] text-center">"Très bonne boutique, large choix, on y trouve tout à tout petit prix. Je recommande totalement Hike Summit pour son sérieux."</p>
              </div>
              <div className="flex justify-between w-100 mt-[13px] mb-[26px]">
                <p className="text-[14px] font-[600]">Marie P. - Marseille</p>
                <img src="../images/star.webp" alt="star" className="object-contain" />
              </div>
            </div> */}
          {/* </div> */}

          
          <footer className="nr-foote w-[100%] border-t pt-[32px]">
            {/* <div className="nr-footer-hed pt-[10px] pb-[20px]">
              <h2 className="text-center font-[600]">Policies</h2>
            </div> */}
            <div className="nr-footer-links flex flex-col gap-[10px] items-center justify-between">
              <a href="https://kasweb-c4.mybigcommerce.com/conditions-generales/" className="liks text-[12px] text-[#656565]">Terms and Conditions</a>
              <a href="https://kasweb-c4.mybigcommerce.com/politique-d-expedition/" className="liks text-[12px] text-[#656565]">Shipping Policies and Rates</a>
              <a href="https://kasweb-c4.mybigcommerce.com/politique-de-confidentialite/" className="liks text-[12px] text-[#656565]">Privacy Policy</a>
              <a href="https://kasweb-c4.mybigcommerce.com/politique-de-retour-et-de-remboursement/" className="liks text-[12px] text-[#656565]">Exchange and Returns</a>
            </div>
          </footer>
        </aside>
      </main>

      {/* ================= MOBILE STICKY ORDER BAR ================= */}
      
      <div className="nr-mobile-order-bar md:hidden fixed w-[90%] left-[50%] translate-x-[-50%] bottom-[20px] rounded-[5px] h-[max-content] bg-white shadow-[0_4px_8px_rgba(221,221,221,0.5)] border p-[10px] border-[#ddd]" onClick={() => setIsMobileSummaryOpen(true)}>
        <div className="nr-mobile-order-bar-inner">
          <div className="nr-mobile-order-bar-left flex justify-between items-center">
            {(() => {
              const allBarItems = [
                ...(checkoutCart?.lineItems?.physicalItems || []),
                ...(checkoutCart?.lineItems?.digitalItems || []),
              ].filter(item => ![210].includes(Number(item.product_id)));
              const firstItem = allBarItems[0];
              const totalQty = allBarItems.reduce((sum, item) => sum + (item.quantity || 1), 0);
              const barTotal = Number(checkoutCart?.cartAmount || 0);
              return (
                <>
                  <div className="nr-fixed-bar-flx-inner-wr flex gap-[10px]">
                    {firstItem?.imageUrl && (
                      <img
                        src={firstItem.imageUrl}
                        alt=""
                        className="nr-mobile-order-bar-thumb h-[48px] w-[48px] object-cover"
                      />
                    )}
                    <div className="nr-mobile-order-bar-info">
                      <span className="nr-mobile-order-bar-count block text-[18px] font-[600]">{totalQty} article{totalQty > 1 ? 's' : ''}</span>
                      <span className="nr-mobile-order-bar-link block text-[#476bef] text-[13px]">Show details</span>
                    </div>
                  </div>
                  <span className="nr-mobile-order-bar-total text-[25px] font-[600]">€{barTotal.toFixed(2)}</span>
                </>
              );
            })()}
          </div>
        </div>
      </div>

      {/* ================= MOBILE ORDER SUMMARY POPUP ================= */}
      {isMobileSummaryOpen && (
        <>
        <div className="overlay fixed top-0 left-0 w-[100%] h-[100%] bg-[hsla(0,0%,100%,.9)]"></div>
        <div className="nr-mobile-summary-overlay fixed top-[50%] left-[50%] h-[95%] w-[95%] translate-x-[-50%] translate-y-[-50%]" onClick={() => setIsMobileSummaryOpen(false)}>
          <div className="nr-mobile-summary-popup h-[100%]" onClick={(e) => e.stopPropagation()}>
            <OrderSummary
              deliveryPrice={deliveryData?.price ?? 0}
              cart={checkoutCart}
              onCartUpdate={setCheckoutCart}
              onApplyCheckoutCoupon={onApplyCheckoutCoupon}
              onRemoveCheckoutCoupon={onRemoveCheckoutCoupon}
              onApplyCheckoutDiscount={onApplyCheckoutDiscount}
              onRemoveCheckoutDiscount={onRemoveCheckoutDiscount}
              isPopup={true}
              onClose={() => setIsMobileSummaryOpen(false)}
            />
          </div>
        </div>
        </>
      )}

      {/* ================= FOOTER ================= */}
      {/* <footer className="text-xs text-gray-500 text-center py-6 space-y-2">
        <div className="space-x-3">
          <a href="#" className="hover:underline">
            General Terms and Conditions
          </a>
          <a href="#" className="hover:underline">
            Shipping Policies and Rates
          </a>
          <a href="#" className="hover:underline">
            Privacy Policy
          </a>
        </div>
        <div>
          <a href="#" className="hover:underline">
            Exchanges and Returns
          </a>
        </div>
      </footer> */}
    </div>
  );
}
