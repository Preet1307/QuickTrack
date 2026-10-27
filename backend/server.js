require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const db = require('./db');

const authRoutes = require('./routes/auth');
const logsRoutes = require('./routes/logs');
const devicesRoutes = require('./routes/devices');
const aiRoutes = require('./routes/ai');
const supplementsRoutes = require('./routes/supplements');
const { requireAuth } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;
let databaseInitialization;

function initializeDatabase() {
  if (!databaseInitialization) {
    databaseInitialization = db.initialize().catch(error => {
      databaseInitialization = null;
      throw error;
    });
  }
  return databaseInitialization;
}

app.use(cors());
app.use(express.json());
app.use('/api', (req, res, next) => {
  initializeDatabase().then(() => next(), next);
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/logs', requireAuth, logsRoutes);
app.use('/api/devices', requireAuth, devicesRoutes);
app.use('/api/ai', requireAuth, aiRoutes);
app.use('/api/supplements', requireAuth, supplementsRoutes);

app.get('/api/health', (req, res) => res.json({ ok: true }));

// Static frontend
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');
app.use(express.static(FRONTEND_DIR));

// Fall back to index.html for any non-API route (single-page app)
app.get(/^(?!\/api\/).*/, (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
});

app.use((err, req, res, next) => {
  console.error('Request failed:', err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'An unexpected server error occurred.' });
});

if (require.main === module) {
  initializeDatabase().then(() => {
    app.listen(PORT, () => {
      console.log(`QuickTrack server running at http://localhost:${PORT}`);
    });
  }).catch(error => {
    console.error('Could not initialize MySQL:', error.message);
    db.close().finally(() => {
      process.exitCode = 1;
    });
  });
}

module.exports = app;
