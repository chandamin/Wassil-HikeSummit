const { airwallexRequest } = require('./client')

async function createAirwallexPrice(plan) {
  const res = await airwallexRequest(
    'POST',
    '/api/v1/prices',
    {
      product_id: plan.airwallex.productId,
      currency: plan.currency,
      unit_amount: Math.round(plan.chargeAmount * 100),
      recurring: {
        interval: plan.billingInterval, // day | week | month | year
        interval_count: plan.billingIntervalCount,
      },
      payment_account_id:
        process.env.AIRWALLEX_LINKED_PAYMENT_ACCOUNT_ID,
    }
  )

  return res.data
}

module.exports = { createAirwallexPrice }
