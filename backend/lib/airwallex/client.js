const axios = require('axios')

let tokenCache = null
let tokenExpiry = 0

async function getAirwallexToken() {
  if (tokenCache && Date.now() < tokenExpiry) {
    return tokenCache
  }

  const res = await axios.post(
    `${process.env.AIRWALLEX_BASE_URL}/api/v1/authentication/login`,
    {
      client_id: process.env.AIRWALLEX_CLIENT_ID,
      api_key: process.env.AIRWALLEX_API_KEY,
    }
  )

  tokenCache = res.data.token
  tokenExpiry = Date.now() + 25 * 60 * 1000 // 25 min

  return tokenCache
}

async function airwallexRequest(method, url, data) {
  const token = await getAirwallexToken()

  return axios({
    method,
    url: `${process.env.AIRWALLEX_BASE_URL}${url}`,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    data,
  })
}

module.exports = { airwallexRequest }
