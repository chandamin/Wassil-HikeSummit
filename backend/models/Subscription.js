const mongoose = require("mongoose");

const subscriptionSchema = new mongoose.Schema(
  {
    // 🔗 References
    subscriptionCustomerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SubscriptionCustomer",
      required: true,
    },

    customerSubscriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CustomerSubscription",
      required: true,
    },

    // 🧾 External IDs
    externalSubscriptionId: {
      type: String,
      required: true,
      index: true,
    },

    airwallexCustomerId: String,
    bigcommerceCustomerId: Number,
    customerEmail: {
      type: String,
      index: true,
    },

    // 📦 Plan/Product Info
    planName: String, 
    productId: Number,
    price: Number,
    currency: String,
    interval: String,

    // 📊 Status
    status: {
      type: String,
      enum: [
        "pending",
        "trialing",
        "active",
        "past_due",
        "cancelled",
      ],
      default: "pending",
    },

    nextBillingAt: Date,

    // 📦 Orders
    orders: [
      {
        bigcommerceOrderId: Number,
        amount: Number,
        currency: String,
        createdAt: Date,
      },
    ],

    // 🔄 Sync
    lastSyncedAt: Date,
    syncStatus: {
      type: String,
      enum: ["ok", "failed"],
      default: "ok",
    },
    syncError: String,
  },
  { timestamps: true }
);

module.exports = mongoose.model("Subscription", subscriptionSchema);