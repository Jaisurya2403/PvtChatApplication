-- =====================================================
-- Ephemeral Private Chat & Secure File Sharing Platform
-- MySQL Schema
-- =====================================================

CREATE DATABASE IF NOT EXISTS ephemeral_chat;
USE ephemeral_chat;

-- =====================================================
-- ADMIN USERS
-- =====================================================
CREATE TABLE IF NOT EXISTS admin_users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  email VARCHAR(100),
  role ENUM('super_admin', 'moderator') DEFAULT 'moderator',
  last_login DATETIME,
  is_active BOOLEAN DEFAULT TRUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_username (username)
);

-- =====================================================
-- ROOMS
-- =====================================================
CREATE TABLE IF NOT EXISTS rooms (
  id INT AUTO_INCREMENT PRIMARY KEY,
  room_code VARCHAR(20) NOT NULL UNIQUE,
  room_name VARCHAR(100),
  password_hash VARCHAR(255) DEFAULT NULL,
  is_password_protected BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  is_disabled BOOLEAN DEFAULT FALSE,        -- admin can disable abusive rooms
  disabled_reason TEXT DEFAULT NULL,
  max_participants INT DEFAULT 50,
  current_participants INT DEFAULT 0,
  expires_at DATETIME NOT NULL,
  last_activity DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(100),
  INDEX idx_room_code (room_code),
  INDEX idx_is_active (is_active),
  INDEX idx_expires_at (expires_at),
  INDEX idx_created_at (created_at)
);

-- =====================================================
-- ROOM PARTICIPANTS
-- =====================================================
CREATE TABLE IF NOT EXISTS room_participants (
  id INT AUTO_INCREMENT PRIMARY KEY,
  room_id INT NOT NULL,
  room_code VARCHAR(20) NOT NULL,
  username VARCHAR(100) NOT NULL,
  socket_id VARCHAR(100),
  joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  left_at DATETIME DEFAULT NULL,
  is_online BOOLEAN DEFAULT TRUE,
  ip_address VARCHAR(45),
  user_agent TEXT,
  FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
  INDEX idx_room_id (room_id),
  INDEX idx_room_code (room_code),
  INDEX idx_joined_at (joined_at),
  INDEX idx_is_online (is_online)
);

-- =====================================================
-- FILES
-- =====================================================
CREATE TABLE IF NOT EXISTS files (
  id INT AUTO_INCREMENT PRIMARY KEY,
  room_id INT NOT NULL,
  room_code VARCHAR(20) NOT NULL,
  uploader_username VARCHAR(100) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  stored_name VARCHAR(255) NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  file_size BIGINT NOT NULL,
  mime_type VARCHAR(100),
  file_type ENUM('image', 'document', 'video', 'audio', 'archive', 'other') DEFAULT 'other',
  download_count INT DEFAULT 0,
  is_deleted BOOLEAN DEFAULT FALSE,
  uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME,
  FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
  INDEX idx_room_id (room_id),
  INDEX idx_room_code (room_code),
  INDEX idx_uploaded_at (uploaded_at)
);

-- =====================================================
-- VISITOR LOGS / USER SESSIONS
-- =====================================================
CREATE TABLE IF NOT EXISTS visitor_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  session_id VARCHAR(100),
  username VARCHAR(100),
  room_code VARCHAR(20),
  event_type ENUM('join', 'leave', 'create_room', 'file_upload', 'reconnect') NOT NULL,
  ip_address VARCHAR(45),
  user_agent TEXT,
  metadata JSON,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_created_at (created_at),
  INDEX idx_username (username),
  INDEX idx_event_type (event_type),
  INDEX idx_room_code (room_code)
);

-- =====================================================
-- MODERATION LOGS (transparent admin actions)
-- =====================================================
CREATE TABLE IF NOT EXISTS moderation_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  admin_id INT NOT NULL,
  admin_username VARCHAR(50),
  action_type ENUM('disable_room', 'enable_room', 'delete_file', 'view_chat_log', 'force_expire_room', 'warn_user') NOT NULL,
  target_type ENUM('room', 'file', 'user') NOT NULL,
  target_id VARCHAR(100),
  reason TEXT,
  details JSON,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (admin_id) REFERENCES admin_users(id),
  INDEX idx_admin_id (admin_id),
  INDEX idx_action_type (action_type),
  INDEX idx_created_at (created_at)
);

-- =====================================================
-- CHAT LOGS (only retained if moderation mode enabled)
-- =====================================================
CREATE TABLE IF NOT EXISTS chat_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  room_id INT NOT NULL,
  room_code VARCHAR(20) NOT NULL,
  username VARCHAR(100) NOT NULL,
  message TEXT NOT NULL,
  message_type ENUM('text', 'file', 'system') DEFAULT 'text',
  is_flagged BOOLEAN DEFAULT FALSE,
  sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
  INDEX idx_room_id (room_id),
  INDEX idx_room_code (room_code),
  INDEX idx_sent_at (sent_at)
);

-- =====================================================
-- SUBSCRIPTIONS (future-ready)
-- =====================================================
CREATE TABLE IF NOT EXISTS subscriptions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_identifier VARCHAR(100),
  email VARCHAR(100),
  plan_type ENUM('free', 'pro', 'team', 'enterprise') DEFAULT 'free',
  status ENUM('active', 'cancelled', 'expired', 'trial') DEFAULT 'active',
  max_rooms INT DEFAULT 1,
  max_file_size_mb INT DEFAULT 10,
  max_participants INT DEFAULT 10,
  started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME,
  stripe_customer_id VARCHAR(100),
  stripe_subscription_id VARCHAR(100),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_identifier (user_identifier),
  INDEX idx_status (status)
);

-- =====================================================
-- ANALYTICS QUERIES
-- =====================================================

-- Today's user count
-- SELECT COUNT(DISTINCT username) AS today_users FROM visitor_logs WHERE DATE(created_at) = CURDATE() AND event_type = 'join';

-- Monthly user count
-- SELECT COUNT(DISTINCT username) AS monthly_users FROM visitor_logs WHERE YEAR(created_at) = YEAR(CURDATE()) AND MONTH(created_at) = MONTH(CURDATE()) AND event_type = 'join';

-- Today's room count
-- SELECT COUNT(*) AS today_rooms FROM rooms WHERE DATE(created_at) = CURDATE();

-- Monthly room count
-- SELECT COUNT(*) AS monthly_rooms FROM rooms WHERE YEAR(created_at) = YEAR(CURDATE()) AND MONTH(created_at) = MONTH(CURDATE());

-- Active rooms
-- SELECT COUNT(*) AS active_rooms FROM rooms WHERE is_active = TRUE AND is_disabled = FALSE AND expires_at > NOW();

-- Active users
-- SELECT COUNT(DISTINCT username) AS active_users FROM room_participants WHERE is_online = TRUE;

-- Files uploaded today
-- SELECT COUNT(*) AS today_files FROM files WHERE DATE(uploaded_at) = CURDATE();

-- =====================================================
-- DEFAULT ADMIN USER (password: Admin@1234)
-- Change this immediately after first login!
-- =====================================================
INSERT IGNORE INTO admin_users (username, password_hash, email, role)
VALUES ('admin', '$2b$10$rQZ7K8mNpL2vX3wY4uI5OeKjH6gF1dC0bA9sE7tM2nR4oP8qS6uW', 'admin@ephemeral.chat', 'super_admin');
