require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const logsRoutes = require('./routes/logs');
const devicesRoutes = require('./routes/devices');
const aiRoutes = require('./routes/ai');
const supplementsRoutes = require('./routes/supplements');
const { requireAuth } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

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

app.listen(PORT, () => {
  console.log(`QuickTrack server running at http://localhost:${PORT}`);
});
