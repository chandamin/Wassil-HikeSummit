const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const AdminUser = require('../models/AdminUser');
const requireSession = require('../middleware/requireSession');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,                   // 10 attempts per window per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again later.' },
});

// POST /api/admin-auth/login
router.post('/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  try {
    const user = await AdminUser.findOne({ username });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user._id, username: user.username, role: user.role },
      process.env.APP_SESSION_SECRET,
      { expiresIn: '8h' }
    );

    res.json({ token, username: user.username, role: user.role });
  } catch (err) {
    console.error('Login error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/admin-auth/me  — verify token and return current user
router.get('/me', requireSession, (req, res) => {
  res.json({ username: req.session.username, role: req.session.role });
});


// PUT /api/admin-auth/update-credentials  - Update username and password
router.put('/update-credentials', requireSession, async (req, res) => {
  const { username, currentPassword, newPassword } = req.body || {};
  const adminId = req.session?.id;

  if (!adminId) return res.status(401).json({ error: 'Unauthorized: Session invalid' });

  // At least one field must be provided
  if (!username && !newPassword) {
    return res.status(400).json({ error: 'New username or new password is required' });
  }

  try {
    const user = await AdminUser.findById(adminId);
    if (!user) return res.status(404).json({ error: 'Admin account not found' });

    // Always verify current password for security
    if (!currentPassword) {
      return res.status(400).json({ error: 'Current password is required to update credentials' });
    }

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    // Check if new username already exists
    if (username && username.trim() !== user.username) {
      const existing = await AdminUser.findOne({ username: username.trim() });
      if (existing) return res.status(409).json({ error: 'Username already taken' });
    }

    // Apply updates
    if (username) user.username = username.trim();
    if (newPassword) {
      if (newPassword.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
      }
      user.passwordHash = await bcrypt.hash(newPassword, 10);
    }

    await user.save();
    res.json({ success: true, message: 'Credentials updated successfully' });
  } catch (err) {
    console.error('Update credentials error:', err);
    res.status(500).json({ error: 'Failed to update credentials' });
  }
});

module.exports = router;
