const express = require('express')
const router = express.Router()
const SellingPlan = require('../models/SellingPlan')
const { createAirwallexProduct } = require('../lib/airwallex/product')
const { createAirwallexPrice } = require('../lib/airwallex/price')
const {
  createAirwallexSubscriptionPlan,
} = require('../lib/airwallex/subscriptionPlan')

/**
 * GET all selling plans (non-deleted)
 */
router.get('/', async (req, res) => {
  try {
    const plans = await SellingPlan.find({
      storeHash: '', // inject later from auth
      isDeleted: false,
    }).sort({ createdAt: -1 })

    res.json(plans)
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch selling plans' })
  }
})

/**
 * CREATE selling plan (DB only)
 */
router.post('/', async (req, res) => {
  try {
    const plan = await SellingPlan.create({
      storeHash: '',

      name: req.body.name,
      currency: req.body.currency || 'USD',

      chargeAmount: req.body.chargeAmount,
      setupCharge: req.body.setupCharge || 0,
      freeTrialDays: req.body.freeTrialDays || 0,

      billingInterval: req.body.billingInterval,
      billingIntervalCount: req.body.billingIntervalCount || 1,

      billingCycleStartDayUTC: req.body.billingCycleStartDayUTC,
      billingCycleStartTimeUTC: req.body.billingCycleStartTimeUTC,

      chargeShipping: !!req.body.chargeShipping,
      chargeSalesTax: !!req.body.chargeSalesTax,

      installments: req.body.installments || null,
      enableCustomerPortal: !!req.body.enableCustomerPortal,
      customerCancellationBehaviour:
        req.body.customerCancellationBehaviour || 'cancel_immediately',

      status: 'inactive',
      isDeleted: false,

      airwallex: {
        productId: null,
        priceId: null,
      },
    })

    res.status(201).json(plan)
  } catch (err) {
    res.status(400).json({
      error: 'Failed to create selling plan',
      details: err.message,
    })
  }
})

/**
 * UPDATE selling plan (DB only)
 */
router.patch('/:id', async (req, res) => {
  try {
    const updated = await SellingPlan.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    )

    res.json(updated)
  } catch (err) {
    res.status(400).json({ error: 'Failed to update selling plan' })
  }
})

/**
 * ENABLE / DISABLE selling plan
 */
router.patch('/:id/status', async (req, res) => {
  try {
    if (!['active', 'inactive'].includes(req.body.status)) {
      return res.status(400).json({ error: 'Invalid status' })
    }

    const updated = await SellingPlan.findByIdAndUpdate(
      req.params.id,
      { status: req.body.status },
      { new: true }
    )

    res.json(updated)
  } catch (err) {
    res.status(400).json({ error: 'Failed to update status' })
  }
})

/**
 * SYNC → Create Airwallex Product
 * (Explicit step, NOT auto)
 */
router.post('/:id/sync-airwallex-product', async (req, res) => {
  try {
    const plan = await SellingPlan.findById(req.params.id)

    if (!plan) {
      return res.status(404).json({ error: 'Selling plan not found' })
    }

    if (plan.airwallex?.productId) {
      return res.json({
        message: 'Airwallex product already exists',
        productId: plan.airwallex.productId,
      })
    }

    const product = await createAirwallexProduct({
      name: plan.name,
      description: `Subscription plan: ${plan.name}`,
    })

    plan.airwallex.productId = product.id
    await plan.save()

    res.json({
      success: true,
      airwallexProductId: product.id,
    })
  } catch (err) {
    console.error(err.response?.data || err)
    res.status(400).json({
      error: 'Failed to sync Airwallex product',
      details: err.message,
    })
  }
})


/**
 * SYNC → Create Airwallex Price + Subscription Plan
 */
router.post('/:id/sync-airwallex-subscription', async (req, res) => {
  try {
    const plan = await SellingPlan.findById(req.params.id)

    if (!plan?.airwallex?.productId) {
      return res.status(400).json({
        error: 'Airwallex product not created',
      })
    }

    if (plan.airwallex.subscriptionPlanId) {
      return res.json({
        message: 'Already synced',
        subscriptionPlanId:
          plan.airwallex.subscriptionPlanId,
      })
    }

    const price = await createAirwallexPrice(plan)
    plan.airwallex.priceId = price.id

    const subscriptionPlan =
      await createAirwallexSubscriptionPlan(plan)

    plan.airwallex.subscriptionPlanId =
      subscriptionPlan.id

    await plan.save()

    res.json({
      success: true,
      priceId: price.id,
      subscriptionPlanId: subscriptionPlan.id,
    })
  } catch (err) {
    console.error(err.response?.data || err)
    res.status(400).json({
      error: 'Failed to sync subscription',
      details: err.message,
    })
  }
})


module.exports = router
