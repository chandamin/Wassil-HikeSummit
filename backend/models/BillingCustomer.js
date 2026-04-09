const mongoose = require('mongoose');

const AddressSchema = new mongoose.Schema(
  {
    street: String,
    city: String,
    state: String,
    postcode: String,
    country_code: {
      type: String,
      required: true,
    },
  },
  { _id: false }
);

const BillingCustomerSchema = new mongoose.Schema(
  {
    airwallexCustomerId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    name: String,
    email: String,

    type: {
      type: String,
      enum: ['BUSINESS', 'INDIVIDUAL'],
      default: 'INDIVIDUAL',
    },

    phone_number: String,
    tax_identification_number: String,

    default_billing_currency: String,
    default_legal_entity_id: String,

    description: String,
    nickname: String,

    address: AddressSchema,

    metadata: {
      type: Map,
      of: String,
    },

    createdAt: {
      type: Date,
      default: Date.now,
    },

    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('BillingCustomer', BillingCustomerSchema);
