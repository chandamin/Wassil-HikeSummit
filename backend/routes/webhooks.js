const express = require('express');
const verifyWebhook = require('../middleware/verifyWebhook');
const Store = require('../models/Store');
const Subscriber = require('../models/Subscriber');
const CustomerSubscription = require('../models/CustomerSubscription');
const AirwallexWebhookEvent = require('../models/AirwallexWebhookEvent');
const { verifyAirwallexWebhook } = require('../lib/airwallex/webhookSignature');

const router = express.Router();

router.post('/airwallex-billing', async (req, res) => {
  try {
    verifyAirwallexWebhook({
      rawBody: req.rawBody,
      timestamp: req.get('x-timestamp'),
      signature: req.get('x-signature'),
      secret: process.env.AIRWALLEX_BILLING_WEBHOOK_SECRET,
    });
    const event = req.body;
    if (!event?.id || !event?.name) return res.status(400).json({ error: 'Invalid event' });
    if (await AirwallexWebhookEvent.exists({ eventId: event.id })) return res.sendStatus(200);
    const object = event.data?.object;
    if (event.name.startsWith('subscription.') && object?.id) {
      await CustomerSubscription.updateOne(
        { airwallexSubscriptionId: object.id, renewalFxEnabled: true },
        { $set: {
          status: object.status,
          ...(object.next_billing_at && { nextBillingAt: new Date(object.next_billing_at) }),
        } }
      );
    }
    await AirwallexWebhookEvent.create({ eventId: event.id, eventName: event.name, processedAt: new Date() });
    return res.sendStatus(200);
  } catch (err) {
    if (err.code === 11000) return res.sendStatus(200);
    console.error('Airwallex billing webhook error:', err);
    return res.status(err.message?.includes('signature') || err.message?.includes('timestamp') ? 400 : 500).json({ error: 'Webhook rejected' });
  }
});

/**
 * App uninstall webhook
 */
router.post('/uninstall', verifyWebhook, async (req, res) => {
    const payload = JSON.parse(req.rawBody.toString());
    const { store_id } = payload;

    await Store.deleteOne({ storeHash: store_id });

    res.sendStatus(200);
});


/**
 * Order created webhook
 */
router.post(
  '/order-created',
  verifyWebhook,
  async (req, res) => {
    const orderId = req.body.data.id;

    console.log('Order created:', orderId);

    res.status(200).send('OK');
  }
);
module.exports = router;
