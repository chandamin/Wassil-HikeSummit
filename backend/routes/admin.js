const express = require('express');
const Store = require('../models/Store');
const Subscriber = require('../models/Subscriber');

const router = express.Router();

router.get('/summary', async (req, res) => {
    const { store_hash } = req.query;

    if (!store_hash) {
        return res.status(400).json({ error: 'store_hash required' });
    }

    const store = await Store.findOne({ storeHash: store_hash });
    if (!store) {
        return res.status(404).json({ error: 'Store not found' });
    }

    const totalSubscribers = await Subscriber.countDocuments({
        storeHash: store_hash,
    });

    const activeSubscribers = await Subscriber.countDocuments({
        storeHash: store_hash,
        status: 'active',
    });

    return res.json({
        storeHash: store_hash,
        installedAt: store.installedAt,
        totalSubscribers,
        activeSubscribers,
    });
});

module.exports = router;

router.get('/subscribers', async (req, res) => {
    const { store_hash } = req.query;

    const subscribers = await Subscriber.find({ storeHash: store_hash })
        .sort({ createdAt: -1 })
        .limit(20)
        .select('orderId email status createdAt');

    res.json(subscribers);
});
