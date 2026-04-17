import { useEffect, useState, useRef, useMemo } from "react";
import { formatPrice } from "../../utils/formatPrice";

export default function ShippingStep({
  active,
  hasReachedDelivery,
  data,
  isComplete,
  onContinue,
  onEdit,
  isDisabled,
  cart,
  customerData,
  isLoading,
  onFetchShippingOptions,
  shippingOptions = [],
  setShippingOptions,
}) {
  const [availableCountries, setAvailableCountries] = useState([]);
  const [isLoadingCountries, setIsLoadingCountries] = useState(true);

  // Fetch available shipping countries on mount
  useEffect(() => {
    let cancelled = false;
    const fetchCountries = async () => {
      try {
        setIsLoadingCountries(true);
        const res = await fetch(
          `${import.meta.env.VITE_BACKEND_URL}/api/shipping/countries`,
          {
            headers: {
              Accept: "application/json",
              "ngrok-skip-browser-warning": "true",
            },
          }
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!cancelled && json.success && Array.isArray(json.countries)) {
          setAvailableCountries(json.countries);
          console.log("🌍 Available shipping countries loaded:", json.countries.length);
        }
      } catch (err) {
        console.error("❌ Failed to load shipping countries:", err);
      } finally {
        if (!cancelled) setIsLoadingCountries(false);
      }
    };
    fetchCountries();
    return () => { cancelled = true; };
  }, []);

  // Build a dynamic country → ISO2 map from the fetched data
  const countryCodeMap = useMemo(() => {
    const map = {};
    for (const c of availableCountries) {
      map[c.country] = c.country_iso2;
    }
    return map;
  }, [availableCountries]);

  const [form, setForm] = useState({
    country: "",
    firstName: "",
    lastName: "",
    address: "",
    city: "",
    postalCode: "",
    phone: "",
    state: "",
    method: "",
    methodLabel: "",
    shippingOptionId: "",
    price: 0,
  });

  const [isFetchingShipping, setIsFetchingShipping] = useState(false);
  const shippingDebounceRef = useRef(null);
  const lastFetchedPayloadRef = useRef("");

  const normalizedAddress = form.address?.trim() || "";
  const normalizedCity = form.city?.trim() || "";
  const normalizedPostalCode = form.postalCode?.trim() || "";
  const normalizedCountry = form.country?.trim() || "";

  const hasRequiredAddressForQuotes = !!(
    normalizedAddress &&
    normalizedCity &&
    normalizedPostalCode &&
    normalizedCountry
  );


  // Pre-fill when editing OR when customer data is available
  useEffect(() => {
    if (data) {
      setForm(data);
    } else if (customerData) {
      setForm(prev => ({
        ...prev,
        firstName: customerData.firstName || "",
        lastName: customerData.lastName || "",
        phone: customerData.phone || "",
        address: customerData.address || prev.address,
        city: customerData.city || prev.city,
        postalCode: customerData.postalCode || prev.postalCode,
        country: customerData.country || prev.country,
      }));
    }
  }, [data, customerData]);

  const previousAddressKeyRef = useRef("");

  useEffect(() => {
    if (!active) return;

    const addressKey = JSON.stringify({
      address: normalizedAddress,
      city: normalizedCity,
      postalCode: normalizedPostalCode,
      country: normalizedCountry,
    });

    if (!hasRequiredAddressForQuotes) {
      previousAddressKeyRef.current = addressKey;
      return;
    }

    if (
      previousAddressKeyRef.current &&
      previousAddressKeyRef.current !== addressKey
    ) {
      setForm((prev) => ({
        ...prev,
        method: "",
        methodLabel: "",
        shippingOptionId: "",
        price: 0,
      }));
      setShippingOptions?.([]);
      lastFetchedPayloadRef.current = "";
    }

    previousAddressKeyRef.current = addressKey;
  }, [
    active,
    normalizedAddress,
    normalizedCity,
    normalizedPostalCode,
    normalizedCountry,
    hasRequiredAddressForQuotes,
    setShippingOptions,
]);


  useEffect(() => {
    const shouldFetch = active && cart?.id && hasRequiredAddressForQuotes;

    const payload = {
      cartId: cart?.id,
      address: {
        firstName: form.firstName?.trim() || "",
        lastName: form.lastName?.trim() || "",
        address1: normalizedAddress,
        city: normalizedCity,
        postalCode: normalizedPostalCode,
        countryCode: countryCodeMap[normalizedCountry] || "FR",
        stateOrProvince: form.state?.trim() || normalizedCity || "",
        phone: form.phone?.trim() || "",
      },
    };

    const payloadKey = JSON.stringify(payload);

    console.log("🚚 Shipping fetch check:", {
      active,
      cartId: cart?.id,
      normalizedAddress,
      normalizedCity,
      normalizedPostalCode,
      normalizedCountry,
      hasRequiredAddressForQuotes,
      shouldFetch,
      hasFetchFn: !!onFetchShippingOptions,
      payloadKey,
      lastFetchedPayload: lastFetchedPayloadRef.current,
    });

    if (shippingDebounceRef.current) {
      clearTimeout(shippingDebounceRef.current);
    }

    if (!active) {
      console.log("ℹ️ Shipping quotes skipped: delivery step is not active");
      return;
    }

    if (!cart?.id) {
      console.warn("⚠️ Shipping quotes skipped: cart.id missing");
      return;
    }

    if (!onFetchShippingOptions) {
      console.error("❌ onFetchShippingOptions NOT PASSED");
      return;
    }

    if (!hasRequiredAddressForQuotes) {
      console.log("ℹ️ Waiting for required delivery fields before fetching shipping quotes");
      setShippingOptions?.([]);
      lastFetchedPayloadRef.current = "";
      return;
    }

    if (lastFetchedPayloadRef.current === payloadKey) {
      console.log("⏭️ Skipping fetch: same payload already fetched");
      return;
    }

    shippingDebounceRef.current = setTimeout(async () => {
      try {
        setIsFetchingShipping(true);
        console.log("📤 Calling shipping quotes API with payload:", payload);

        const options = await onFetchShippingOptions(payload);
        console.log("📥 Shipping quotes API returned:", options);

        const safeOptions = Array.isArray(options) ? options : [];
        setShippingOptions?.(safeOptions);
        lastFetchedPayloadRef.current = payloadKey;

        console.log("✅ Shipping options stored in component:", safeOptions);

        if (safeOptions.length > 0) {
          const first = safeOptions[0];

          setForm((prev) => {
            if (prev.shippingOptionId) return prev;

            console.log("✅ Auto-selecting first shipping option:", first);
            return {
              ...prev,
              method: first.id,
              methodLabel: first.description,
              shippingOptionId: first.id,
              price: Number(first.cost || 0),
            };
          });
        }
      } catch (err) {
        console.error("❌ Failed to fetch shipping options:", err);
        setShippingOptions?.([]);
        lastFetchedPayloadRef.current = "";
      } finally {
        setIsFetchingShipping(false);
      }
    }, 500);

    return () => {
      if (shippingDebounceRef.current) {
        clearTimeout(shippingDebounceRef.current);
      }
    };
  }, [
    active,
    cart?.id,
    normalizedAddress,
    normalizedCity,
    normalizedPostalCode,
    normalizedCountry,
    form.firstName,
    form.lastName,
    form.phone,
    form.state,
    // form.shippingOptionId,
    hasRequiredAddressForQuotes,
    onFetchShippingOptions,
    setShippingOptions,
  ]);

  // Debug logs
  useEffect(() => {
    console.log("📦 ShippingStep debug:", {
      active,
      hasReachedDelivery,
      isComplete,
      hasData: !!data,
      data,
      form,
      normalizedAddress,
      normalizedCity,
      normalizedPostalCode,
      normalizedCountry,
      shippingOptionsCount: shippingOptions.length,
      shippingOptions,
      hasRequiredAddressForQuotes,
      isFetchingShipping,
    });

    console.log("🧪 Required fields status:", {
      addressReady: !!normalizedAddress,
      cityReady: !!normalizedCity,
      postalReady: !!normalizedPostalCode,
      countryReady: !!normalizedCountry,
    });
  }, [
    active,
    hasReachedDelivery,
    isComplete,
    data,
    form,
    normalizedAddress,
    normalizedCity,
    normalizedPostalCode,
    normalizedCountry,
    shippingOptions,
    hasRequiredAddressForQuotes,
    isFetchingShipping,
  ]);

  // Check if we have data to show summary (similar to ClientStep logic)
  const hasDataToShow = data && (data.address || data.city || data.method);

  // Validation helper
  const isFormValid = () => {
    return (
      form.address?.trim() &&      
      form.city?.trim() &&         
      form.firstName?.trim() &&    
      form.lastName?.trim() &&     
      form.postalCode?.trim() &&   
      form.shippingOptionId        
    );
  };

  // Handle continue with validation
  const handleContinue = () => {
    if (!isFormValid()) {
      alert("Please fill in all required fields and select a delivery method");
      return;
    }
    onContinue(form);
  };

  const shippingOptionTranslations = {
    "Free Delivery": "Free & Secure Delivery | Royal Mail",
    "Standard Shipping": "Livraison standard",
    "Express Shipping": "Livraison express",
    "Insurance": "Garantie de transport",
    // add all other options here
  };

  /* ================= ACTIVE VIEW (when step is active) ================= */
  if (active) {
    return (
      <section className="nr-second-step border-b pb-4">
        <Header step={2} title="Delivery" />

        {/* ADDRESS FORM */}
        <div className="nr-sec-st-cntnt-wr">
          <div className="mt-4 grid grid-cols-2 gap-[8px] text-sm">
            <div className="col-span-2">
              <div className="nr-input-field flex flex-col-reverse w-full nr-select-field">
                <select
                  className="outline-none text-[#333] border rounded px-3 py-2 text-sm pb-0 h-[48px]"
                  value={form.country}
                  onChange={(e) =>
                    setForm({ ...form, country: e.target.value })
                  }
                  disabled={isLoading || isLoadingCountries}
                >
                  <option value="">
                    {isLoadingCountries ? "Loading countries..." : "Select a country"}
                  </option>
                  {availableCountries.map((c) => (
                    <option key={c.country_iso2} value={c.country}>
                      {c.country}
                    </option>
                  ))}
                </select>
                <label className="block nr-input-label text-[14px] text-[#666] top-[unset]">
                  Country
                </label>
              </div>
            </div>
            
            <div className="nr-input-field flex flex-col-reverse col-span-2 sm:col-span-1">
              <input
                placeholder="First name"
                id="firstname"
                className="outline-none text-[#333] border rounded px-3 py-2 text-sm pb-0 h-[48px]"
                value={form.firstName}
                onChange={(e) =>
                  setForm({ ...form, firstName: e.target.value })
                }
                disabled={isLoading}
                required
              />
              <label htmlFor="firstname" className="nr-input-label text-[14px] text-[#666] top-[unset]">
                First name *
              </label>
            </div>
            
            <div className="nr-input-field flex flex-col-reverse col-span-2 sm:col-span-1">
              <input
                placeholder="Name"
                id="name"
                className="outline-none text-[#333] border rounded px-3 py-2 text-sm pb-0 h-[48px]"
                value={form.lastName}
                onChange={(e) =>
                  setForm({ ...form, lastName: e.target.value })
                }
                disabled={isLoading}
                required
              />
              <label htmlFor="name" className="nr-input-label text-[14px] text-[#666] top-[unset]">
                Last name *
              </label>
            </div>
            
            <div className="nr-input-field flex flex-col-reverse col-span-2">
              <input
                placeholder="Address"
                id="address"
                className="outline-none text-[#333] border rounded px-3 py-2 text-sm pb-0 h-[48px]"
                value={form.address}
                onChange={(e) =>
                  setForm({ ...form, address: e.target.value })
                }
                disabled={isLoading}
                required
              />
              <label htmlFor="address" className="nr-input-label text-[14px] text-[#666] top-[unset]">
                Address *
              </label>
            </div>
            
            <div className="nr-input-field flex flex-col-reverse col-span-2 sm:col-span-1">
              <input
                placeholder="City"
                id="city"
                className="outline-none text-[#333] border rounded px-3 py-2 text-sm pb-0 h-[48px]"
                value={form.city}
                onChange={(e) =>
                  setForm({ ...form, city: e.target.value })
                }
                disabled={isLoading}
                required
              />
              <label htmlFor="city" className="nr-input-label text-[14px] text-[#666] top-[unset]">
                City *
              </label>
            </div>
            
            <div className="nr-input-field flex flex-col-reverse col-span-2 sm:col-span-1">
              <input
                placeholder="Postal code"
                id="postal-code"
                className="outline-none text-[#333] border rounded px-3 py-2 text-sm pb-0 h-[48px]"
                value={form.postalCode}
                onChange={(e) =>
                  setForm({ ...form, postalCode: e.target.value })
                }
                disabled={isLoading}
                required
              />
              <label htmlFor="postal-code" className="nr-input-label text-[14px] text-[#666] top-[unset]">
                Postal code *
              </label>
            </div>
            
            <div className="nr-input-field flex flex-col-reverse col-span-2">
              <input
                placeholder="Telephone (if the postman needs to contact you)"
                id="phone"
                className="outline-none text-[#333] border rounded px-3 py-2 text-sm pb-0 h-[48px]"
                value={form.phone}
                onChange={(e) =>
                  setForm({ ...form, phone: e.target.value })
                }
                disabled={isLoading}
              />
              <label htmlFor="phone" className="nr-input-label text-[14px] text-[#666] top-[unset]">
                Telephone (if the postman needs to contact you)
              </label>
              {/* {customerData?.email && !form.phone && (
                <div className="text-xs text-gray-500 mt-1">
                  Consider adding a phone number for delivery updates
                </div>
              )} */}
            </div>
          </div>

          {/* DELIVERY METHODS */}
          <div className="mt-6 text-sm">
            <div className="mb-3 text-[15px] font-[700]">Delivery method</div>

            {!hasRequiredAddressForQuotes ? (
                <div className="text-sm text-gray-600 border rounded p-4 bg-gray-50">
                  Please enter a delivery address to get a shipping cost estimate.
                </div>
              ) : isFetchingShipping ? (
                <div className="text-sm text-gray-600 border rounded p-4 bg-gray-50">
                  Loading shipping costs...
                </div>
              ) : shippingOptions.length > 0 ? (
                shippingOptions.map((option) => {
                const isFreeOption =
                  option.type === "freeshipping" ||
                  /Free & Secure Delivery | Royal Mail/i.test(option.description || "");

                const isInsuranceOption =
                  /insurance|protection against loss|breakage|theft/i.test(option.description || "");

                return (
                  <label
                    key={option.id}
                    className={
                      isInsuranceOption
                        ? "flex items-start justify-between border-2 border rounded p-4 cursor-pointer hover:bg-gray-50 mb-2"
                        : "flex items-center justify-between border rounded p-4 mb-2 cursor-pointer hover:bg-gray-50"
                    }
                  >
                    {isInsuranceOption ? (
                      <div className="items-start gap-2 w-full">
                        <div className="nr-payment-option-outer-wr flex gap-[10px] items-center">
                          <div className="gap-2 w-full flex items-start">
                            <input
                              type="radio"
                              name="delivery"
                              checked={form.shippingOptionId === option.id}
                              onChange={() => {
                                console.log("🟢 User selected shipping option:", option);
                                setForm((prev) => ({
                                  ...prev,
                                  method: option.id,
                                  methodLabel: option.description,
                                  shippingOptionId: option.id,
                                  price: Number(option.cost || 0),
                                }));
                              }}
                              className="h-[25px] w-[25px]"
                              disabled={isLoading || isFetchingShipping}
                            />
                            <div className="flex gap-[10px] justify-between w-full items-center">
                              <p className="nr-payment-option-hed text-[15px] font-[700]">
                                {option.description}
                              </p>
                              <span className="font-[700] text-[15px]">
                                {formatPrice(option.cost, cart?.currency?.code || "GBP")}
                              </span>
                            </div>
                          </div>
                        </div>

                        <p className="nr-payment-option-des text-[13px] py-3">
                          Check this box if you want to add shipping insurance.
                          In case of loss, theft or damage during shipping,
                          we will resend your order for free within 24h.
                        </p>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="delivery"
                            checked={form.shippingOptionId === option.id}
                            onChange={() => {
                              console.log("🟢 User selected shipping option:", option);
                              setForm((prev) => ({
                                ...prev,
                                method: option.id,
                                methodLabel: option.description,
                                shippingOptionId: option.id,
                                price: Number(option.cost || 0),
                              }));
                            }}
                            className="h-[25px] w-[25px]"
                            disabled={isLoading || isFetchingShipping}
                          />
                          <p className="nr-payment-option-hed text-[15px] font-[700]">
                            {isFreeOption ? shippingOptionTranslations["Free Delivery"] : shippingOptionTranslations[option.description] || option.description}
                          </p>
                        </div>
                        <span className="font-medium">
                          {formatPrice(option.cost, cart?.currency?.code || "GBP")}
                        </span>
                      </>
                    )}
                  </label>
                );
              })
            ) : (
              <></>
              // <div className="text-sm text-red-600 border rounded p-4 bg-red-50">
              //   Aucune méthode de livraison n’est disponible pour cette adresse.
              // </div>
            )}
          </div>

          <button
            type="button"
            className="mt-4 bg-[#2fb34a] hover:bg-[#28a745] transition text-white text-sm font-semibold px-6 py-[15px] rounded cursor-pointer w-full sm:w-auto disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={handleContinue}
            disabled={!isFormValid() || isDisabled || isLoading}
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></span>
                Saving the address…
              </span>
            ) : (
              'CONTINUE'
            )}
          </button>
          
          {customerData?.customerId && (
            <div className="mt-3 text-xs text-gray-600">
              <p>The address will be saved in your customer profile.</p>
            </div>
          )}
        </div>
      </section>
    );
  }

  /* ================= COLLAPSED VIEW WITH SUMMARY (when step is completed) ================= */
  // Similar to ClientStep: if not active AND has data, show summary
  if (!active && hasDataToShow) {
    // Format address for display
    const addressParts = [];
    if (data.address) addressParts.push(data.address);
    if (data.city) addressParts.push(data.city);
    if (data.postalCode) addressParts.push(data.postalCode);
    if (data.country && data.country !== "France") addressParts.push(data.country);
    
    const addressLine = addressParts.join(", ");
    
    return (
      <section className="nr-second-step border-b pb-4">
        <Header
          step={2}
          title="Delivery"
          onEdit={onEdit}
          firstName={data.firstName}
          lastName={data.lastName}
          phone={data.phone}
          addressLine={addressLine}
          method={data.method}
          methodLabel={data.methodLabel}
          price={data.price}
          addressId={data.addressId}
          currencyCode={cart?.currency?.code || "GBP"}
        />
      </section>
    );
  }

  /* ================= DEFAULT COLLAPSED VIEW (when step is not reached or no data) ================= */
  return (
    <section className="nr-second-step border-b pb-4">
      <Header step={2} title="Delivery" />
    </section>
  );
}

