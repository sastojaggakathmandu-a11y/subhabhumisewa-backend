// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// routes/inquiries.js
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const express = require('express');
const router = express.Router();
const { Inquiry } = require('../models/Models');
const { protect, adminOnly } = require('../middleware/auth');
const nodemailer = require('nodemailer');

// Send email notification
async function sendEmailNotification(inquiry) {
  try {
    if (!process.env.EMAIL_USER) return;
    const transporter = nodemailer.createTransporter({
      host: process.env.EMAIL_HOST,
      port: process.env.EMAIL_PORT,
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
    });
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: process.env.EMAIL_USER,
      subject: `🏠 New Inquiry: ${inquiry.propertyTitle || 'Property'}`,
      html: `
        <h2>New Property Inquiry — Subha Bhumi Sewa</h2>
        <p><strong>Name:</strong> ${inquiry.name}</p>
        <p><strong>Phone:</strong> ${inquiry.phone}</p>
        <p><strong>Email:</strong> ${inquiry.email || 'Not provided'}</p>
        <p><strong>Property:</strong> ${inquiry.propertyTitle || 'General'}</p>
        <p><strong>Message:</strong> ${inquiry.message || 'No message'}</p>
        <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
        <hr/>
        <p>Reply via WhatsApp: <a href="https://wa.me/${process.env.WHATSAPP_NUMBER}">Click here</a></p>
      `
    });
  } catch (err) {
    console.log('Email notification error:', err.message);
  }
}

// Create inquiry
// POST /api/inquiries
router.post('/', async (req, res) => {
  try {
    const inquiry = await Inquiry.create(req.body);
    // Send email notification
    await sendEmailNotification(inquiry);
    res.status(201).json({
      success: true,
      message: 'Inquiry sent successfully! We will contact you soon.',
      data: inquiry
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// Get all inquiries (Admin)
// GET /api/inquiries
router.get('/', protect, adminOnly, async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    let query = {};
    if (status) query.status = status;
    const inquiries = await Inquiry.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .populate('property', 'title price');
    const total = await Inquiry.countDocuments(query);
    const unread = await Inquiry.countDocuments({ isRead: false });
    res.json({ success: true, count: inquiries.length, total, unread, data: inquiries });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Mark as read
// PUT /api/inquiries/:id/read
router.put('/:id/read', protect, adminOnly, async (req, res) => {
  try {
    await Inquiry.findByIdAndUpdate(req.params.id, { isRead: true, status: 'contacted' });
    res.json({ success: true, message: 'Marked as read' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Delete inquiry
// DELETE /api/inquiries/:id
router.delete('/:id', protect, adminOnly, async (req, res) => {
  try {
    await Inquiry.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Inquiry deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Save as routes/users.js separately
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
