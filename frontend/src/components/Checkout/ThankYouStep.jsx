import React from "react";

const formatPrice = (value, currency = "EUR") => {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(Number(value || 0));
  } catch {
    return `${Number(value || 0).toFixed(2)} ${currency}`;
  }
};


const getItemImage = (item) => {
  return (
    item?.imageUrl ||
    item?.image_url ||
    item?.image ||
    item?.thumbnail ||
    "https://placehold.co/80x80?text=Image"
  );
};

const ThankYouStep = ({
  order,
  customer,
  cart,
  onContinueShopping,
}) => {
  const firstName =
    customer?.firstName ||
    customer?.first_name ||
    customer?.billingAddress?.first_name ||
    "Customer";

  const orderId = order?.orderId || order?.id || "-";
  const currency = cart?.currency?.code || order?.currency_code || "EUR";

  const physicalItems = cart?.lineItems?.physicalItems || [];
  const digitalItems = cart?.lineItems?.digitalItems || [];
  const hiddenProductIds = [268];
  const allItems = [...physicalItems, ...digitalItems].filter(
    (item) => !hiddenProductIds.includes(Number(item.product_id))
  );
  // const allItems = [...physicalItems, ...digitalItems];
  const discountAmount = Number(cart?.discountAmount || order?.discount_amount || 0);

  let subtotalPreDiscount = Number(cart?.baseAmount || 0);
  if (!subtotalPreDiscount && cart?.cartAmount) {
    subtotalPreDiscount = Number(cart.cartAmount) + discountAmount;
  }
  if (!subtotalPreDiscount && order?.subtotal_inc_tax) {
    subtotalPreDiscount = Number(order.subtotal_inc_tax);
  }

  const shipping =
    Number(cart?.shippingAmount || 0) ||
    Number(order?.shipping_cost_inc_tax || 0) ||
    0;

  const handling =
    Number(order?.handling_cost_inc_tax || 0) ||
    Number(cart?.handlingAmount || 0) ||
    0;

  const total =
    Number(cart?.cartAmount || 0) ||
    Number(order?.total_inc_tax || 0) ||
    0;

  return (
    <div className="nr-thanks min-h-screen bg-[#fff]">
      <div className="mx-auto max-w-[1200px] ">
        <div className="flex justify-center py-[10px]">
          <img
            src="../images/hike-summit.webp"
            alt="Store logo"
            className="h-14 w-auto object-contain"
          />
        </div>

        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1fr_400px] px-[24px] bg-white py-[50px]">
          <div className="min-w-0 text-left rounded-[20px] py-[40px] h-[max-content]">
            <h1 className="mb-[40px] text-[30px] font-normal leading-none text-black">
              Thank you {firstName}!
            </h1>

            <p className="mb-[20px] text-[18px] leading-snug text-black">
              Your order number is <span className="font-medium">{orderId}</span>
            </p>

            <div className="border-b border-[#eee] space-y-8 text-[16px] leading-[1.45] text-[#333] pb-[20px]">
              <p>
                An email will be sent containing information about your purchase.
                If you have any questions about your purchase, email us at{" "}
                <span className="break-all">
                  help@hike-summit.com
                </span>{" "}
                or call us at +44 20 3885 0312.
              </p>

              <p>
                You can download your digital purchases by clicking the links on
                this page, or by logging into your account at any time. There is
                also a download link in your confirmation email, which should be
                arriving shortly.
              </p>
            </div>

            <button
              type="button"
              onClick={onContinueShopping}
              className="inline-flex items-center rounded-[10px] border border-[#d6d6d6] bg-white px-8 py-[15px] mt-[20px] text-[16px] font-normal text-black shadow-sm transition hover:bg-[#fafafa]"
            >
              Continue Shopping »
            </button>
          </div>

          <aside className="self-start rounded-[14px] border border-[#d9d9d9] bg-white overflow-hidden">
            <div className="flex items-center justify-between border-b border-[#e5e5e5] px-6 py-5">
              <h2 className="text-[20px] font-normal text-black">
                Order Summary
              </h2>

              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-2 text-[22px] text-black hover:opacity-70"
              >
                <span className="text-[20px]">🖨️</span>
                Print
              </button>
            </div>

            <div className="border-b border-[#e5e5e5] px-6 py-5">
              <div className="mb-5 text-[20px] text-black">
                {allItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0)} Items
              </div>

              <div className="space-y-6">
                {allItems.map((item, index) => (
                  <div key={`${item.id || item.product_id}-${index}`} className="flex gap-4">
                    <img
                      src={getItemImage(item)}
                      alt={item.name || "Product"}
                      className="h-20 w-20 shrink-0 object-cover"
                    />

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="truncate text-[16px] font-[600] leading-tight text-black">
                            {item.quantity} x {item.name}
                          </div>

                          {item.options?.map((opt, i) => (
                            <div
                              key={`${opt.name}-${i}`}
                              className="text-[14px] leading-snug text-[#666]"
                            >
                              {opt.name} {opt.value}
                            </div>
                          ))}

                          {digitalItems.some(
                            (d) =>
                              (d.id || d.product_id) === (item.id || item.product_id)
                          ) && (
                              <div className="text-[14px] text-[#3b82f6]">
                                Digital Item
                              </div>
                            )}
                        </div>

                        <div className="whitespace-nowrap text-[16px] text-black">
                          {formatPrice(
                            Number(item.extendedSalePrice || item.listPrice * item.quantity || 0),
                            currency
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-4 border-b border-[#e5e5e5] px-6 py-6 text-[16px] text-black">
              <div className="flex items-center justify-between">
                <span>Subtotal</span>
                <span>{formatPrice(subtotalPreDiscount, currency)}</span>
              </div>

              {discountAmount > 0 && (
                <div className="flex items-center justify-between">
                  <span>Discount</span>
                  <span>-{formatPrice(discountAmount, currency)}</span>
                </div>
              )}

              <div className="flex items-center justify-between">
                <span>Shipping</span>
                <span>{shipping === 0 ? "Free" : formatPrice(shipping, currency)}</span>
              </div>

              <div className="flex items-center justify-between">
                <span>Handling</span>
                <span>{formatPrice(handling, currency)}</span>
              </div>
            </div>

            <div className="px-6 py-6">
              <div className="flex items-center justify-between text-[16px] font-medium text-black">
                <span>Total ({currency})</span>
                <span className="text-[25px] font-[600]">{formatPrice(total, currency)}</span>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};

export default ThankYouStep;