const express = require('express');
const db = require('../db');

const router = express.Router();
const VALID_DEVICES = ['google', 'strava'];

router.get('/', (req, res) => {
  const devices = db.getDevices(req.userId);
  res.json({ devices });
});

// Demo toggle. In a real integration, this endpoint would instead redirect
// the user into the provider's OAuth consent screen (Google Health Connect /
// Strava), and a callback route would exchange the returned code for tokens
// using a server-held client secret before marking the device connected.
router.post('/:key/toggle', (req, res) => {
  const { key } = req.params;
  if (!VALID_DEVICES.includes(key)) {
    return res.status(400).json({ error: 'Unknown device.' });
  }
  const current = db.getDevices(req.userId);
  const next = !current[key];
  const updated = db.setDevice(req.userId, key, next);
  res.json({ devices: updated });
});

module.exports = router;
