const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cors = require('cors');
const morgan = require('morgan');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();
const server = http.createServer(app);

// Socket.io for real-time chat
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || '*',
    methods: ['GET', 'POST']
  }
});

// ── MIDDLEWARE ──
app.use(cors({ origin: process.env.CLIENT_URL || '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// Static files for uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── DATABASE CONNECTION ──
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB Connected — Subha Bhumi Sewa Database'))
  .catch(err => console.error('❌ MongoDB Error:', err));

// ── ROUTES ──
app.use('/api/auth',       require('./routes/auth'));
app.use('/api/properties', require('./routes/properties'));
app.use('/api/inquiries',  require('./routes/inquiries'));
app.use('/api/users',      require('./routes/users'));
app.use('/api/upload',     require('./routes/upload'));

// ── HOME ROUTE ──
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: '🏠 Subha Bhumi Sewa API is Running!',
    version: '1.0.0',
    endpoints: {
      auth:       '/api/auth',
      properties: '/api/properties',
      inquiries:  '/api/inquiries',
      users:      '/api/users',
      upload:     '/api/upload'
    }
  });
});

// ── SOCKET.IO REAL-TIME CHAT ──
const activeUsers = new Map();

io.on('connection', (socket) => {
  console.log('👤 User connected:', socket.id);

  // User joins
  socket.on('user_join', (userData) => {
    activeUsers.set(socket.id, userData);
    io.emit('active_users', activeUsers.size);
    console.log(`✅ ${userData.name || 'Guest'} joined`);
  });

  // Chat message
  socket.on('send_message', (data) => {
    const message = {
      id: Date.now(),
      sender: data.sender || 'Guest',
      message: data.message,
      timestamp: new Date().toISOString(),
      room: data.room || 'general'
    };
    io.to(data.room || 'general').emit('receive_message', message);
  });

  // Join specific property room
  socket.on('join_room', (room) => {
    socket.join(room);
    console.log(`📍 User joined room: ${room}`);
  });

  // Property inquiry notification
  socket.on('new_inquiry', (data) => {
    io.emit('inquiry_notification', {
      message: `New inquiry for: ${data.propertyName}`,
      from: data.name,
      phone: data.phone
    });
  });

  // Disconnect
  socket.on('disconnect', () => {
    activeUsers.delete(socket.id);
    io.emit('active_users', activeUsers.size);
    console.log('👋 User disconnected:', socket.id);
  });
});

// ── ERROR HANDLER ──
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: err.message || 'Server Error'
  });
});

// ── 404 HANDLER ──
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`
  });
});

// ── START SERVER ──
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`
🚀 Subha Bhumi Sewa Server Running!
📡 Port: ${PORT}
🌐 URL: http://localhost:${PORT}
🏠 Real Estate API Ready!
  `);
});
