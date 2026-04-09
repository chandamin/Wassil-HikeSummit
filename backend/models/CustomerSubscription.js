const mongoose = require('mongoose');

const CustomerSubscriptionSchema = new mongoose.Schema(
  {
    bigcommerceOrderId: {
      type: Number,
      required: true,
      index: true,
    },
    bigcommerceCustomerId: {
      type: Number,
      required: true,
      index: true,
    },
    bigcommerceProductId: {
      type: Number,
      required: true,
      index: true,
    },

    airwallexCustomerId: {
      type: String,
      required: true,
      index: true,
    },
    airwallexProductId: {
      type: String,
      required: true,
    },
    airwallexPriceId: {
      type: String,
      required: true,
    },
    airwallexSubscriptionId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    planName: String,
    status: {
      type: String,
      default: 'active',
    },

    amount: Number,
    currency: String,
    interval: String,

    trialDays: Number,
    startedAt: Date,
    nextBillingAt: Date,

    metadata: {
      type: Object,
      default: {},
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model(
  'CustomerSubscription',
  CustomerSubscriptionSchema
);