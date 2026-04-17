import { useMemo, useState } from "react";

export default function OrderSummary({
  cart,
  deliveryPrice = 1.99,
  hiddenProductIds = [210],
  onCartUpdate,
  onApplyCheckoutCoupon,
  onRemoveCheckoutCoupon,
  onApplyCheckoutDiscount,
  onRemoveCheckoutDiscount,
  isPopup = false,
  onClose,
}) {
  const defaultCart = {
    lineItems: {
      physicalItems: [
        {
          id: "1",
          name: "LED Projector HY300 – Android 11 – WiFi – Bluetooth",
          quantity: 1,
          extendedSalePrice: 43.98,
          imageUrl: "/product-placeholder.png",
        },
      ],
      digitalItems: [],
    },
    cartAmount: 43.98,
    discountAmount: 0,
    taxAmount: 0,
    currency: { code: "EUR" },
    coupons: [],
    discounts: [],
  };

  const displayCart = cart || defaultCart;

  const physicalItems = Array.isArray(displayCart.lineItems?.physicalItems)
    ? displayCart.lineItems.physicalItems
    : [];

  const digitalItems = Array.isArray(displayCart.lineItems?.digitalItems)
    ? displayCart.lineItems.digitalItems
    : [];

  const allItems = [...physicalItems, ...digitalItems];

  const items = allItems.filter(
    (item) => !hiddenProductIds.includes(Number(item.product_id))
  );

  // const subtotal = Number(displayCart.cartAmount || 0);
  const subtotal = Number(displayCart.cartAmount || 0) + Number(displayCart.discountAmount || 0);
  const discount = Number(displayCart.discountAmount || 0);
  const tax = Number(displayCart.taxAmount || 0);
  // const total = subtotal + Number(deliveryPrice || 0) - discount + tax;
  // const total = subtotal + Number(deliveryPrice || 0) + tax;
  const total = subtotal - discount + Number(deliveryPrice || 0) + Number(tax || 0)
  const currency = displayCart.currency?.code || "EUR";

  const coupons = Array.isArray(displayCart.coupons) ? displayCart.coupons : [];
  const discounts = Array.isArray(displayCart.discounts) ? displayCart.discounts : [];

  const [couponCode, setCouponCode] = useState("");
  const [couponLoading, setCouponLoading] = useState(false);
  const [discountLoading, setDiscountLoading] = useState(false);
  const [couponError, setCouponError] = useState("");
  const [couponSuccess, setCouponSuccess] = useState("");

  const activeCouponCode = useMemo(() => {
    const first = coupons[0];
    return first?.code || first?.coupon_code || "";
  }, [coupons]);

  const formatPrice = (value) => `€${Number(value || 0).toFixed(2)}`;

  const handleApplyCoupon = async () => {
    if (!displayCart?.id || !couponCode.trim() || !onApplyCheckoutCoupon) return;

    setCouponLoading(true);
    setCouponError("");
    setCouponSuccess("");

    try {
      console.log("[OrderSummary] Applying coupon", {
        cartId: displayCart.id,
        couponCode: couponCode.trim(),
      });

      const result = await onApplyCheckoutCoupon({
        cartId: displayCart.id,
        couponCode: couponCode.trim(),
      });

      console.log("[OrderSummary] Apply coupon response", result);

      if (result?.cart) {
        onCartUpdate?.(result.cart);
      }

      setCouponSuccess("Coupon applied successfully");
      setCouponCode("");
    } catch (err) {
      console.error("[OrderSummary] Apply coupon failed", err);
      setCouponError(err.message || "The coupon code is invalid or cannot be applied");
    } finally {
      setCouponLoading(false);
    }
  };

  const handleApplyDiscount = async () => {
    if (!displayCart?.id || !onApplyCheckoutDiscount) return;

    setDiscountLoading(true);
    setCouponError("");
    setCouponSuccess("");

    try {
      const discountPayload = {
        name: "Checkout Discount",
        description: "Manual checkout discount",
        cart_id: displayCart.id,
      };

      console.log("[OrderSummary] Applying checkout discount", {
        cartId: displayCart.id,
        discount: discountPayload,
      });

      const result = await onApplyCheckoutDiscount({
        cartId: displayCart.id,
        discount: discountPayload,
      });

      console.log("[OrderSummary] Apply discount response", result);

      if (result?.cart) {
        onCartUpdate?.(result.cart);
      }

      setCouponSuccess("Discount applied successfully");
    } catch (err) {
      console.error("[OrderSummary] Apply discount failed", err);
      setCouponError(err.message || "The discount cannot be applied");
    } finally {
      setDiscountLoading(false);
    }
  };

  const handleRemoveCoupon = async (code) => {
    if (!displayCart?.id || !code || !onRemoveCheckoutCoupon) return;

    setCouponLoading(true);
    setCouponError("");
    setCouponSuccess("");

    try {
      console.log("[OrderSummary] Removing coupon", {
        cartId: displayCart.id,
        couponCode: code,
      });

      const result = await onRemoveCheckoutCoupon({
        cartId: displayCart.id,
        couponCode: code,
      });

      console.log("[OrderSummary] Remove coupon response", result);

      if (result?.cart) {
        onCartUpdate?.(result.cart);
      }

      setCouponSuccess("Coupon removed successfully");
    } catch (err) {
      console.error("[OrderSummary] Remove coupon failed", err);
      setCouponError(err.message || "Failed to remove coupon");
    } finally {
      setCouponLoading(false);
    }
  };

  const handleRemoveDiscount = async () => {
    if (!displayCart?.id || !onRemoveCheckoutDiscount) return;

    setDiscountLoading(true);
    setCouponError("");
    setCouponSuccess("");

    try {
      console.log("[OrderSummary] Removing checkout discount", {
        cartId: displayCart.id,
      });

      const result = await onRemoveCheckoutDiscount(displayCart.id);

      console.log("[OrderSummary] Remove discount response", result);

      if (result?.cart) {
        onCartUpdate?.(result.cart);
      }

      setCouponSuccess("Discount removed successfully");
    } catch (err) {
      console.error("[OrderSummary] Remove discount failed", err);
      setCouponError(err.message || "Failed to remove discount");
    } finally {
      setDiscountLoading(false);
    }
  };

  return (
    // <div className={`bg-white border rounded text-sm ${isPopup ? '' : 'max-[991px]:block lg:block'}`}>
    <div className={`bg-white border rounded text-sm ${isPopup ? '' : ''}`}>
      <div className="nr-right-prt-hed-wr border-b flex justify-between items-center p-[19.5px] mb-[19.5px]">
        {isPopup ? (
          <>
            <button
              onClick={() => {
                console.log("[OrderSummary] Redirecting user to cart");
                window.location.href = "https://kasweb-c4.mybigcommerce.com/cart.php";
              }}
              className="text-[#476bef] hover:text-[#002fe1] text-sm w-[33.3%] text-start"
            >
              Edit cart
            </button>
            <h3 className="font-semibold text-gray-900 w-[33.3%] text-center text-[14px]">Order summary</h3>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-800 text-xl font-bold leading-none w-[33.3%] flex justify-end"
              aria-label="Fermer"
            >
              ✕
            </button>
          </>
        ) : (
          <>
            <h3 className="font-semibold text-gray-900">Order summary</h3>
            <button
              onClick={() => {
                console.log("[OrderSummary] Redirecting user to cart");
                window.location.href = "https://kasweb-c4.mybigcommerce.com/cart.php";
              }}
              className="text-[#476bef] hover:text-[#002fe1]"
            >
              Edit cart
            </button>
          </>
        )}
      </div>

      <div className="nr-rght-btm-prt">
        {items.length === 0 ? (
          <div className="flex gap-3 mb-4 px-[19.5px]">
            <img
              src="/product-placeholder.png"
              alt="Product"
              className="w-16 h-16 border rounded object-cover"
            />
            <div className="flex-1">
              <div className="font-medium text-gray-900 leading-snug">
                Your cart is empty
              </div>
              <div className="text-xs text-gray-600 mt-1">Quantity: 0</div>
            </div>
            <div className="font-semibold text-gray-900">€0.00</div>
          </div>
        ) : (
          items.map((item, index) => {
            // const itemPrice = Number(item.extendedSalePrice || 0);
            const quantity = Number(item.quantity || 1);
            const itemPrice = Number(
              item.discountedAmount ??
              item.extendedDiscountedPrice ??
              item.extendedSalePrice ??
              (Number(item.sale_price || 0) * quantity) ??
              (Number(item.list_price || 0) * quantity) ??
              0
            );
            const originalPrice = Number(
              item.extendedListPrice ??
              (Number(item.list_price || 0) * quantity) ??
              0
            );
            const hasDiscount = originalPrice > 0 && originalPrice > itemPrice;

            return (
              <div
                key={item.id || index}
                className={`flex gap-3 p-[19.5px] pt-0 ${isPopup ? 'flex-col' : ''}`}
              >
                <div className={`flex gap-3  ${isPopup ? 'items-start' : 'items-center'}`}>
                  <img
                    src={item.imageUrl || "/product-placeholder.png"}
                    alt={item.name || "Product"}
                    className={`border rounded object-cover ${isPopup ? 'w-[70px] h-[70px]' : 'w-16 h-16'}`}
                  />

                  <div className="flex-1">
                    <div className="font-semibold text-gray-900">
                      {isPopup && `${quantity} x `}{item.name || "Unnamed product"}
                    </div>
                    {!isPopup && (
                      <div className="text-xs text-gray-600 mt-1">
                        Quantity: {quantity}
                      </div>
                    )}
                    {isPopup && item.options && item.options.length > 0 && (
                      <div className="text-xs text-gray-500 mt-1">
                        {item.options.map((opt, i) => (
                          <div key={i}>{opt.name} {opt.value}</div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="font-semibold text-gray-900 text-right whitespace-nowrap">
                    <div>{formatPrice(itemPrice)}</div>
                    {isPopup && hasDiscount && (
                      <div className="text-xs text-gray-400 line-through">{formatPrice(originalPrice)}</div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}

        {isPopup && (
          <div className="flex items-center gap-2 px-[19.5px] pb-[8px] text-sm text-gray-600">
            <span>{items.length} articles</span>
            <span className="font-semibold text-gray-900">| {formatPrice(total)}</span>
          </div>
        )}

        <div className="px-[19.5px] pb-[19.5px]">
          <label className="block text-xs text-gray-600 mb-2">
            Promo code (optional)
          </label>

          <div className="flex gap-2 flex-wrap">
            <input
              type="text"
              placeholder="Enter your code"
              value={couponCode}
              onChange={(e) => setCouponCode(e.target.value)}
              className="flex-1 border rounded px-3 py-2 text-sm"
              disabled={couponLoading}
            />
            <button
              type="button"
              onClick={handleApplyCoupon}
              disabled={couponLoading || !couponCode.trim()}
              className="border rounded px-4 py-2 text-xs font-medium hover:bg-gray-100 disabled:opacity-50"
            >
              {couponLoading ? "Applying…" : "Apply"}
            </button>
          </div>

          {/* {onApplyCheckoutDiscount && (
            <div className="mt-3">
              <button
                type="button"
                onClick={handleApplyDiscount}
                disabled={discountLoading}
                className="border rounded px-4 py-2 text-xs font-medium hover:bg-gray-100 disabled:opacity-50"
              >
                {discountLoading ? "Applying discount..." : "Apply Offer"}
              </button>
            </div>
          )} */}

          {couponError && (
            <div className="mt-2 text-xs">{couponError}</div>
          )}

          {couponSuccess && (
            <div className="mt-2 text-xs text-green-600">{couponSuccess}</div>
          )}

          {activeCouponCode && (
            <div className="mt-3 flex items-center justify-between rounded border border-green-200 bg-green-50 px-3 py-2">
              <div className="text-xs">
                Applied coupon: <span className="font-semibold">{activeCouponCode}</span>
              </div>
              <button
                type="button"
                onClick={() => handleRemoveCoupon(activeCouponCode)}
                disabled={couponLoading}
                className="text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
              >
                Remove
              </button>
            </div>
          )}
        </div>

        <div className="space-y-2 text-gray-700 p-[19.5px] border-t">
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span>{formatPrice(subtotal)}</span>
          </div>

          {coupons.length > 0 &&
            coupons.map((coupon, index) => (
              <div
                key={`${coupon.code || coupon.coupon_code || "coupon"}-${index}`}
                className="flex justify-between text-green-600"
              >
                <span>Coupon {coupon.code || coupon.coupon_code || ""}</span>
                <span>
                  -{formatPrice(coupon.discounted_amount || coupon.amount || 0)}
                </span>
              </div>
            ))}

          {discounts.length > 0 &&
            discounts.map((entry, index) => (
              <div
                key={`discount-${index}`}
                className="flex justify-between text-green-600"
              >
                <span>{entry.name || entry.description || "Discount"}</span>
                <div className="flex items-center gap-3">
                  <span>-{formatPrice(entry.discounted_amount || entry.amount || 0)}</span>
                  {onRemoveCheckoutDiscount && (
                    <button
                      type="button"
                      onClick={handleRemoveDiscount}
                      disabled={discountLoading}
                      className="text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
                    >
                      {discountLoading ? "Removing..." : "Remove"}
                    </button>
                  )}
                </div>
              </div>
            ))}

          <div className="flex justify-between font-medium">
            <span>Discount</span>
            <span>-{formatPrice(discount)}</span>
          </div>

          <div className="flex justify-between">
            <span>Delivery</span>
            <span>{formatPrice(deliveryPrice)}</span>
          </div>

          {tax > 0 && (
            <div className="flex justify-between">
              <span>Tax</span>
              <span>{formatPrice(tax)}</span>
            </div>
          )}
        </div>

        <div className="nr-total-prt p-[19.5px] border-t">
          <div className="flex justify-between items-center text-base font-semibold text-gray-900">
            <span>Total ({currency})</span>
            <span className="text-[30px]">{formatPrice(total)}</span>
          </div>

          <div className="text-xs text-gray-500 mt-1">
            VAT included{subtotal > 0 ? " (estimated)" : ""}
          </div>
        </div>

        {isPopup && (
          <div className="p-[19.5px] pt-0">
            <button
              type="button"
              onClick={onClose}
              className="w-full py-[14px] bg-[#2bb04a] hover:bg-[#249c3f] text-white font-semibold text-sm uppercase rounded transition-colors"
            >
              Close summary
            </button>
          </div>
        )}
      </div>
    </div>
  );
}