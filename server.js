const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');

dotenv.config();

const app = express();

// ── SECURITY MIDDLEWARE ──

// 1. Helmet — HTTP Security Headers
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false
}));

// 2. Rate Limiting — Too many requests block
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // max 100 requests per IP
  message: { success: false, message: 'Too many requests. Please try again later.' }
});

const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // max 10 login attempts per hour
  message: { success: false, message: 'Too many login attempts. Try again in 1 hour.' }
});

const inquiryLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: { success: false, message: 'Too many inquiries. Try again later.' }
});

app.use('/api/', limiter);

// 3. CORS — Only allow your website
const allowedOrigins = [
  'https://subhabhumisewa.com',
  'https://www.subhabhumisewa.com',
  'https://subtle-wisp-ba2afa.netlify.app',
  'http://localhost:3000',
  'http://127.0.0.1:5500'
];

app.use(cors({
  origin: function(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 4. MongoDB Injection Protection
app.use(mongoSanitize());

// 5. XSS Protection
app.use(xss());

// ── DATABASE ──
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB Connected!'))
  .catch(err => console.log('❌ MongoDB Error:', err.message));

// ── MODELS ──
const UserSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone: { type: String, trim: true },
  password: { type: String, required: true, minlength: 8, select: false },
  role: { type: String, enum: ['admin', 'agent', 'user'], default: 'user' },
  isActive: { type: Boolean, default: true },
  loginAttempts: { type: Number, default: 0 },
  lockUntil: { type: Date }
}, { timestamps: true });

UserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

const User = mongoose.model('User', UserSchema);

const PropertySchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 200 },
  description: { type: String, maxlength: 2000 },
  price: { type: Number, required: true, min: 0 },
  priceNepali: { type: String, trim: true },
  negotiable: { type: Boolean, default: false },
  location: {
    address: { type: String, required: true, trim: true },
    city: { type: String, default: 'Kathmandu', trim: true },
    area: { type: String, trim: true },
    mapUrl: { type: String }
  },
  type: { type: String, enum: ['land', 'house', 'apartment', 'commercial', 'other'], required: true },
  status: { type: String, enum: ['sale', 'rent', 'sold', 'rented'], default: 'sale' },
  area: { value: Number, unit: { type: String, default: 'anna' } },
  bedrooms: { type: Number, default: 0, min: 0 },
  bathrooms: { type: Number, default: 0, min: 0 },
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

const InquirySchema = new mongoose.Schema({
  property: { type: mongoose.Schema.Types.ObjectId, ref: 'Property' },
  propertyTitle: { type: String, trim: true },
  name: { type: String, required: true, trim: true, maxlength: 100 },
  phone: { type: String, required: true, trim: true, maxlength: 20 },
  email: { type: String, trim: true, lowercase: true },
  message: { type: String, maxlength: 1000 },
  status: { type: String, enum: ['new', 'contacted', 'closed'], default: 'new' },
  isRead: { type: Boolean, default: false },
  ipAddress: { type: String }
}, { timestamps: true });

const Inquiry = mongoose.model('Inquiry', InquirySchema);

// ── AUTH MIDDLEWARE ──
const protect = async (req, res, next) => {
  try {
    let token;
    if (req.headers.authorization?.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }
    if (!token) return res.status(401).json({ success: false, message: 'Please login first' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret_change_this');
    req.user = await User.findById(decoded.id).select('-password');
    if (!req.user || !req.user.isActive) {
      return res.status(401).json({ success: false, message: 'User not found or inactive' });
    }
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
};

const adminOnly = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Admin access required' });
  }
  next();
};

// ── INPUT VALIDATION ──
function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
function validatePhone(phone) {
  return /^[0-9+\-\s]{7,15}$/.test(phone);
}
function sanitizeString(str) {
  if (!str) return '';
  return str.replace(/<[^>]*>/g, '').trim();
}

// ── EMAIL ──
async function sendEmail(to, subject, html) {
  try {
    if (!process.env.EMAIL_USER || process.env.EMAIL_USER.includes('your_')) return;
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com', port: 587, secure: false,
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
      tls: { rejectUnauthorized: false }
    });
    await transporter.sendMail({ from: `"Subha Bhumi Sewa" <${process.env.EMAIL_USER}>`, to, subject, html });
    console.log('✅ Email sent to:', to);
  } catch (err) {
    console.log('📧 Email error:', err.message);
  }
}

