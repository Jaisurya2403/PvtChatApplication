// backend/routes/files.js
// File upload and download routes

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const db = require('../config/db');
const upload = require('../middleware/upload');

// POST /api/files/upload
router.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

  const { room_code, username } = req.body;
  if (!room_code || !username) return res.status(400).json({ error: 'room_code and username required.' });

  try {
    // Verify room exists and is active
    const [rooms] = await db.query(
      `SELECT id FROM rooms WHERE room_code = ? AND is_active = TRUE AND expires_at > NOW()`,
      [room_code.toUpperCase()]
    );
    if (rooms.length === 0) return res.status(404).json({ error: 'Room not found or expired.' });

    const room = rooms[0];
    const mime = req.file.mimetype;
    let file_type = 'other';
    if (mime.startsWith('image/')) file_type = 'image';
    else if (mime.startsWith('video/')) file_type = 'video';
    else if (mime.startsWith('audio/')) file_type = 'audio';
    else if (mime === 'application/pdf' || mime === 'text/plain') file_type = 'document';
    else if (mime.includes('zip')) file_type = 'archive';

    const [result] = await db.query(
      `INSERT INTO files (room_id, room_code, uploader_username, original_name, stored_name, file_path, file_size, mime_type, file_type, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 24 HOUR))`,
      [room.id, room_code.toUpperCase(), username, req.file.originalname, req.file.filename, req.file.path, req.file.size, mime, file_type]
    );

    // Log event
    await db.query(
      `INSERT INTO visitor_logs (username, room_code, event_type, metadata) VALUES (?, ?, 'file_upload', ?)`,
      [username, room_code, JSON.stringify({ file_id: result.insertId, filename: req.file.originalname })]
    );

    res.json({
      success: true,
      file_id: result.insertId,
      original_name: req.file.originalname,
      file_size: req.file.size,
      file_type,
      mime_type: mime,
      download_url: `/api/files/download/${result.insertId}`
    });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Upload failed.' });
  }
});

// GET /api/files/download/:id
router.get('/download/:id', async (req, res) => {
  try {
    const [files] = await db.query(`SELECT * FROM files WHERE id = ? AND is_deleted = FALSE`, [req.params.id]);
    if (files.length === 0) return res.status(404).json({ error: 'File not found.' });

    const file = files[0];
    if (!fs.existsSync(file.file_path)) return res.status(404).json({ error: 'File not found on disk.' });

    await db.query(`UPDATE files SET download_count = download_count + 1 WHERE id = ?`, [file.id]);
    res.download(file.file_path, file.original_name);
  } catch (err) {
    res.status(500).json({ error: 'Download failed.' });
  }
});

// GET /api/files/room/:code - List files in a room
router.get('/room/:code', async (req, res) => {
  try {
    const [files] = await db.query(
      `SELECT id, original_name, file_size, file_type, uploader_username, uploaded_at, download_count
       FROM files WHERE room_code = ? AND is_deleted = FALSE ORDER BY uploaded_at DESC`,
      [req.params.code.toUpperCase()]
    );
    res.json(files);
  } catch (err) {
    res.status(500).json({ error: 'Failed to list files.' });
  }
});

module.exports = router;
