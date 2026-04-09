const axios = require('axios')

let cachedToken = null
let tokenExpiresAt = 0

async function getAirwallexAccessToken() {
  const now = Date.now()

  // Reuse token if still valid (5 min buffer)
  if (cachedToken && now < tokenExpiresAt - 5 * 60 * 1000) {
    return cachedToken
  }

  const res = await axios.post(
    `${process.env.AIRWALLEX_BASE_URL}/api/v1/authentication/login`,
    {
      client_id: process.env.AIRWALLEX_CLIENT_ID,
      api_key: process.env.AIRWALLEX_API_KEY,
    },
    {
      headers: { 'Content-Type': 'application/json' },
    }
  )

  cachedToken = res.data.token
  tokenExpiresAt = now + res.data.expires_in * 1000

  return cachedToken
}

module.exports = {
  getAirwallexAccessToken,
}
