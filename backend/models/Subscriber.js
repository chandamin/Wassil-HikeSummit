const mongoose = require('mongoose');

const SubscriberSchema = new mongoose.Schema({
    storeHash: { type: String, required: true },
    orderId: Number,
    email: String,
    status: { type: String, default: 'active' },
    createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Subscriber', SubscriberSchema);
