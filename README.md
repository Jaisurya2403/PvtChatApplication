# 🔒 Ephemeral — Private Chat & Secure File Sharing

A privacy-focused real-time chat with ephemeral rooms, file sharing, and a full admin dashboard.

---

## 📁 Project Structure

```
ephemeral-chat/
├── backend/
│   ├── config/db.js           MySQL connection pool
│   ├── middleware/auth.js      JWT admin auth
│   ├── middleware/upload.js    Multer file handler
│   ├── routes/rooms.js         Room create/join APIs
│   ├── routes/files.js         File upload/download
│   ├── routes/admin.js         Admin APIs + analytics
│   ├── scripts/seed-admin.js   Create default admin
│   ├── server.js               Express + Socket.IO
│   ├── package.json
│   └── .env.example
│
├── frontend/
│   ├── css/main.css            Global styles
│   ├── css/chat.css            Chat room styles
│   ├── css/admin.css           Admin dashboard
│   ├── js/api.js               API helpers + utils
│   ├── pages/username.html     Pick a username
│   ├── pages/create-room.html  Create a room
│   ├── pages/join-room.html    Join with code
│   ├── pages/chat.html         Chat room
│   ├── pages/admin-login.html  Admin login
│   ├── pages/admin-dashboard.html  Full dashboard
│   └── index.html              Landing page
│
└── schema/schema.sql           Full MySQL schema
```

---

## 🚀 Local Setup

### 1 — Install backend dependencies
```bash
cd backend && npm install
```

### 2 — Create MySQL database
```bash
mysql -u root -p < ../schema/schema.sql
```

### 3 — Configure environment
```bash
cp .env.example .env
# Edit .env — set DB credentials, JWT_SECRET, FRONTEND_URL
```

### 4 — Seed the admin user
```bash
node scripts/seed-admin.js
# Creates: admin / Admin@1234  ← CHANGE THIS after first login!
```

### 5 — Start backend
```bash
npm run dev    # development (nodemon)
npm start      # production
```

### 6 — Serve frontend
Open `frontend/index.html` in browser, or:
```bash
cd frontend && npx serve .
```
Make sure `window.EPHEMERAL_API_URL` in `frontend/js/api.js` matches your backend (default: `http://localhost:3001`).

---

## 🌐 Free Deployment

### Backend → Render.com
1. Push `backend/` to GitHub
2. Render → New Web Service → Connect repo
3. Build: `npm install` | Start: `node server.js`
4. Add all vars from `.env.example` as Environment Variables
5. Set `FRONTEND_URL` to your Vercel frontend URL

### Frontend → Vercel
1. Push `frontend/` to GitHub
2. Vercel → New Project → Root: `frontend/`
3. Before deploying, update `frontend/js/api.js` line 1:
   ```js
   const API_BASE = 'https://your-render-app.onrender.com';
   ```

### Free MySQL
- **PlanetScale** (planetscale.com) — MySQL-compatible, free tier. Remove FK constraints from schema.
- **Railway** (railway.app) — Real MySQL, generous free tier
- **Clever Cloud** (clever-cloud.com) — MySQL addon, free starter

---

## 🔐 Security Checklist
- [ ] Change default admin password after first login
- [ ] Use a strong `JWT_SECRET` (`openssl rand -hex 32`)
- [ ] Never commit `.env` to git
- [ ] Use HTTPS in production (Render/Vercel do this automatically)

---

## ✅ Testing Checklist

**User Flow**
- [ ] Create room → get unique code
- [ ] Join same room in another tab with code
- [ ] Real-time messages work
- [ ] Typing indicator appears
- [ ] File upload → file bubble shown in both tabs
- [ ] Leave room → notification shown
- [ ] Expired / disabled room → error message

**Admin Flow**
- [ ] Login at `/pages/admin-login.html` (admin / Admin@1234)
- [ ] Stats cards load correctly
- [ ] Rooms tab → filter by active/expired/disabled
- [ ] Disable a room → user can't join it
- [ ] Analytics chart renders
- [ ] Daily report table shows 30 days
- [ ] Moderation audit log records every action
- [ ] Logout works

---

## 🆘 Troubleshooting

| Issue | Fix |
|-------|-----|
| CORS error | Set `FRONTEND_URL` in `.env` to exact frontend origin |
| Socket won't connect | Check `SERVER_URL` in `chat.html` or `API_BASE` in `api.js` |
| MySQL connect fail | Verify credentials, ensure DB + tables exist |
| File upload fails | Ensure `uploads/` directory exists and is writable |
| Admin login fails | Run `node scripts/seed-admin.js` |
| Render cold start | Free tier sleeps after 15min — first request may take 30s |
