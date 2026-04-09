require('dotenv').config();
const mongoose = require('mongoose');
const Subscription = require('../models/Subscription');

(async () => {
    await mongoose.connect(process.env.MONGO_URI);

    await Subscription.deleteMany({});

    await Subscription.insertMany([
        {
            storeHash: 'demo-store',
            customerEmail: 'john@example.com',
            plan: 'Monthly Membership',
            status: 'active',
        },
        {
            storeHash: 'demo-store',
            customerEmail: 'alice@example.com',
            plan: 'Monthly Membership',
            status: 'paused',
        },
    ]);

    console.log('Seed complete');
    process.exit();
})();
