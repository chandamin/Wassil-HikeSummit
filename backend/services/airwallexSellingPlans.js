const axios = require('axios')
const { v4: uuidv4 } = require('uuid')

const AIRWALLEX_BASE = process.env.AIRWALLEX_BASE_URL

const airwallex = axios.create({
  baseURL: AIRWALLEX_BASE,
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${process.env.AIRWALLEX_ACCESS_TOKEN}`,
  },
})

/**
 * Create Airwallex Product
 */
async function createProduct(plan) {
  const res = await airwallex.post('/api/v1/products/create', {
    request_id: uuidv4(),
    name: plan.name,
    description: `Selling plan (${plan._id})`,
  })

  return res.data.id
}

/**
 * Create Airwallex Price (FLAT, recurring)
 */
async function createPrice(plan, productId) {
  const res = await airwallex.post('/api/v1/prices/create', {
    request_id: uuidv4(),
    product_id: productId,
    currency: 'GBP',
    pricing_model: 'FLAT',
    flat_amount: plan.chargeAmount,
    recurring: {
      period: 1,
      period_unit: 'MONTH',
    },
  })

  return res.data.id
}

/**
 * Orchestrator (SAFE + IDEMPOTENT)
 */
async function createAirwallexArtifacts(plan) {
  if (plan.airwallex?.priceId) {
    return plan.airwallex
  }

  const productId = await createProduct(plan)
  const priceId = await createPrice(plan, productId)

  return {
    productId,
    priceId,
  }
}

module.exports = {
  createAirwallexArtifacts,
}