/* ================= SHARED HEADER ================= */

function Header({ step, title, onEdit, firstName, lastName, phone, addressLine, method, methodLabel, price, addressId, currencyCode = "GBP" }) {
  return (
    <div className="flex items-start justify-between flex-wrap sm:flex-nowrap gap-y-[10px] sm:gap-y-[0]">
      <h2 className="nr-step-hed-wr flex items-center gap-2 font-[700] text-[25px] text-[#333]">
        <span className="flex items-center justify-center rounded-full border-[2px] text-[20px] font-[400] border-[#333] h-[35px] w-[35px]">
          {step}
        </span>
        {title}
      </h2>
      <ul className="nr-step-summry w-[100%] pl-[20px] sm:block hidden">
        <li className="nr-name text-[13px] text-[#333]">
          {firstName} {lastName}
        </li>
        <li className="nr-phone text-[13px] text-[#333]">
          {phone}
        </li>
        <li className="nr-address text-[13px] text-[#333]">
          {addressLine}
        </li>
        <li className="nr-delivery-cntnt text-[13px] text-[#333]">
          {method && (
            <div className="mt-3 pt-3 border-t">
              <div className="text-gray-900 font-medium">
                {methodLabel || method}
              </div>
              <div className="font-semibold text-gray-900 mt-1">
                {formatPrice(price, currencyCode)}
              </div>
            </div>
          )}
            
            {/* Address Save Status */}
            {/* {addressId && (
              <div className="text-xs text-green-600 mt-2 flex items-center gap-1">
                <span>✓</span>
                <span>Address saved to your account</span>
              </div>
            )} */}
        </li>
      </ul>
      {onEdit && (
        <button
          type="button"
          className="ml-[20px] text-[13px] text-gray-700 px-[15px] py-[7px] rounded transition"
          onClick={onEdit}
        >
          Modify
        </button>
      )}
      <ul className="nr-step-summry w-[100%] pl-[20px] sm:hidden block">
        <li className="nr-name text-[13px] text-[#333]">
          {firstName} {lastName}
        </li>
        <li className="nr-phone text-[13px] text-[#333]">
          {phone}
        </li>
        <li className="nr-address text-[13px] text-[#333]">
          {addressLine}
        </li>
        <li className="nr-delivery-cntnt text-[13px] text-[#333]">
          {method && (
            <div className="mt-3 pt-3 border-t">
              <div className="text-gray-900 font-medium">
                {methodLabel || method}
              </div>
              <div className="font-semibold text-gray-900 mt-1">
                {formatPrice(price, currencyCode)}
              </div>
            </div>
          )}
            
            {/* Address Save Status */}
            {/* {addressId && (
              <div className="text-xs text-green-600 mt-2 flex items-center gap-1">
                <span>✓</span>
                <span>Address saved to your account</span>
              </div>
            )} */}
        </li>
      </ul>
    </div>
  );
}

