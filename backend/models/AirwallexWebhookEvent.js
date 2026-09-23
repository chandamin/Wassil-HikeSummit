const mongoose = require('mongoose');

const AirwallexWebhookEventSchema = new mongoose.Schema({
  eventId: { type: String, required: true, unique: true, index: true },
  eventName: String,
  processedAt: Date,
}, { timestamps: true });

module.exports = mongoose.model('AirwallexWebhookEvent', AirwallexWebhookEventSchema);
