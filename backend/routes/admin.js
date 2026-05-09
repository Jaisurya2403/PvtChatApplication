// backend/routes/admin.js
// Admin authentication and dashboard analytics

const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { adminAuth } = require('../middleware/auth');
require('dotenv').config();

// POST /api/admin/login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required.' });

  try {
    const [admins] = await db.query(`SELECT * FROM admin_users WHERE username = ? AND is_active = TRUE`, [username]);
    if (admins.length === 0) return res.status(401).json({ error: 'Invalid credentials.' });

    const admin = admins[0];
    const valid = await bcrypt.compare(password, admin.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials.' });

    await db.query(`UPDATE admin_users SET last_login = NOW() WHERE id = ?`, [admin.id]);

    const token = jwt.sign(
      { id: admin.id, username: admin.username, role: admin.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );

    res.json({ success: true, token, username: admin.username, role: admin.role });
  } catch (err) {
    console.error('Admin login error:', err);
    res.status(500).json({ error: 'Login failed.' });
  }
});

// GET /api/admin/stats - Main dashboard stats
router.get('/stats', adminAuth, async (req, res) => {
  try {
    const queries = {
      today_users: `SELECT COUNT(DISTINCT username) AS count FROM visitor_logs WHERE DATE(created_at) = CURDATE() AND event_type = 'join'`,
      monthly_users: `SELECT COUNT(DISTINCT username) AS count FROM visitor_logs WHERE YEAR(created_at) = YEAR(CURDATE()) AND MONTH(created_at) = MONTH(CURDATE()) AND event_type = 'join'`,
      today_rooms: `SELECT COUNT(*) AS count FROM rooms WHERE DATE(created_at) = CURDATE()`,
      monthly_rooms: `SELECT COUNT(*) AS count FROM rooms WHERE YEAR(created_at) = YEAR(CURDATE()) AND MONTH(created_at) = MONTH(CURDATE())`,
      active_rooms: `SELECT COUNT(*) AS count FROM rooms WHERE is_active = TRUE AND is_disabled = FALSE AND expires_at > NOW()`,
      active_users: `SELECT COUNT(DISTINCT username) AS count FROM room_participants WHERE is_online = TRUE`,
      today_files: `SELECT COUNT(*) AS count FROM files WHERE DATE(uploaded_at) = CURDATE()`,
      monthly_files: `SELECT COUNT(*) AS count FROM files WHERE YEAR(uploaded_at) = YEAR(CURDATE()) AND MONTH(uploaded_at) = MONTH(CURDATE())`,
      total_rooms: `SELECT COUNT(*) AS count FROM rooms`,
      total_files: `SELECT COUNT(*) AS count FROM files`
    };

    const results = {};
    for (const [key, query] of Object.entries(queries)) {
      const [rows] = await db.query(query);
      results[key] = rows[0]?.count || 0;
    }

    res.json(results);
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ error: 'Failed to fetch stats.' });
  }
});

// GET /api/admin/rooms - List all rooms with metadata
router.get('/rooms', adminAuth, async (req, res) => {
  const { page = 1, limit = 20, filter = 'all' } = req.query;
  const offset = (page - 1) * limit;

  let whereClause = '';
  if (filter === 'active') whereClause = 'WHERE r.is_active = TRUE AND r.expires_at > NOW()';
  else if (filter === 'expired') whereClause = 'WHERE r.expires_at <= NOW()';
  else if (filter === 'disabled') whereClause = 'WHERE r.is_disabled = TRUE';

  try {
    const [rooms] = await db.query(
      `SELECT r.id, r.room_code, r.room_name, r.is_password_protected, r.is_active, r.is_disabled,
       r.disabled_reason, r.expires_at, r.last_activity, r.created_at, r.created_by,
       COUNT(rp.id) as total_participants,
       SUM(CASE WHEN rp.is_online = TRUE THEN 1 ELSE 0 END) as online_count
       FROM rooms r
       LEFT JOIN room_participants rp ON r.id = rp.room_id
       ${whereClause}
       GROUP BY r.id ORDER BY r.created_at DESC LIMIT ? OFFSET ?`,
      [parseInt(limit), parseInt(offset)]
    );

    const [[{ total }]] = await db.query(`SELECT COUNT(*) as total FROM rooms ${whereClause}`);

    res.json({ rooms, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch rooms.' });
  }
});

// POST /api/admin/rooms/:code/disable
router.post('/rooms/:code/disable', adminAuth, async (req, res) => {
  const { reason } = req.body;
  try {
    await db.query(
      `UPDATE rooms SET is_disabled = TRUE, disabled_reason = ? WHERE room_code = ?`,
      [reason || 'Disabled by admin', req.params.code]
    );
    await db.query(
      `INSERT INTO moderation_logs (admin_id, admin_username, action_type, target_type, target_id, reason) VALUES (?, ?, 'disable_room', 'room', ?, ?)`,
      [req.admin.id, req.admin.username, req.params.code, reason]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to disable room.' });
  }
});

// POST /api/admin/rooms/:code/enable
router.post('/rooms/:code/enable', adminAuth, async (req, res) => {
  try {
    await db.query(`UPDATE rooms SET is_disabled = FALSE, disabled_reason = NULL WHERE room_code = ?`, [req.params.code]);
    await db.query(
      `INSERT INTO moderation_logs (admin_id, admin_username, action_type, target_type, target_id, reason) VALUES (?, ?, 'enable_room', 'room', ?, 'Re-enabled by admin')`,
      [req.admin.id, req.admin.username, req.params.code]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to enable room.' });
  }
});

// GET /api/admin/analytics/daily - Daily stats for last 30 days
router.get('/analytics/daily', adminAuth, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT 
        DATE(created_at) as date,
        COUNT(DISTINCT CASE WHEN event_type = 'join' THEN username END) as users,
        COUNT(DISTINCT CASE WHEN event_type = 'create_room' THEN username END) as rooms
      FROM visitor_logs
      WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch daily analytics.' });
  }
});

// GET /api/admin/analytics/monthly - Monthly stats for last 12 months
router.get('/analytics/monthly', adminAuth, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT 
        YEAR(created_at) as year,
        MONTH(created_at) as month,
        DATE_FORMAT(created_at, '%b %Y') as label,
        COUNT(DISTINCT CASE WHEN event_type = 'join' THEN username END) as users,
        COUNT(DISTINCT CASE WHEN event_type = 'create_room' THEN username END) as rooms
      FROM visitor_logs
      WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
      GROUP BY YEAR(created_at), MONTH(created_at)
      ORDER BY year DESC, month DESC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch monthly analytics.' });
  }
});

// GET /api/admin/files - List uploaded files
router.get('/files', adminAuth, async (req, res) => {
  try {
    const [files] = await db.query(`
      SELECT f.id, f.room_code, f.original_name, f.file_size, f.file_type, 
             f.uploader_username, f.uploaded_at, f.download_count, f.is_deleted
      FROM files f ORDER BY f.uploaded_at DESC LIMIT 100
    `);
    res.json(files);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch files.' });
  }
});

// GET /api/admin/moderation-logs
router.get('/moderation-logs', adminAuth, async (req, res) => {
  try {
    const [logs] = await db.query(`SELECT * FROM moderation_logs ORDER BY created_at DESC LIMIT 100`);
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch logs.' });
  }
});

module.exports = router;
