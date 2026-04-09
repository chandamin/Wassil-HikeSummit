const mongoose = require('mongoose');

const SubscriptionCustomerSchema = new mongoose.Schema(
  {
    bigcommerceCustomerId: {
      type: Number,
      required: true,
      index: true,
    },
    bigcommerceEmail: {
      type: String,
      required: true,
      index: true,
    },
    bigcommerceFirstName: String,
    bigcommerceLastName: String,
    bigcommercePhone: String,
    bigcommerceCompany: String,

    airwallexCustomerId: {
      type: String,
      required: true,
      index: true,
    },
    airwallexName: String,
    airwallexEmail: String,
    airwallexType: String,
    airwallexPhoneNumber: String,

    cartId: String,
    orderId: Number,

    subscriptionProductId: {
      type: Number,
      required: true,
    },
    subscriptionProductName: String,

    isSubscriptionCustomer: {
      type: Boolean,
      default: true,
    },

    metadata: {
      type: Object,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

// One BC customer + one subscription product = one record
SubscriptionCustomerSchema.index(
  { bigcommerceCustomerId: 1, subscriptionProductId: 1 },
  { unique: true }
);

module.exports = mongoose.model('SubscriptionCustomer', SubscriptionCustomerSchema);