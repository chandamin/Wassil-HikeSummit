const mongoose = require('mongoose');

const RenewalPriceRefreshSchema = new mongoose.Schema({
  cycleKey: { type: String, required: true, unique: true, index: true },
  subscriptionId: { type: String, required: true, index: true },
  status: { type: String, required: true, enum: ['claimed', 'complete', 'failed'] },
  usdAmount: Number,
  priceId: String,
  error: String,
  leaseUntil: Date,
}, { timestamps: true });

module.exports = mongoose.model('RenewalPriceRefresh', RenewalPriceRefreshSchema);
