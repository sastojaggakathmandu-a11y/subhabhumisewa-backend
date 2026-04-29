const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// ── USER MODEL ──
const UserSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  phone: { type: String },
  password: { type: String, required: true, minlength: 6, select: false },
  role: { type: String, enum: ['admin', 'agent', 'user'], default: 'user' },
  avatar: { type: String },
  isActive: { type: Boolean, default: true },
  lastLogin: { type: Date }
}, { timestamps: true });

// Hash password before save
UserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Generate JWT token
UserSchema.methods.getJWT = function() {
  return jwt.sign(
    { id: this._id, role: this.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || '30d' }
  );
};

// Check password
UserSchema.methods.checkPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

const User = mongoose.model('User', UserSchema);

// ── INQUIRY MODEL ──
const InquirySchema = new mongoose.Schema({
  property: { type: mongoose.Schema.Types.ObjectId, ref: 'Property' },
  propertyTitle: { type: String },
  
  // Customer Info
  name: { type: String, required: true },
  phone: { type: String, required: true },
  email: { type: String },
  message: { type: String },
  
  // Status
  status: {
    type: String,
    enum: ['new', 'contacted', 'interested', 'closed'],
    default: 'new'
  },
  
  // Source
  source: {
    type: String,
    enum: ['website', 'whatsapp', 'facebook', 'phone', 'other'],
    default: 'website'
  },

  notes: { type: String },
  isRead: { type: Boolean, default: false }

}, { timestamps: true });

const Inquiry = mongoose.model('Inquiry', InquirySchema);

module.exports = { User, Inquiry };
