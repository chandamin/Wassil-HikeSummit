function extractGbpUsdRate(currencies, retrievedAt = new Date()) {
  if (!Array.isArray(currencies)) throw new Error('Invalid BigCommerce currencies response');
  const gbp = currencies.find(currency => currency.currency_code === 'GBP');
  const usd = currencies.find(currency => currency.currency_code === 'USD');
  if (!gbp) throw new Error('GBP currency is not configured in BigCommerce');
  if (!usd) throw new Error('USD currency is not configured in BigCommerce');
  if (gbp.is_transactional === false || usd.is_transactional === false) {
    throw new Error('GBP and USD must be transactional BigCommerce currencies');
  }
  const gbpRate = Number(gbp.currency_exchange_rate);
  const usdRate = Number(usd.currency_exchange_rate);
  const rate = usdRate / gbpRate;
  if (!Number.isFinite(rate) || rate <= 0) throw new Error('Invalid BigCommerce GBP-to-USD rate');
  const timestamp = new Date(retrievedAt);
  if (!Number.isFinite(timestamp.getTime())) throw new Error('Invalid BigCommerce rate timestamp');
  return { rate, source: 'bigcommerce', timestamp: timestamp.toISOString() };
}

async function getGbpToUsdRate({ storeHash, apiToken, http }) {
  if (!storeHash || !apiToken) throw new Error('BigCommerce currency credentials are missing');
  const response = await http.get(
    `https://api.bigcommerce.com/stores/${storeHash}/v2/currencies`,
    { headers: { 'X-Auth-Token': apiToken, Accept: 'application/json' } }
  );
  return extractGbpUsdRate(response.data);
}

module.exports = { extractGbpUsdRate, getGbpToUsdRate };
