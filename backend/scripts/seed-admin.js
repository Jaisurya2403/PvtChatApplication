// backend/scripts/seed-admin.js
// Run: node scripts/seed-admin.js
// Creates or resets the default admin user

require('dotenv').config({ path: '../.env' });
const bcrypt = require('bcrypt');
const mysql = require('mysql2/promise');

async function seed() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'ephemeral_chat'
  });

  const password = 'Admin@1234';
  const hash = await bcrypt.hash(password, 10);

  await conn.execute(`
    INSERT INTO admin_users (username, password_hash, email, role)
    VALUES ('admin', ?, 'admin@ephemeral.chat', 'super_admin')
    ON DUPLICATE KEY UPDATE password_hash = ?, updated_at = NOW()
  `, [hash, hash]);

  console.log('✅ Admin user seeded.');
  console.log('   Username: admin');
  console.log('   Password: Admin@1234');
  console.log('   ⚠ CHANGE THIS PASSWORD AFTER FIRST LOGIN!');

  await conn.end();
}

seed().catch(e => { console.error(e); process.exit(1); });
