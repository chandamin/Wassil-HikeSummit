import { useState, useEffect } from "react";

export default function ClientStep({
  active,
  data,
  onContinue,
  onEdit,
  isDisabled,
  cart,
}) {
  const [form, setForm] = useState(() => data ?? {
    firstName: "",
    lastName: "",
    email: "",
  });
  
  const [loading, setLoading] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [isValidating, setIsValidating] = useState(false);

  // Pre-fill when coming back to edit
  useEffect(() => {
    if (data) {
      setForm(data);
    }
  }, [data]);

  // Basic email validation
  const validateEmail = (email) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  };

  // Check email in real-time as user types
  const handleEmailChange = (e) => {
    const newEmail = e.target.value;
    setForm({ ...form, email: newEmail });
    
    // Clear error if email is being corrected
    if (emailError && validateEmail(newEmail)) {
      setEmailError("");
    }
  };

  // Validate before continuing
  const handleContinue = async () => {
    // Validate required fields
    if (!form.email) {
      setEmailError("Email is required");
      return;
    }
    
    if (!validateEmail(form.email)) {
      setEmailError("Please enter a valid email address");
      return;
    }
    
    // Set loading state
    setLoading(true);
    setIsValidating(true);
    
    try {
      // Small delay to show loading state (optional)
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Check if email exists in BigCommerce
      const emailCheck = await checkEmailExists(form.email);
      
      // if (!emailCheck.valid) {
      //   setEmailError(emailCheck.message);
      //   setLoading(false);
      //   setIsValidating(false);
      //   return;
      // }

      const fullName = `${form.firstName} ${form.lastName}`.trim();
      const awCustomer = await createOrFindAirwallexCustomer(form.email, fullName);

      if (awCustomer) {
        // Notify parent via custom event (since no prop exists yet)
        window.dispatchEvent(new CustomEvent('airwallexCustomerReady', { 
          detail: { customer: awCustomer } 
        }));
      }
      
      // All validations passed, continue to next step
      onContinue(form);
      
    } catch (error) {
      console.error('Validation error:', error);
      setEmailError("An error occurred. Please try again.");
    } finally {
      setLoading(false);
      setIsValidating(false);
    }
  };

  // Check if email exists in BigCommerce
  // const checkEmailExists = async (email) => {
  //   try {
  //     const response = await fetch(
  //       // `${import.meta.env.VITE_BACKEND_URL}/api/customers/search?email=${encodeURIComponent(email)}`
        
  //       `${import.meta.env.VITE_BACKEND_URL}/api/customers/search?email=${encodeURIComponent(email)}`,
  //         {
  //           method: 'GET',
  //           headers: {
  //             'Accept': 'application/json',
  //             'ngrok-skip-browser-warning': 'true'
  //           }
  //         }
  //     );
      
  //     if (response.ok) {
  //       const result = await response.json();
        
  //       if (result.exists) {
  //         return {
  //           valid: true,
  //           exists: !!result.exists,
  //           customer: result.customer || null,
  //           // message: "An account already exists with this email. Please use a different email or log in."
  //         };
  //       }
        
  //       return { valid: true, exists: false };
  //     }
      
  //     // If API fails, still allow checkout but warn user
  //     console.warn('Email check API failed, continuing anyway');
  //     return { valid: true };
      
  //   } catch (error) {
  //     console.error('Email check error:', error);
  //     // Don't block checkout if API is down
  //     return { valid: true };
  //   }
  // };
  const checkEmailExists = async (email) => {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_BACKEND_URL}/api/customers/search?email=${encodeURIComponent(email)}`,
        {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            'ngrok-skip-browser-warning': 'true',
          },
        }
      );

      if (response.ok) {
        const result = await response.json();
        console.log('customer search result:', result);

        return {
          valid: true,
          exists: !!result.exists,
          customer: result.customer || null,
        };
      }

      console.warn('Email check API failed, continuing anyway');
      return { valid: true, exists: false };
    } catch (error) {
      console.error('Email check error:', error);
      return { valid: true, exists: false };
    }
  };

  const createOrFindAirwallexCustomer = async (email, name) => {
  try {
    const response = await fetch(
      `${import.meta.env.VITE_BACKEND_URL}/api/subscription-plans/billing-customers`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "ngrok-skip-browser-warning": "true",
        },
        body: JSON.stringify({
          email: email.toLowerCase().trim(),
          name: name?.trim() || undefined,
          type: "INDIVIDUAL",
        }),
      }
    );

    const result = await response.json();
    if (!response.ok || !result.success) {
      console.warn("⚠️ Airwallex customer creation failed:", result?.error);
      return null;
    }
    return result.customer; // { airwallexCustomerId, email, name, ... }
  } catch (err) {
    console.error("❌ Airwallex customer API error:", err.message);
    return null;
  }
};

  /* ================= COLLAPSED VIEW ================= */
  if (!active && data && data.email) {
    return (
      <section className="border-b pb-4">
        <Header step={1} title="Client" onEdit={onEdit} email={data.email}/>
        {/* <div className="pl-8 text-sm text-gray-700">
          {data.email}
          {data.firstName && data.lastName && (
            <div className="mt-1">
              {data.firstName} {data.lastName}
            </div>
          )}
        </div> */}
      </section>
    );
  }

  /* ================= ACTIVE VIEW ================= */
  return (
    <section className="border-b pb-[25px] iyuktykty">
      <Header step={1} title="Client"/>

      <div className="mt-4 grid grid-cols-2 gap-x-[8px] gap-y-[10px]">
        <div className="nr-input-field flex flex-col-reverse col-span-2 md:col-span-1">
          <input
            type="text"
            placeholder="Prénom"
            value={form.firstName}
            onChange={(e) =>
              setForm({ ...form, firstName: e.target.value })
            }
            id="prénom"
            className="outline-none text-[#333] border rounded px-[13px] py-2 text-sm pb-0 h-[48px]"
            disabled={loading || isDisabled}
          />
          <label htmlFor="prénom" className="nr-input-label text-[14px] text-[#666] top-[unset]">
            Prénom
          </label>
        </div>
        
        <div className="nr-input-field flex flex-col-reverse col-span-2 md:col-span-1">
          <input
            type="text"
            placeholder="Nom"
            value={form.lastName}
            onChange={(e) =>
              setForm({ ...form, lastName: e.target.value })
            }
            id="nom"
            className="outline-none text-[#333] border rounded px-[13px] py-2 text-sm pb-0 h-[48px]"
            disabled={loading || isDisabled}
          />
          <label htmlFor="nom" className="nr-input-label text-[14px] text-[#666] top-[unset]">
            Nom
          </label>
        </div>
        
        <div className="nr-input-field flex flex-col-reverse col-span-2">
          <input
            type="email"
            placeholder="Email Address"
            value={form.email}
            onChange={handleEmailChange}
            onBlur={() => {
              if (form.email && !validateEmail(form.email)) {
                setEmailError("Please enter a valid email address");
              }
            }}
            id="email-address"
            className={`outline-none text-[#333] border rounded px-[13px] py-2 text-sm pb-0 h-[48px] 
              ${
              emailError ? 'border-red-500' : ''
            } ${isValidating ? 'border-blue-300' : ''}`}
            disabled={loading || isDisabled}
          />
          <label htmlFor="email-address" className="nr-input-label text-[14px] text-[#666] top-[unset]">
            Adresse e-mail
          </label>
          
          {/* {emailError && (
            <div className="text-xs text-red-600 mt-1">{emailError}</div>
          )} 
          
          {isValidating && !emailError && (
            <div className="text-xs text-blue-600 mt-1 flex items-center gap-1">
              <span className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-600"></span>
              <span>Checking email availability...</span>
            </div>
          )} 
          
          {!emailError && form.email && validateEmail(form.email) && !isValidating && (
            <div className="text-xs text-green-600 mt-1 flex items-center gap-1">
              <span>✓</span>
              <span>Email looks good</span>
            </div>
          )}  */}
        </div>
      </div>

      <button 
        type="button"
        className="nr-fir-st-btn cursor-pointer inline-block mt-[34px] bg-[#2fb34a] hover:bg-[#28a745] transition text-white text-[13px] px-[30px] py-[13px] rounded w-full sm:w-auto disabled:opacity-50 disabled:cursor-not-allowed"
        onClick={handleContinue}
        disabled={!form.email || !!emailError || loading || isDisabled}
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></span>
            Traitement en cours…
          </span>
        ) : (
          'CONTINUER'
        )}
      </button>
      
      <div className="mt-3 text-xs text-gray-600 hidden">
        <p>By continuing, you'll create an account with this email.</p>
        <p>A password will be automatically generated and sent to you.</p>
      </div>
    </section>
  );
}

/* ================= SHARED HEADER ================= */

function Header({ step, title, onEdit,email }) {
  return (
    <div className="flex items-center justify-between flex-wrap sm:flex-nowrap gap-y-[5px]">
      <h2 className="nr-step-hed-wr flex items-center gap-[11px] font-[700] text-[25px] text-[#333] min-w-[140px] w-[100%] sm:w-[auto]">
        <span className="flex items-center justify-center rounded-full border-[2px] text-[20px] font-[400] border-[#333] h-[35px] w-[35px]">
          {step}
        </span>
        {title}
      </h2>

      <div className="text-[13px] text-gray-700 sm:w-[100%] pl-0 sm:pl-[20px] w-[50%]">
          {email}
          {/* {data.firstName && data.lastName && (
            <div className="mt-1">
              {data.firstName} {data.lastName}
            </div>
          )} */}
        </div>

      {onEdit && (
        <button
          type="button"
          className="text-[13px] ml-[20px] text-gray-700 border px-[15px] py-[6.5px] rounded hover:bg-gray-100 transition"
          onClick={onEdit}
        >
          Modifier
        </button>
      )}
    </div>
  );
}