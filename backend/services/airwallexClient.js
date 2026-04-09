const axios = require('axios')
const { getAirwallexAccessToken } = require('./airwallexAuth')

const airwallex = axios.create({
  baseURL: process.env.AIRWALLEX_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
})

airwallex.interceptors.request.use(async config => {
  const token = await getAirwallexAccessToken()
  config.headers.Authorization = `Bearer ${token}`
  return config
})

module.exports = airwallex
