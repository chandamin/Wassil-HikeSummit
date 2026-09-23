const mongoose = require('mongoose');

const CheckoutPaymentSchema = new mongoose.Schema({
  intentId: { type: String, required: true, unique: true, index: true },
  cartId: { type: String, required: true, index: true },
  shippingOptionId: String,
  fingerprint: { type: String, required: true },
  gbpAmount: { type: Number, required: true },
  usdAmount: { type: Number, required: true },
  currency: { type: String, default: 'USD' },
  fxRate: { type: Number, required: true },
  fxSource: { type: String, required: true },
  fxTimestamp: { type: Date, required: true },
  bigcommerceOrderId: Number,
  orderCreationStatus: { type: String, enum: ['creating', 'failed', 'created'] },
  reconciliationStatus: { type: String, enum: ['matched', 'required'] },
  reconciliationReason: String,
}, { timestamps: true });

module.exports = mongoose.model('CheckoutPayment', CheckoutPaymentSchema);
