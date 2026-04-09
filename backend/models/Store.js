const mongoose = require('mongoose');

const StoreSchema = new mongoose.Schema({
    storeHash: { type: String, required: true, unique: true },
    accessToken: { type: String, required: true },
    scope: String,
    installedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Store', StoreSchema);
