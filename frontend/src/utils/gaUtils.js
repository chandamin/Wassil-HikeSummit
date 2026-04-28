// src/utils/gaUtils.js

export const formatVariant = (options = []) => {
  const values = options.filter(opt => opt?.value).map(opt => opt.value);
  return values.length > 0 ? values.join(", ") : "Defaut";
};

export const normalizeAddress = (addressData) => {
  if (!addressData) return {};
  return {
    first_name: addressData.firstName || addressData.first_name || "",
    last_name: addressData.lastName || addressData.last_name || "",
    street: addressData.address || addressData.street_1 || "",
    city: addressData.city || "",
    postal_code: addressData.postalCode || addressData.zip || "",
    country: addressData.country || "FR"
  };
};

export const determineIsNewCustomer = (bcCustomer, customerId) => {
  if (!customerId || customerId === 0) return "TRUE";
  if (!bcCustomer?.id) return "TRUE";
  return (bcCustomer.orderCount === 0 || bcCustomer.orderCount === undefined) ? "TRUE" : "FALSE";
};

export const determinePastOrders = (bcCustomer) => {
  if (!bcCustomer?.id) return "0";
  return String(bcCustomer.orderCount || 0);
};

export const buildGAItems = (orderProducts, cartLineItems = {}) => {
  const productsArray = Array.isArray(orderProducts) ? orderProducts : [];
  const allCartItems = [
    ...(cartLineItems?.physicalItems || []),
    ...(cartLineItems?.digitalItems || [])
  ];

  return productsArray.map(orderProduct => {
    const cartItem = allCartItems.find(
      i => Number(i.product_id) === Number(orderProduct.product_id)
    );

    return {
      item_name: cartItem?.name || orderProduct.name || "Unknown",
      item_id: cartItem?.sku || String(orderProduct.product_id || orderProduct.sku || ""),
      price: String(orderProduct.price_inc_tax || 0),
      price_tax_exc: String(orderProduct.price_ex_tax || 0),
      item_brand: cartItem?.brand || "Autre",
      item_category: cartItem?.category || "Vetements",
      item_category2: cartItem?.subcategory || "Femmes",
      item_variant: formatVariant(cartItem?.options || []),
      quantity: String(orderProduct.quantity || 1)
    };
  });
};

export const buildGAPayload = ({ 
  order, orderId, cart, clientData, deliveryData, bigcommerceCustomer, customerId 
}) => {
  const productsArray = Array.isArray(order?.products) ? order.products : [];
  const items = buildGAItems(productsArray, cart?.lineItems);
  
  const totalInc = Number(order?.total_inc_tax || 0);
  const totalExc = Number(order?.total_ex_tax || 0);
  const productsTotal = productsArray.reduce((sum, p) => 
    sum + ((p.price_ex_tax || 0) * (p.quantity || 1)), 0);

  return {
    event: "purchase_checkout2",
    ecommerce: {
      currency: cart?.currency?.code || "EUR",
      transaction_id: String(orderId),
      value: String(totalInc),
      total_tax_inc: String(totalInc),
      total_tax_exc: String(totalExc),
      tax: String((totalInc - totalExc).toFixed(2)),
      shipping: String(order?.shipping_cost_inc_tax || 0),
      shipping_tax_exc: String(order?.shipping_cost_ex_tax || 0),
      discounts: String(order?.discount_amount || 0),
      discounts_tax_exc: "0",
      products: String(productsTotal),
      products_tax_exc: String(productsTotal),
      items
    },
    customer: {
      email: clientData?.email || order?.billing_address?.email || "",
      phone_number: clientData?.phone || deliveryData?.phone || "",
      address: normalizeAddress(deliveryData || order?.shipping_address),
      new: determineIsNewCustomer(bigcommerceCustomer, customerId),
      past_orders: determinePastOrders(bigcommerceCustomer)
    }
  };
};

export const fireGAEvent = (payload) => {
  try {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(payload);
    console.debug(" GA event fired:", payload.ecommerce?.transaction_id);
    
    if (navigator.sendBeacon) {
      const backup = {
        event: "purchase_backup",
        transaction_id: payload.ecommerce?.transaction_id,
        value: payload.ecommerce?.value,
        timestamp: Date.now()
      };
      navigator.sendBeacon(
        "/api/ga-ping",
        new Blob([JSON.stringify(backup)], { type: "application/json" })
      );
    }
  } catch (err) {
    console.warn("⚠️ GA event failed (non-blocking):", err.message);
  }
};