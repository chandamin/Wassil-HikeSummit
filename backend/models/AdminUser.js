const mongoose = require('mongoose');

const adminUserSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['admin', 'viewer'], default: 'admin' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('AdminUser', adminUserSchema);