// ── HOME ──
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: '🏠 Subha Bhumi Sewa API — Secured & Running!',
    version: '2.0.0',
    security: ['Helmet', 'Rate Limiting', 'CORS', 'XSS Protection', 'MongoDB Sanitize', 'Input Validation']
  });
});

// ── AUTH ROUTES ──
app.post('/api/auth/register', authLimiter, async (req, res) => {
  try {
    const { name, email, phone, password, role } = req.body;
    // Validation
    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Name, email and password required' });
    }
    if (!validateEmail(email)) {
      return res.status(400).json({ success: false, message: 'Invalid email format' });
    }
    if (password.length < 8) {
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters' });
    }
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(400).json({ success: false, message: 'Email already exists' });
    const user = await User.create({
      name: sanitizeString(name),
      email: email.toLowerCase(),
      phone: sanitizeString(phone),
      password,
      role: role === 'admin' ? 'user' : (role || 'user') // prevent self-promotion to admin
    });
    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET || 'fallback_secret',
      { expiresIn: '30d' }
    );
    res.status(201).json({
      success: true,
      message: 'Account created!',
      token,
      user: { id: user._id, name: user.name, email: user.email, role: user.role }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.post('/api/auth/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password required' });
    }
    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
    // Check if locked
    if (user.lockUntil && user.lockUntil > Date.now()) {
      return res.status(401).json({ success: false, message: 'Account locked. Try again later.' });
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      // Increment login attempts
      user.loginAttempts = (user.loginAttempts || 0) + 1;
      if (user.loginAttempts >= 5) {
        user.lockUntil = new Date(Date.now() + 30 * 60 * 1000); // lock 30 min
        user.loginAttempts = 0;
      }
      await user.save({ validateBeforeSave: false });
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
    // Reset attempts on success
    user.loginAttempts = 0;
    user.lockUntil = undefined;
    user.lastLogin = new Date();
    await user.save({ validateBeforeSave: false });
    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET || 'fallback_secret',
      { expiresIn: '30d' }
    );
    res.json({
      success: true,
      token,
      user: { id: user._id, name: user.name, email: user.email, role: user.role }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.get('/api/auth/me', protect, (req, res) => {
  res.json({ success: true, user: req.user });
});

// ── PROPERTY ROUTES ──
app.get('/api/properties', async (req, res) => {
  try {
    const { type, status, city, area, featured, search, page = 1, limit = 12 } = req.query;
    const limitNum = Math.min(parseInt(limit) || 12, 50); // max 50
    const pageNum = Math.max(parseInt(page) || 1, 1);
    let query = { isActive: true };
    if (type && ['land','house','apartment','commercial','other'].includes(type)) query.type = type;
    if (status && ['sale','rent','sold','rented'].includes(status)) query.status = status;
    if (city) query['location.city'] = new RegExp(sanitizeString(city), 'i');
    if (area) query['location.area'] = new RegExp(sanitizeString(area), 'i');
    if (featured === 'true') query.featured = true;
    if (search) {
      const s = sanitizeString(search);
      query.$or = [
        { title: new RegExp(s, 'i') },
        { 'location.address': new RegExp(s, 'i') },
        { 'location.area': new RegExp(s, 'i') }
      ];
    }
    const total = await Property.countDocuments(query);
    const properties = await Property.find(query)
      .sort({ featured: -1, createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .select('-__v');
    res.json({ success: true, count: properties.length, total, pages: Math.ceil(total / limitNum), data: properties });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.get('/api/properties/featured', async (req, res) => {
  try {
    const properties = await Property.find({ featured: true, isActive: true }).limit(6).select('-__v');
    res.json({ success: true, data: properties });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.get('/api/properties/:id', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid property ID' });
    }
    const property = await Property.findById(req.params.id);
    if (!property || !property.isActive) {
      return res.status(404).json({ success: false, message: 'Property not found' });
    }
    await Property.findByIdAndUpdate(req.params.id, { $inc: { views: 1 } });
    res.json({ success: true, data: property });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.post('/api/properties', protect, adminOnly, async (req, res) => {
  try {
    const { title, price, location } = req.body;
    if (!title || !price || !location?.address) {
      return res.status(400).json({ success: false, message: 'Title, price and address required' });
    }
    const property = await Property.create({
      ...req.body,
      title: sanitizeString(req.body.title),
      description: sanitizeString(req.body.description)
    });
    res.status(201).json({ success: true, data: property });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

app.put('/api/properties/:id', protect, adminOnly, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid property ID' });
    }
    const property = await Property.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!property) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: property });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

app.delete('/api/properties/:id', protect, adminOnly, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid property ID' });
    }
    await Property.findByIdAndUpdate(req.params.id, { isActive: false });
    res.json({ success: true, message: 'Property removed!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ── INQUIRY ROUTES ──
app.post('/api/inquiries', inquiryLimiter, async (req, res) => {
  try {
    const { name, phone, email, message, propertyTitle } = req.body;
    // Validation
    if (!name || !phone) {
      return res.status(400).json({ success: false, message: 'Name and phone required' });
    }
    if (!validatePhone(phone)) {
      return res.status(400).json({ success: false, message: 'Invalid phone number' });
    }
    if (email && !validateEmail(email)) {
      return res.status(400).json({ success: false, message: 'Invalid email format' });
    }
    const inquiry = await Inquiry.create({
      name: sanitizeString(name),
      phone: sanitizeString(phone),
      email: email ? email.toLowerCase() : undefined,
      message: sanitizeString(message),
      propertyTitle: sanitizeString(propertyTitle),
      property: req.body.property || undefined,
      ipAddress: req.ip,
      source: 'website'
    });
    // Email notification
    await sendEmail(
      process.env.EMAIL_USER,
      `🏠 New Inquiry: ${propertyTitle || 'General'}`,
      `<h2 style="color:#0a2463">New Property Inquiry</h2>
       <p><b>Name:</b> ${name}</p>
       <p><b>Phone:</b> ${phone}</p>
       <p><b>Email:</b> ${email || 'Not provided'}</p>
       <p><b>Property:</b> ${propertyTitle || 'General'}</p>
       <p><b>Message:</b> ${message || 'No message'}</p>
       <p><b>Time:</b> ${new Date().toLocaleString()}</p>
       <hr/>
       <p><a href="https://wa.me/9801306673">Reply via WhatsApp</a></p>`
    );
    res.status(201).json({ success: true, message: 'Inquiry sent successfully!' });
  } catch (err) {
    res.status(400).json({ success: false, message: 'Server error' });
  }
});

app.get('/api/inquiries', protect, adminOnly, async (req, res) => {
  try {
    const { status, page = 1 } = req.query;
    let query = {};
    if (status) query.status = status;
    const inquiries = await Inquiry.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * 20)
      .limit(20)
      .select('-ipAddress');
    const total = await Inquiry.countDocuments(query);
    const unread = await Inquiry.countDocuments({ isRead: false });
    res.json({ success: true, count: inquiries.length, total, unread, data: inquiries });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.put('/api/inquiries/:id/read', protect, adminOnly, async (req, res) => {
  try {
    await Inquiry.findByIdAndUpdate(req.params.id, { isRead: true, status: 'contacted' });
    res.json({ success: true, message: 'Marked as read' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ── STATS ──
app.get('/api/stats', protect, adminOnly, async (req, res) => {
  try {
    const [total, forSale, forRent, sold, inquiries, unread] = await Promise.all([
      Property.countDocuments({ isActive: true }),
      Property.countDocuments({ status: 'sale', isActive: true }),
      Property.countDocuments({ status: 'rent', isActive: true }),
      Property.countDocuments({ status: 'sold' }),
      Inquiry.countDocuments(),
      Inquiry.countDocuments({ isRead: false })
    ]);
    res.json({ success: true, data: { total, forSale, forRent, sold, inquiries, unread } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ── ERROR HANDLERS ──
app.use((err, req, res, next) => {
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({ success: false, message: 'Access denied' });
  }
  console.error('Error:', err.message);
  res.status(500).json({ success: false, message: 'Internal server error' });
});

app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// ── START ──
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`
🚀 Subha Bhumi Sewa API — SECURED!
📡 Port: ${PORT}
🔒 Security: Helmet + Rate Limit + CORS + XSS + Sanitize + Validation
🏠 Ready!
  `);
});
