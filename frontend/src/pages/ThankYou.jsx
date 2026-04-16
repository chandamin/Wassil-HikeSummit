import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import ThankYouStep from "../components/Checkout/ThankYouStep";

const STORE_URL = "https://kasweb-c4.mybigcommerce.com/";

export default function ThankYou() {
  const { state } = useLocation();

  const order = state?.order || null;
  const customer = state?.customer || null;
  const cart = state?.cart || null;

  useEffect(() => {
    if (!order?.orderId) {
      window.location.href = STORE_URL;
    }
  }, [order]);

  if (!order?.orderId) return null;

  return (
    <ThankYouStep
      order={order}
      customer={customer}
      cart={cart}
      onContinueShopping={() => {
        window.location.href = STORE_URL;
      }}
    />
  );
}
