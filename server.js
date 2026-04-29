const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');

dotenv.config();

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ── CONNECT DATABASE ──
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB Connected!'))
  .catch(err => console.log('❌ MongoDB Error:', err.message));

// ── USER MODEL ──
const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  phone: { type: String },
  password: { type: String, required: true, select: false },
  role: { type: String, enum: ['admin', 'agent', 'user'], default: 'user' },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

UserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

const User = mongoose.model('User', UserSchema);

// ── PROPERTY MODEL ──
const PropertySchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String },
  price: { type: Number, required: true },
  priceNepali: { type: String },
  negotiable: { type: Boolean, default: false },
  location: {
    address: { type: String, required: true },
    city: { type: String, default: 'Kathmandu' },
    area: { type: String },
    mapUrl: { type: String }
  },
  type: { type: String, enum: ['land', 'house', 'apartment', 'commercial', 'other'], required: true },
  status: { type: String, enum: ['sale', 'rent', 'sold', 'rented'], default: 'sale' },
  area: { value: Number, unit: { type: String, default: 'anna' } },
  bedrooms: { type: Number, default: 0 },
  bathrooms: { type: Number, default: 0 },
  images: [{ url: String, publicId: String }],
  featured: { type: Boolean, default: false },
  views: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  agent: {
    name: { type: String, default: 'Subha Bhumi Sewa' },
    phone: { type: String, default: '9801306673' }
  }
}, { timestamps: true });

const Property = mongoose.model('Property', PropertySchema);

// ── INQUIRY MODEL ──
const InquirySchema = new mongoose.Schema({
  property: { type: mongoose.Schema.Types.ObjectId, ref: 'Property' },
  propertyTitle: { type: String },
  name: { type: String, required: true },
  phone: { type: String, required: true },
  email: { type: String },
  message: { type: String },
  status: { type: String, enum: ['new', 'contacted', 'closed'], default: 'new' },
  isRead: { type: Boolean, default: false }
}, { timestamps: true });

const Inquiry = mongoose.model('Inquiry', InquirySchema);

// ── AUTH MIDDLEWARE ──
const protect = async (req, res, next) => {
  try {
    let token;
    if (req.headers.authorization?.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }
    if (!token) return res.status(401).json({ success: false, message: 'Please login' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    req.user = await User.findById(decoded.id);
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
};

const adminOnly = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Admin only' });
  }
  next();
};

// ── SEND EMAIL ──
async function sendEmail(to, subject, html) {
  try {
    if (!process.env.EMAIL_USER || process.env.EMAIL_USER === 'your_gmail@gmail.com') return;
    const transporter = nodemailer.createTransporter({
      host: 'smtp.gmail.com', port: 587,
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
    });
    await transporter.sendMail({ from: process.env.EMAIL_USER, to, subject, html });
  } catch (err) {
    console.log('Email error:', err.message);
  }
}

// ── HOME ──
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: '🏠 Subha Bhumi Sewa API Running!',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth/register | /api/auth/login',
      properties: '/api/properties',
      inquiries: '/api/inquiries'
    }
  });
});

// ── AUTH ROUTES ──
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, phone, password, role } = req.body;
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ success: false, message: 'Email already exists' });
    const user = await User.create({ name, email, phone, password, role: role || 'user' });
    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET || 'secret', { expiresIn: '30d' });
    res.status(201).json({ success: true, token, user: { id: user._id, name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email }).select('+password');
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }
    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET || 'secret', { expiresIn: '30d' });
    res.json({ success: true, token, user: { id: user._id, name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/auth/me', protect, (req, res) => {
  res.json({ success: true, user: req.user });
});

// ── PROPERTY ROUTES ──
app.get('/api/properties', async (req, res) => {
  try {
    const { type, status, city, area, featured, search, page = 1, limit = 12 } = req.query;
    let query = { isActive: true };
    if (type) query.type = type;
    if (status) query.status = status;
    if (city) query['location.city'] = new RegExp(city, 'i');
    if (area) query['location.area'] = new RegExp(area, 'i');
    if (featured) query.featured = true;
    if (search) query.$or = [
      { title: new RegExp(search, 'i') },
      { 'location.address': new RegExp(search, 'i') },
      { 'location.area': new RegExp(search, 'i') }
    ];
    const total = await Property.countDocuments(query);
    const properties = await Property.find(query)
      .sort({ featured: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));
    res.json({ success: true, count: properties.length, total, data: properties });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/properties/featured', async (req, res) => {
  try {
    const properties = await Property.find({ featured: true, isActive: true }).limit(6);
    res.json({ success: true, data: properties });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/properties/:id', async (req, res) => {
  try {
    const property = await Property.findById(req.params.id);
    if (!property) return res.status(404).json({ success: false, message: 'Not found' });
    property.views += 1;
    await property.save({ validateBeforeSave: false });
    res.json({ success: true, data: property });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/properties', protect, adminOnly, async (req, res) => {
  try {
    const property = await Property.create(req.body);
    res.status(201).json({ success: true, data: property });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

app.put('/api/properties/:id', protect, adminOnly, async (req, res) => {
  try {
    const property = await Property.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!property) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: property });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

app.delete('/api/properties/:id', protect, adminOnly, async (req, res) => {
  try {
    await Property.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Deleted!' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── INQUIRY ROUTES ──
app.post('/api/inquiries', async (req, res) => {
  try {
    const inquiry = await Inquiry.create(req.body);
    // Send email notification
    await sendEmail(
      process.env.EMAIL_USER,
      `New Inquiry: ${inquiry.propertyTitle || 'Property'}`,
      `<h2>New Inquiry</h2><p>Name: ${inquiry.name}</p><p>Phone: ${inquiry.phone}</p><p>Message: ${inquiry.message}</p>`
    );
    res.status(201).json({ success: true, message: 'Inquiry sent!', data: inquiry });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

app.get('/api/inquiries', protect, adminOnly, async (req, res) => {
  try {
    const inquiries = await Inquiry.find().sort({ createdAt: -1 }).limit(50);
    const unread = await Inquiry.countDocuments({ isRead: false });
    res.json({ success: true, count: inquiries.length, unread, data: inquiries });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.put('/api/inquiries/:id/read', protect, adminOnly, async (req, res) => {
  try {
    await Inquiry.findByIdAndUpdate(req.params.id, { isRead: true, status: 'contacted' });
    res.json({ success: true, message: 'Marked as read' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── STATS ──
app.get('/api/stats', protect, adminOnly, async (req, res) => {
  try {
    const total = await Property.countDocuments({ isActive: true });
    const forSale = await Property.countDocuments({ status: 'sale', isActive: true });
    const forRent = await Property.countDocuments({ status: 'rent', isActive: true });
    const inquiries = await Inquiry.countDocuments();
    const unreadInquiries = await Inquiry.countDocuments({ isRead: false });
    res.json({ success: true, data: { total, forSale, forRent, inquiries, unreadInquiries } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── 404 ──
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found` });
});

// ── START ──
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`
🚀 Subha Bhumi Sewa API Running!
📡 Port: ${PORT}
🏠 Ready!
  `);
});
