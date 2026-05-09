// backend/server.js
// Main server: Express + Socket.IO + MySQL

require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const db = require('./config/db');

const app = express();
const server = http.createServer(app);

// ─── CORS Config ────────────────────────────────────
const allowedOrigins = [
  process.env.FRONTEND_URL || 'http://localhost:5500',
  'http://127.0.0.1:5500',
  'http://localhost:3000',
  'http://localhost:5173'
];

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
};

// ─── Socket.IO ───────────────────────────────────────
const io = new Server(server, {
  cors: corsOptions,
  transports: ['websocket', 'polling']
});

// ─── Middleware ──────────────────────────────────────
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api/', limiter);

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ─── Routes ──────────────────────────────────────────
app.use('/api/rooms', require('./routes/rooms'));
app.use('/api/files', require('./routes/files'));
app.use('/api/admin', require('./routes/admin'));

app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date() }));

// ─── In-memory room state ─────────────────────────────
// room_code -> Set of { socketId, username }
const roomUsers = new Map();

// ─── Socket.IO Events ────────────────────────────────
io.on('connection', (socket) => {
  console.log(`🔌 Connected: ${socket.id}`);

  // User joins a room
  socket.on('join_room', async ({ room_code, username }) => {
    if (!room_code || !username) return;

    const code = room_code.toUpperCase();
    socket.join(code);
    socket.room_code = code;
    socket.username = username;

    // Track in memory
    if (!roomUsers.has(code)) roomUsers.set(code, new Map());
    roomUsers.get(code).set(socket.id, username);

    // Update DB
    try {
      const [rooms] = await db.query(`SELECT id FROM rooms WHERE room_code = ?`, [code]);
      if (rooms.length > 0) {
        await db.query(
          `INSERT INTO room_participants (room_id, room_code, username, socket_id, is_online) VALUES (?, ?, ?, ?, TRUE)
           ON DUPLICATE KEY UPDATE is_online = TRUE, socket_id = ?, left_at = NULL`,
          [rooms[0].id, code, username, socket.id, socket.id]
        );
        await db.query(`UPDATE rooms SET last_activity = NOW(), current_participants = ? WHERE room_code = ?`,
          [roomUsers.get(code).size, code]);
        await db.query(
          `INSERT INTO visitor_logs (username, room_code, event_type) VALUES (?, ?, 'join')`,
          [username, code]
        );
      }
    } catch (e) { console.error('DB join error:', e.message); }

    // Notify room
    const users = Array.from(roomUsers.get(code).values());
    socket.to(code).emit('user_joined', { username, users });
    io.to(code).emit('update_users', users);
    socket.emit('joined_room', { room_code: code, users });

    // System message
    io.to(code).emit('system_message', {
      text: `${username} joined the room`,
      timestamp: new Date().toISOString()
    });
  });

  // Chat message
  socket.on('send_message', async ({ room_code, message, username }) => {
    if (!room_code || !message || !username) return;
    const code = room_code.toUpperCase();

    const msgData = {
      username,
      message,
      timestamp: new Date().toISOString(),
      type: 'text'
    };

    // Optionally save to DB
    if (process.env.RETAIN_CHAT_LOGS === 'true') {
      try {
        const [rooms] = await db.query(`SELECT id FROM rooms WHERE room_code = ?`, [code]);
        if (rooms.length > 0) {
          await db.query(
            `INSERT INTO chat_logs (room_id, room_code, username, message, message_type) VALUES (?, ?, ?, ?, 'text')`,
            [rooms[0].id, code, username, message]
          );
        }
      } catch (e) { console.error('Chat log error:', e.message); }
    }

    io.to(code).emit('receive_message', msgData);
  });

  // File shared notification
  socket.on('file_shared', ({ room_code, file_info, username }) => {
    if (!room_code) return;
    io.to(room_code.toUpperCase()).emit('file_received', { ...file_info, username });
  });

  // Typing indicator
  socket.on('typing', ({ room_code, username }) => {
    if (!room_code) return;
    socket.to(room_code.toUpperCase()).emit('user_typing', { username });
  });

  socket.on('stop_typing', ({ room_code, username }) => {
    if (!room_code) return;
    socket.to(room_code.toUpperCase()).emit('user_stop_typing', { username });
  });

  // Disconnect
  socket.on('disconnect', async () => {
    const code = socket.room_code;
    const username = socket.username;
    if (!code || !username) return;

    if (roomUsers.has(code)) {
      roomUsers.get(code).delete(socket.id);
      if (roomUsers.get(code).size === 0) roomUsers.delete(code);
    }

    try {
      await db.query(
        `UPDATE room_participants SET is_online = FALSE, left_at = NOW() WHERE socket_id = ?`,
        [socket.id]
      );
      await db.query(
        `INSERT INTO visitor_logs (username, room_code, event_type) VALUES (?, ?, 'leave')`,
        [username, code]
      );
      const size = roomUsers.get(code)?.size || 0;
      await db.query(`UPDATE rooms SET current_participants = ? WHERE room_code = ?`, [size, code]);
    } catch (e) { console.error('DB disconnect error:', e.message); }

    const users = Array.from(roomUsers.get(code)?.values() || []);
    io.to(code).emit('user_left', { username, users });
    io.to(code).emit('update_users', users);
    io.to(code).emit('system_message', {
      text: `${username} left the room`,
      timestamp: new Date().toISOString()
    });

    console.log(`🔌 Disconnected: ${socket.id} (${username})`);
  });
});

// ─── Room Expiry Cleanup (every 5 mins) ──────────────
setInterval(async () => {
  try {
    await db.query(
      `UPDATE rooms SET is_active = FALSE WHERE expires_at <= NOW() AND is_active = TRUE`
    );
  } catch (e) { console.error('Expiry cleanup error:', e.message); }
}, 5 * 60 * 1000);

// ─── Start Server ─────────────────────────────────────
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
});
