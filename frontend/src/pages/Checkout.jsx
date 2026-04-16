import { useEffect, useState } from "react";
import { useSearchParams } from 'react-router-dom';
import CheckoutLayout from "../components/Checkout/CheckoutLayout";

// export function ErrorPage() {
//   useEffect(() => {
//     window.location.replace("https://kasweb-c4.mybigcommerce.com/cart.php");
//   }, []);

//   return null;
// }

export default function Checkout() {
  const [cart, setCart] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const handleAirwallexReturn = async () => {
      const isReturn = searchParams.get("airwallex_return") === "success";
      const intentId = searchParams.get("intent_id");

      if (!isReturn || !intentId) return;

      try {
        const res = await fetch(
          `${import.meta.env.VITE_BACKEND_URL}/api/subscription-plans/payment-intents/${intentId}`,
          {
            headers: {
              Accept: "application/json",
              "ngrok-skip-browser-warning": "true",
            },
          }
        );

        const result = await res.json();

        if (!res.ok) {
          throw new Error(result?.error || "Failed to verify payment");
        }

        if (result.status === "SUCCEEDED") {
          sessionStorage.setItem(
            "airwallex_payment_result",
            JSON.stringify({
              status: result.status,
              paymentIntentId: result.id,
            })
          );
        } else {
          sessionStorage.setItem(
            "airwallex_payment_result",
            JSON.stringify({
              status: result.status,
              paymentIntentId: result.id,
            })
          );
        }
      } catch (err) {
        console.error("❌ Airwallex return verification failed:", err);
      }
    };

    handleAirwallexReturn();
  }, [searchParams]);


  const VIP_PRODUCT_ID = 210; // replace with real BC product ID

const refreshCart = async (cartId) => {
  await fetchCartById(cartId);
};

