const mongoose = require('mongoose')

const SubscriptionPlanSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
    },
    description: String,

    currency: {
      type: String,
      default: 'USD',
    },

    amount: {
      type: Number, // 10 = $10
      required: true,
    },

    interval: {
      type: String,
      enum: ['MONTH', 'YEAR'],
      default: 'MONTH',
    },

    trialDays: {
      type: Number,
      default: 14,
    },

    // Airwallex references
    airwallexProductId: {
      type: String,
      required: true,
    },
    airwallexPriceId: {
      type: String,
      required: true,
    },

    bigcommerceProductId: {
      type: Number,
      required: true,
      unique: true,
      index: true,
    },

    status: {
      type: String,
      enum: ['enabled', 'disabled', 'archived'],
      default: 'enabled',
    },
  },
  { timestamps: true }
);

// export default mongoose.model('SubscriptionPlan', SubscriptionPlanSchema);
module.exports = mongoose.model('SubscriptionPlan', SubscriptionPlanSchema);
