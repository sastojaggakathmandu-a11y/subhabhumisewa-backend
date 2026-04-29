# 🏠 Subha Bhumi Sewa — Backend API

Real Estate API for subhabhumisewa.com built with Node.js, Express & MongoDB.

## 📁 Project Structure
```
subhabhumi-backend/
├── server.js          ← Main server file
├── package.json       ← Dependencies
├── .env.example       ← Environment variables template
├── models/
│   ├── Property.js    ← Property database model
│   └── Models.js      ← User & Inquiry models
├── middleware/
│   └── auth.js        ← JWT authentication
├── routes/
│   ├── auth.js        ← Login/Register
│   ├── properties.js  ← Property CRUD
│   ├── inquiries.js   ← Customer inquiries
│   ├── users.js       ← User management
│   └── upload.js      ← Photo upload (Cloudinary)
└── uploads/           ← Local upload folder
```

## 🚀 Setup Instructions

### Step 1 — Install Node.js
Download from: https://nodejs.org (LTS version)

### Step 2 — Install Dependencies
```bash
cd subhabhumi-backend
npm install
```

### Step 3 — Setup MongoDB (Free)
1. Go to: https://mongodb.com/atlas
2. Create free account
3. Create cluster → Get connection string
4. Add to .env file

### Step 4 — Setup Cloudinary (Free Photo Storage)
1. Go to: https://cloudinary.com
2. Create free account
3. Get Cloud Name, API Key, API Secret
4. Add to .env file

### Step 5 — Create .env file
```bash
cp .env.example .env
# Edit .env with your values
```

### Step 6 — Run Server
```bash
# Development
npm run dev

# Production
npm start
```

## 📡 API Endpoints

### Auth
| Method | URL | Description |
|--------|-----|-------------|
| POST | /api/auth/register | Register user |
| POST | /api/auth/login | Login |
| GET | /api/auth/me | Current user |

### Properties
| Method | URL | Description |
|--------|-----|-------------|
| GET | /api/properties | Get all properties |
| GET | /api/properties/:id | Get single property |
| POST | /api/properties | Add property (Admin) |
| PUT | /api/properties/:id | Update (Admin) |
| DELETE | /api/properties/:id | Delete (Admin) |
| GET | /api/properties/featured/list | Featured listings |
| GET | /api/properties/search/query?q=gokarneshwar | Search |
| GET | /api/properties/stats/summary | Stats (Admin) |

### Inquiries
| Method | URL | Description |
|--------|-----|-------------|
| POST | /api/inquiries | Submit inquiry |
| GET | /api/inquiries | Get all (Admin) |
| PUT | /api/inquiries/:id/read | Mark as read |
| DELETE | /api/inquiries/:id | Delete |

### Upload
| Method | URL | Description |
|--------|-----|-------------|
| POST | /api/upload/image | Upload single photo |
| POST | /api/upload/images | Upload multiple photos |
| DELETE | /api/upload/:publicId | Delete photo |

## 🌐 Deploy to Render (Free)
1. Push code to GitHub
2. Go to render.com
3. New → Web Service
4. Connect GitHub repo
5. Add environment variables
6. Deploy!

## 📞 Support
- WhatsApp: 9801306673
- Website: subhabhumisewa.com
