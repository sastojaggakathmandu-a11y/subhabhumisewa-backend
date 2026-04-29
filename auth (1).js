// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// routes/auth.js — Login & Register
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const express = require('express');
const router = express.Router();
const { User } = require('../models/Models');
const { protect } = require('../middleware/auth');

// Register
// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { name, email, phone, password, role } = req.body;
    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Email already exists' });
    }
    const user = await User.create({ name, email, phone, password, role: role || 'user' });
    const token = user.getJWT();
    res.status(201).json({
      success: true,
      message: 'Account created successfully!',
      token,
      user: { id: user._id, name: user.name, email: user.email, role: user.role }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Login
// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password required' });
    }
    const user = await User.findOne({ email }).select('+password');
    if (!user || !(await user.checkPassword(password))) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }
    user.lastLogin = new Date();
    await user.save({ validateBeforeSave: false });
    const token = user.getJWT();
    res.json({
      success: true,
      message: 'Login successful!',
      token,
      user: { id: user._id, name: user.name, email: user.email, role: user.role }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Get current user
// GET /api/auth/me
router.get('/me', protect, async (req, res) => {
  res.json({ success: true, user: req.user });
});

module.exports = router;


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Save as separate files:
// routes/properties.js
// routes/inquiries.js
// routes/users.js
// routes/upload.js
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
