// // src/api/admin.js
// export async function fetchSummary(storeHash) {
//     const res = await fetch(
//         `${process.env.REACT_APP_BACKEND_URL}/api/admin/summary?store_hash=${storeHash}`
//     );
//     return res.json();
// }

// export async function fetchSubscribers(storeHash) {
//     const res = await fetch(
//         `${process.env.REACT_APP_BACKEND_URL}/api/admin/subscribers?store_hash=${storeHash}`
//     );
//     return res.json();
// }
// src/api/admin.js

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;

export async function getCart(cartId) {
  if (!cartId) {
    throw new Error("cartId is required");
  }

  const res = await fetch(
    `${BACKEND_URL}/api/cart?cartId=${cartId}`,
    {
      method: "GET",
      credentials: "include",
      headers: {
        "Accept": "application/json",
      },
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Cart fetch failed: ${text}`);
  }

  const data = await res.json();

  if (!data.success || !data.cart) {
    throw new Error("Invalid cart response");
  }

  console.log(data.cart)

  return data.cart;
}
// export async function fetchCart(cartId) {
//   return fetch(`/api/cart/${cartId}`).then(res => res.json());
// }

