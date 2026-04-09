const express = require('express');
const router = express.Router();

const Subscription = require('../models/Subscription');
const SubscriptionCustomer = require('../models/SubscriptionCustomer');

function logDashboard(label, payload = null) {
  const now = new Date().toISOString();
  if (payload !== null) {
    console.log(`[dashboard] ${now} ${label}`, payload);
  } else {
    console.log(`[dashboard] ${now} ${label}`);
  }
}

router.get('/', async (req, res) => {
  try {
    logDashboard('GET / hit', {
      query: req.query,
      headers: {
        origin: req.headers.origin,
        referer: req.headers.referer,
      },
    });

    const subs = await Subscription.find().sort({ updatedAt: -1 }).lean();

    logDashboard('subscriptions fetched', {
      count: subs.length,
    });

    const totalOrders = subs.reduce((sum, s) => {
      return sum + (Array.isArray(s.orders) ? s.orders.length : 0);
    }, 0);

    const activeSubscriptions = subs.filter(
      (s) => s.status === 'active'
    ).length;

    const pausedSubscriptions = subs.filter(
      (s) => s.status === 'paused'
    ).length;

    const cancelledSubscriptions = subs.filter(
      (s) => s.status === 'cancelled'
    ).length;

    const pendingSubscriptions = subs.filter(
      (s) => s.status === 'pending' || s.status === 'pending_payment'
    ).length;

    const recentSubs = subs.slice(0, 5);

    const recentActivity = await Promise.all(
      recentSubs.map(async (s) => {
        let customerEmail = null;

        if (s.bigcommerceCustomerId && s.productId) {
          const subscriptionCustomer = await SubscriptionCustomer.findOne({
            bigcommerceCustomerId: s.bigcommerceCustomerId,
            subscriptionProductId: s.productId,
          }).lean();

          customerEmail = subscriptionCustomer?.bigcommerceEmail || null;
        }

        return {
          customer: customerEmail || `Customer #${s.bigcommerceCustomerId || '-'}`,
          action: s.status || '-',
          plan: s.planName || '-',
          externalSubscriptionId: s.externalSubscriptionId || '-',
          date: s.updatedAt
            ? new Date(s.updatedAt).toISOString().split('T')[0]
            : '-',
        };
      })
    );

    const response = {
      stats: {
        totalSubscribers: subs.length,
        activeSubscriptions,
        pausedSubscriptions,
        cancelledSubscriptions,
        pendingSubscriptions,
      },
      recentActivity,
      totalSubscriptionOrders: totalOrders,
    };

    logDashboard('response prepared', response);

    return res.json(response);
  } catch (err) {
    console.error(`[dashboard] ${new Date().toISOString()} GET / failed`);
    console.error('message:', err.message);
    if (err.stack) console.error(err.stack);

    return res.status(500).json({
      error: 'Failed to load dashboard data',
      details: err.message,
    });
  }
});

module.exports = router;