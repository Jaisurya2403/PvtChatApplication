// frontend/js/config.js
// Change this to your deployed backend URL in production
// Include this script BEFORE api.js in HTML files for production

// Development (local):
// window.EPHEMERAL_API_URL = 'http://localhost:3001';

// Production (update with your Render URL):
// window.EPHEMERAL_API_URL = 'https://ephemeral-chat-backend.onrender.com';

// Auto-detect: use same origin for production, localhost for dev
(function() {
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    window.EPHEMERAL_API_URL = 'http://localhost:3001';
  } else {
    // ← REPLACE with your actual Render backend URL
    window.EPHEMERAL_API_URL = 'https://pvtchatapplication.onrender.com';
  }
  console.log('🌐 API URL:', window.EPHEMERAL_API_URL);
})();
