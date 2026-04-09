const { airwallexRequest } = require('./client')

async function createAirwallexSubscriptionPlan(plan) {
  const res = await airwallexRequest(
    'POST',
    '/api/v1/subscription_plans',
    {
      name: plan.name,
      prices: [{ price_id: plan.airwallex.priceId }],
      trial_period_days: plan.freeTrialDays || 0,
      billing_cycle_anchor: 'automatic',
      allow_pause: false,
      allow_cancel:
        plan.customerCancellationBehaviour !== 'do_not_allow',
    }
  )

  return res.data
}

module.exports = { createAirwallexSubscriptionPlan }
