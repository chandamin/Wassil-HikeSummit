function priceUsd({ gbpAmount, rate }) {
  if (!Number.isFinite(gbpAmount) || gbpAmount <= 0) throw new Error('Invalid GBP amount');
  if (!Number.isFinite(rate) || rate <= 0) throw new Error('Invalid FX rate');
  return Math.round((gbpAmount * rate + Number.EPSILON) * 100) / 100;
}

function extractGbpUsdRate(response, now = Date.now()) {
  if (response?.buy_currency !== 'USD' || response?.sell_currency !== 'GBP') {
    throw new Error('Unexpected Airwallex FX currency pair');
  }
  const timestamp = Date.parse(response.created_at);
  if (!Number.isFinite(timestamp) || timestamp > now + 60_000 || now - timestamp > 5 * 60_000) {
    throw new Error('Stale Airwallex FX rate');
  }
  const client = response.rate_details?.find(detail => detail.level === 'CLIENT');
  const rate = Number(client?.buy_amount) / Number(client?.sell_amount);
  if (!Number.isFinite(rate) || rate <= 0) throw new Error('Invalid Airwallex client FX rate');
  return { rate, source: 'airwallex', timestamp: response.created_at };
}

async function getGbpToUsdRate({ gbpAmount, token, baseUrl, http }) {
  if (!Number.isFinite(gbpAmount) || gbpAmount <= 0) throw new Error('Invalid GBP amount');
  const response = await http.get(`${baseUrl}/api/v1/fx/rates/current`, {
    params: { buy_currency: 'USD', sell_currency: 'GBP', sell_amount: gbpAmount },
    headers: { Authorization: `Bearer ${token}` },
  });
  return extractGbpUsdRate(response.data);
}

module.exports = { priceUsd, extractGbpUsdRate, getGbpToUsdRate };
