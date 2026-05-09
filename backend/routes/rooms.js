// backend/routes/rooms.js
// Room creation, joining, expiry management

const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const db = require('../config/db');
require('dotenv').config();

const ROOM_EXPIRY_HOURS = parseInt(process.env.ROOM_EXPIRY_HOURS) || 24;

// Helper: generate unique room code
function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// POST /api/rooms/create
router.post('/create', async (req, res) => {
  const { username, room_name, password } = req.body;
  if (!username) return res.status(400).json({ error: 'Username is required.' });

  let room_code;
  let tries = 0;
  // Ensure unique code
  while (tries < 10) {
    room_code = generateRoomCode();
    const [existing] = await db.query('SELECT id FROM rooms WHERE room_code = ?', [room_code]);
    if (existing.length === 0) break;
    tries++;
  }

  const password_hash = password ? await bcrypt.hash(password, 10) : null;
  const expires_at = new Date(Date.now() + ROOM_EXPIRY_HOURS * 3600 * 1000);

  try {
    const [result] = await db.query(
      `INSERT INTO rooms (room_code, room_name, password_hash, is_password_protected, created_by, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [room_code, room_name || `Room ${room_code}`, password_hash, !!password, username, expires_at]
    );

    // Log event
    await db.query(
      `INSERT INTO visitor_logs (username, room_code, event_type, metadata) VALUES (?, ?, 'create_room', ?)`,
      [username, room_code, JSON.stringify({ room_id: result.insertId })]
    );

    res.json({
      success: true,
      room_code,
      room_name: room_name || `Room ${room_code}`,
      is_password_protected: !!password,
      expires_at
    });
  } catch (err) {
    console.error('Create room error:', err);
    res.status(500).json({ error: 'Failed to create room.' });
  }
});

// POST /api/rooms/join
router.post('/join', async (req, res) => {
  const { username, room_code, password } = req.body;
  if (!username || !room_code) return res.status(400).json({ error: 'Username and room code required.' });

  try {
    const [rooms] = await db.query(
      `SELECT * FROM rooms WHERE room_code = ? AND is_active = TRUE AND is_disabled = FALSE AND expires_at > NOW()`,
      [room_code.toUpperCase()]
    );

    if (rooms.length === 0) return res.status(404).json({ error: 'Room not found or has expired.' });

    const room = rooms[0];

    if (room.is_password_protected) {
      if (!password) return res.status(401).json({ error: 'This room requires a password.' });
      const valid = await bcrypt.compare(password, room.password_hash);
      if (!valid) return res.status(401).json({ error: 'Incorrect room password.' });
    }

    res.json({
      success: true,
      room_code: room.room_code,
      room_name: room.room_name,
      is_password_protected: room.is_password_protected,
      expires_at: room.expires_at
    });
  } catch (err) {
    console.error('Join room error:', err);
    res.status(500).json({ error: 'Failed to join room.' });
  }
});

// GET /api/rooms/:code/info
router.get('/:code/info', async (req, res) => {
  const { code } = req.params;
  try {
    const [rooms] = await db.query(
      `SELECT r.room_code, r.room_name, r.is_password_protected, r.expires_at, r.is_active,
       COUNT(rp.id) as participant_count
       FROM rooms r
       LEFT JOIN room_participants rp ON r.room_code = rp.room_code AND rp.is_online = TRUE
       WHERE r.room_code = ? GROUP BY r.id`,
      [code.toUpperCase()]
    );
    if (rooms.length === 0) return res.status(404).json({ error: 'Room not found.' });
    res.json(rooms[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get room info.' });
  }
});

module.exports = router;
