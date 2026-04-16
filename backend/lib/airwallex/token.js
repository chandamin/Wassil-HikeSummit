const axios = require('axios')

let cachedToken = null
let tokenExpiry = null
let pendingLoginPromise = null

function logToken(label, payload = null) {
  const now = new Date().toISOString()
  if (payload !== null) {
    console.log(`[airwallex-token] ${now} ${label}`, payload)
  } else {
    console.log(`[airwallex-token] ${now} ${label}`)
  }
}

async function loginAirwallex() {
  const loginUrl = `${
    process.env.AIRWALLEX_BASE_URL || 'https://api-demo.airwallex.com'
  }/api/v1/authentication/login`

  logToken('requesting new token', {
    loginUrl,
    clientIdPresent: !!process.env.AIRWALLEX_CLIENT_ID,
    apiKeyPresent: !!process.env.AIRWALLEX_API_KEY,
  })

  const res = await axios.post(
    loginUrl,
    {},
    {
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.AIRWALLEX_API_KEY,
        'x-client-id': process.env.AIRWALLEX_CLIENT_ID,
      },
    }
  )

  cachedToken = res.data.token

  if (res.data.expires_at) {
    tokenExpiry = new Date(res.data.expires_at).getTime()
  } else if (res.data.expires_in) {
    tokenExpiry = Date.now() + res.data.expires_in * 1000
  } else {
    tokenExpiry = Date.now() + 55 * 60 * 1000
  }

  logToken('token received', {
    hasToken: !!cachedToken,
    tokenExpiry,
  })

  return cachedToken
}

async function getAirwallexToken(forceRefresh = false) {
  const now = Date.now()

  if (!forceRefresh && cachedToken && tokenExpiry && now < tokenExpiry - 120000) {
    logToken('using cached token', {
      expiresInMs: tokenExpiry - now,
    })
    return cachedToken
  }

  if (pendingLoginPromise) {
    logToken('awaiting in-flight token request')
    return pendingLoginPromise
  }

  pendingLoginPromise = loginAirwallex()
    .catch((err) => {
      cachedToken = null
      tokenExpiry = null

      logToken('token request failed', {
        status: err.response?.status,
        data: err.response?.data || err.message,
      })

      throw err
    })
    .finally(() => {
      pendingLoginPromise = null
    })

  return pendingLoginPromise
}

module.exports = {
  getAirwallexToken,
}