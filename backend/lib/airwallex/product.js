const axios = require('axios')
const { getAirwallexToken } = require('./token')

async function createAirwallexProduct({ name, description }) {
  const token = await getAirwallexToken()

  const res = await axios.post(
    `${process.env.AIRWALLEX_BASE_URL}/api/v1/products`,
    {
      name,
      description,
      active: true,
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  )

  return res.data
}

module.exports = {
  createAirwallexProduct,
}