const addVipToCart = async (cartId) => {
  const res = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/cart/add-vip`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'ngrok-skip-browser-warning': 'true'
    },
    body: JSON.stringify({ cartId })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || 'Failed to add VIP product');
  }

  await refreshCart(cartId);
};

const removeVipFromCart = async (cartId) => {
  const res = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/cart/remove-vip`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'ngrok-skip-browser-warning': 'true'
    },
    body: JSON.stringify({ cartId })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || 'Failed to remove VIP product');
  }

  await refreshCart(cartId);
};


  const fetchLatestCart = async (cartId) => {
    const res = await fetch(
      `${import.meta.env.VITE_BACKEND_URL}/api/cart-data?cartId=${cartId}`,
      {
        headers: {
          Accept: 'application/json',
          'ngrok-skip-browser-warning': 'true',
        },
      }
    );

    if (!res.ok) {
      throw new Error('Failed to fetch latest cart');
    }

    return await res.json();
  };
  const createAirwallexCustomer = async (customerData) => {
    const res = await fetch(
      `${import.meta.env.VITE_BACKEND_URL}/api/subscription-plans/billing-customers`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'ngrok-skip-browser-warning': 'true',
        },
        body: JSON.stringify({
          name: `${customerData.firstName || ''} ${customerData.lastName || ''}`.trim(),
          email: customerData.email,
          phone_number: customerData.phone || '',
          type: 'INDIVIDUAL',
        }),
      }
    );

    const result = await res.json();

    if (!res.ok || !result.success) {
      throw new Error(result?.error || 'Failed to create Airwallex customer');
    }

    return result.customer;
  };

  const provisionSubscription = async ({
    orderId,
    cart,
    bigcommerceCustomer,
    airwallexCustomer,
    paymentSourceId,
  }) => {
    const res = await fetch(
      `${import.meta.env.VITE_BACKEND_URL}/api/subscription-plans/subscriptions/provision`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'ngrok-skip-browser-warning': 'true',
        },
        body: JSON.stringify({
          orderId,
          cart,
          bigcommerceCustomer,
          airwallexCustomer,
          paymentSourceId,
        }),
      }
    );

    const result = await res.json();

    console.log('📥 [Checkout.jsx] provision response:', {
      status: res.status,
      ok: res.ok,
      result,
    });

        if (!res.ok) {
      throw new Error(
        typeof result?.error === 'string'
          ? result.error
          : result?.error?.message ||
            result?.message ||
            JSON.stringify(result?.error || result)
      );
    }

    return result;
  };

  const mapSubscriptionCustomer = async ({
    cart,
    bigcommerceCustomer,
    airwallexCustomer,
  }) => {
    const res = await fetch(
      `${import.meta.env.VITE_BACKEND_URL}/api/subscription-customers/map`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'ngrok-skip-browser-warning': 'true',
        },
        body: JSON.stringify({
          cart,
          bigcommerceCustomer,
          airwallexCustomer,
        }),
      }
    );

    const result = await res.json();

    if (!res.ok) {
      throw new Error(result?.error || 'Failed to map subscription customer');
    }

    return result;
  };


  const clearCart = async (cartId) => {
    if (!cartId) {
      throw new Error("Cart ID is required");
    }

    const response = await fetch(
      `${import.meta.env.VITE_BACKEND_URL}/api/cart/${cartId}`,
      {
        method: "DELETE",
        headers: {
          Accept: "application/json",
          "ngrok-skip-browser-warning": "true"
        }
      }
    );

    const responseText = await response.text();
    console.log("🧹 Clear cart response status:", response.status);
    console.log("🧹 Clear cart response body:", responseText);

    let result = {};
    try {
      result = responseText ? JSON.parse(responseText) : {};
    } catch (e) {
      throw new Error(`Invalid clear cart response: ${responseText}`);
    }

    if (!response.ok || !result.success) {
      throw new Error(result.error || "Failed to clear cart");
    }

    return result;
  };

  const handleCartCleared = () => {
    setCart(null);
    sessionStorage.removeItem("airwallex_payment_result");
  };

  // Enhanced customer creation function
  const handleCustomerCreation = async (customerData, cartId) => {
    try {
      console.log('👤 Processing customer creation:', { 
        email: customerData.email, 
        cartId,
        firstName: customerData.firstName,
        lastName: customerData.lastName
      });
      
      let customerId = null;
      let createdCustomerData = null;
      
      // 1. Check if customer exists
      try {
        console.log('🔍 Checking if customer exists...');
        const searchResponse = await fetch(
          `${import.meta.env.VITE_BACKEND_URL}/api/customers/search?email=${customerData.email}`,
          {
            method: 'GET',
            headers: {
              'Accept': 'application/json',
              'ngrok-skip-browser-warning': 'true'
            }
          }
        );
        
        console.log('📊 Search response status:', searchResponse.status);
        
        if (searchResponse.ok) {
          const responseText = await searchResponse.text();
          console.log('📋 Raw search response:', responseText.substring(0, 200));
          
          try {
            const searchResult = JSON.parse(responseText);
            console.log(' Parsed search result:', searchResult);
            
            if (searchResult.exists) {
              // Use existing customer
              customerId = searchResult.customer.id;
              createdCustomerData = searchResult.customer;
              console.log(' Using existing customer:', customerId);
            } else {
              // Create new customer
              console.log('🆕 Creating new customer...');
              const createResponse = await fetch(
                `${import.meta.env.VITE_BACKEND_URL}/api/customers`,
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                  },
                  body: JSON.stringify({
                    email: customerData.email,
                    firstName: customerData.firstName || '',
                    lastName: customerData.lastName || '',
                    phone: customerData.phone || ''
                  })
                }
              );
              
              console.log('📊 Create response status:', createResponse.status);
              
              if (createResponse.ok) {
                const createResult = await createResponse.json();
                console.log(' Create result:', createResult);
                
                if (createResult.success) {
                  customerId = createResult.customer.id;
                  createdCustomerData = createResult.customer;
                  console.log(' Created new customer:', customerId);
                } else {
                  console.warn('⚠️ Customer creation failed:', createResult.error);
                }
              } else {
                const errorText = await createResponse.text();
                console.warn('⚠️ Customer creation API error:', createResponse.status, errorText);
              }
            }
          } catch (parseError) {
            console.error('❌ Failed to parse JSON:', parseError.message);
            console.log('📋 Response that failed to parse:', responseText.substring(0, 500));
          }
        } else {
          const errorText = await searchResponse.text();
          console.warn('⚠️ Customer search failed:', searchResponse.status, errorText.substring(0, 200));
        }
      } catch (networkError) {
        console.error('❌ Network error checking customer:', networkError.message);
      }
      
      // Return customer data for use in shipping step
      return {
        customerId: customerId,
        customerData: createdCustomerData || customerData
      };
      
    } catch (err) {
      console.error('❌ Customer handling error:', err.message);
      return null;
    }
  };

  // Shipping address handler function
  const handleShippingAddress = async (addressData, customerId, clientData) => {
    try {
      console.log('🏠 Saving shipping address for customer:', customerId);
      console.log('📍 Address data:', addressData);
      
      if (!customerId) {
        console.warn('⚠️ No customer ID, skipping address save');
        return null;
      }
      
      const response = await fetch(
        `${import.meta.env.VITE_BACKEND_URL}/api/customer/address`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'ngrok-skip-browser-warning': 'true'
          },
          body: JSON.stringify({
            customerId: customerId,
            addressData: {
              firstName: addressData.firstName || clientData?.firstName || '',
              lastName: addressData.lastName || clientData?.lastName || '',
              address: addressData.address || '',
              city: addressData.city || '',
              postalCode: addressData.postalCode || '',
              country: addressData.country || 'France',
              phone: addressData.phone || clientData?.phone || '',
              state: addressData.state || addressData.city || ''
            }
          })
        }
      );
      
      if (response.ok) {
        const result = await response.json();
        console.log(' Address saved:', result.addressId);
        return result;
      } else {
        const errorText = await response.text();
        console.warn('⚠️ Address save failed:', response.status, errorText);
        return null;
      }
    } catch (err) {
      console.error('❌ Address save error:', err);
      return null;
    }
  };

  // Shipping method handler (optional - for dynamic shipping)
  const fetchShippingOptions = async ({ cartId, address }) => {
    const payload = { cartId, address };

    console.log("🌍 FRONTEND -> /api/shipping/quotes request payload:", payload);

    const response = await fetch(
      `${import.meta.env.VITE_BACKEND_URL}/api/shipping/quotes`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'ngrok-skip-browser-warning': 'true',
        },
        body: JSON.stringify(payload),
      }
    );

    console.log("📡 /api/shipping/quotes response status:", response.status);

    const responseText = await response.text();
    console.log("📡 /api/shipping/quotes raw response:", responseText);

    let result = {};
    try {
      result = responseText ? JSON.parse(responseText) : {};
    } catch (err) {
      console.error("❌ Failed to parse shipping quotes response JSON:", err);
      throw new Error("Invalid shipping quotes response");
    }

    console.log("📦 Parsed shipping quotes response:", result);

    if (!response.ok || !result.success) {
      console.error("❌ Shipping quotes request failed:", result);
      throw new Error(result.error || 'Failed to fetch shipping options');
    }

    console.log(" Returning shipping options to ShippingStep:", result.shippingOptions || []);
    return result.shippingOptions || [];
  };

  const applyCheckoutCoupon = async ({ cartId, couponCode }) => {
    const res = await fetch(
      `${import.meta.env.VITE_BACKEND_URL}/api/checkout/coupons/apply`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'ngrok-skip-browser-warning': 'true',
        },
        body: JSON.stringify({ cartId, couponCode }),
      }
    );

    const result = await res.json();

    if (!res.ok || !result.success) {
      throw new Error(result?.error || 'The coupon code is invalid or cannot be applied');
    }

    return result;
  };

  const removeCheckoutCoupon = async ({ cartId, couponCode }) => {
    const res = await fetch(
      `${import.meta.env.VITE_BACKEND_URL}/api/checkout/coupons/${cartId}/${encodeURIComponent(couponCode)}`,
      {
        method: 'DELETE',
        headers: {
          Accept: 'application/json',
          'ngrok-skip-browser-warning': 'true',
        },
      }
    );

    const result = await res.json();

    if (!res.ok || !result.success) {
      throw new Error(result?.error || 'Failed to remove coupon');
    }

    return result;
  };

  const applyCheckoutDiscount = async ({ cartId, discount }) => {
    const res = await fetch(
      `${import.meta.env.VITE_BACKEND_URL}/api/checkout/discounts/apply`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'ngrok-skip-browser-warning': 'true',
        },
        body: JSON.stringify({ cartId, discount }),
      }
    );

    const result = await res.json();

    if (!res.ok || !result.success) {
      throw new Error(result?.error || 'Failed to apply discount');
    }

    return result;
  };

  const removeCheckoutDiscount = async (cartId) => {
    const res = await fetch(
      `${import.meta.env.VITE_BACKEND_URL}/api/checkout/discounts/${cartId}`,
      {
        method: 'DELETE',
        headers: {
          Accept: 'application/json',
          'ngrok-skip-browser-warning': 'true',
        },
      }
    );

    const result = await res.json();

    if (!res.ok || !result.success) {
      throw new Error(result?.error || 'Failed to remove discount');
    }

    return result;
  };

  useEffect(() => {
    const initializeCart = async () => {
      try {
        const cartId = searchParams.get('cartId');
        const cartDataParam = searchParams.get('cartData');
        const errorParam = searchParams.get('error');

        console.log('📥 URL Parameters:', { cartId, cartDataParam, errorParam });

        if (errorParam) {
          setError(`Checkout error: ${errorParam}`);
          setLoading(false);
          return;
        }

        const persistedCartId = sessionStorage.getItem("nh_cart_id");
        const resolvedCartId = cartId || persistedCartId;

        if (resolvedCartId) {
          await fetchCartById(resolvedCartId);
        } else if (cartDataParam) {
          try {
            const decodedCartData = JSON.parse(decodeURIComponent(cartDataParam));
            console.log('📦 Decoded cart data:', decodedCartData);

            const normalizedCart = {
              ...decodedCartData,
              lineItems: decodedCartData.lineItems || {
                physicalItems: [],
                digitalItems: []
              },
              cartAmount: decodedCartData.cartAmount || 0,
              currency: decodedCartData.currency || { code: 'EUR' },
              customerId: decodedCartData.customerId || 0,
              customerEmail: decodedCartData.customerEmail || ''
            };

            setCart(normalizedCart);
            setLoading(false);
          } catch (parseError) {
            console.error('❌ Failed to parse cart data:', parseError);
            setError('Invalid cart data format');
            setLoading(false);
          }
        } else {
          setError('Invalid checkout link');
          setLoading(false);
        }
      } catch (err) {
        console.error('❌ Initialization error:', err);
        setError('Failed to load checkout');
        setLoading(false);
      }
    };

    initializeCart();
  }, [searchParams]);



  const fetchCartById = async (cartId) => {
  try {
    console.log('🔍 Fetching cart from backend:', cartId);

    const response = await fetch(
      `${import.meta.env.VITE_BACKEND_URL}/api/cart-data?cartId=${cartId}`,
      {
        headers: {
          Accept: 'application/json',
          'ngrok-skip-browser-warning': 'true',
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch cart: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log('📦 Cart data:', data);

    setCart(data);
    sessionStorage.setItem("nh_cart_id", cartId);
    setLoading(false);
  } catch (err) {
    console.error('❌ Cart fetch error:', err);
    setError('Failed to load cart');
    setLoading(false);
  }
};

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Chargement de votre panier…</p>
        </div>
      </div>
    );
  }

  // if (error) {
  //   return (
  //     <div className="min-h-screen flex items-center justify-center">
  //       <div className="max-w-md p-6 bg-red-50 border border-red-200 rounded-lg text-center">
  //         <h2 className="text-xl font-semibold text-red-800 mb-2">Checkout Error</h2>
  //         <p className="text-red-600 mb-4">{error}</p>
  //         <a 
  //           href="https://kasweb-c4.mybigcommerce.com/cart.php" 
  //           className="inline-block px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
  //         >
  //           Return to Cart
  //         </a>
  //       </div>
  //     </div>
  //   );
  // }
  if (error) {
    window.location.replace("https://kasweb-c4.mybigcommerce.com/cart.php");
    return null;
  }

  console.log("Cart Data: ",cart);

  return (
    <CheckoutLayout 
      cart={cart} 
      onCustomerCreate={handleCustomerCreation}
      onShippingAddress={handleShippingAddress}
      onFetchShippingOptions={fetchShippingOptions}
      onAddVipToCart={addVipToCart}
      onRemoveVipFromCart={removeVipFromCart}
      onFetchLatestCart={fetchLatestCart}
      onCreateAirwallexCustomer={createAirwallexCustomer}
      onMapSubscriptionCustomer={mapSubscriptionCustomer}
      onProvisionSubscription={provisionSubscription}
      clearCart={clearCart}
      onCartCleared={handleCartCleared}
      onApplyCheckoutCoupon={applyCheckoutCoupon}
      onRemoveCheckoutCoupon={removeCheckoutCoupon}
      onApplyCheckoutDiscount={applyCheckoutDiscount}
      onRemoveCheckoutDiscount={removeCheckoutDiscount}
    />
  );
}