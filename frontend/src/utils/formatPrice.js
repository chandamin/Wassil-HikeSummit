/**
 * Format a numeric value as a currency string using browser Intl API.
 * Falls back to manual symbol + toFixed(2) if Intl is unavailable.
 *
 * @param {number|string} value  – the amount to format
 * @param {string}        currency – ISO 4217 code, e.g. "GBP", "EUR", "USD"
 * @returns {string}
 */
export function formatPrice(value, currency = "GBP") {
  const num = Number(value || 0);
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(num);
  } catch {
    // Fallback: manual symbol lookup
    const symbols = { GBP: "£", EUR: "€", USD: "$", CHF: "CHF " };
    const sym = symbols[currency] || `${currency} `;
    return `${sym}${num.toFixed(2)}`;
  }
}
