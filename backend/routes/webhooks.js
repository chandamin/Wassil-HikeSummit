const express = require('express');
const verifyWebhook = require('../middleware/verifyWebhook');
const Store = require('../models/Store');
const Subscriber = require('../models/Subscriber');

const router = express.Router();

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
