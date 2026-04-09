const express = require('express');
const router = express.Router();
const Subscription = require('../models/Subscription');

// TEMP: fake orders (to understand flow first)
router.post('/:id', async (req, res) => {
    const sub = await Subscription.findById(req.params.id);

    if (!sub) {
        return res.status(404).json({ error: 'Not found' });
    }

    // Dummy orders for now
    sub.orders = [
        {
            orderId: 101,
            orderNumber: '1001',
            total: 12.99,
            createdAt: new Date(),
        },
        {
            orderId: 102,
            orderNumber: '1002',
            total: 12.99,
            createdAt: new Date(),
        },
    ];

    await sub.save();
    res.json(sub);
});

module.exports = router;

