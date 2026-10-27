const express = require('express');
const db = require('../db');
const asyncHandler = require('../utils/asyncHandler');
const { getSmartChoiceReply } = require('../services/smartChoice');

const router = express.Router();

router.post('/chat', asyncHandler(async (req, res) => {
  const message = String(req.body?.message || '').trim();
  if (!message) return res.status(400).json({ error: 'Message is required.' });
  if (message.length > 2000) return res.status(400).json({ error: 'Message must be 2,000 characters or fewer.' });

  const user = await db.findUserById(req.userId);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  const now = new Date();
  const formatDate = date => date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
  const end = formatDate(now);
  const startDate = new Date(now);
  startDate.setDate(startDate.getDate() - 6);
  const entries = await db.getLogsInRange(req.userId, formatDate(startDate), end);
  const supplements = await db.getSupplements(req.userId);

  try {
    const reply = await getSmartChoiceReply({
      user,
      entries,
      supplements,
      message,
      history: req.body?.history,
    });
    res.json({ reply });
  } catch (err) {
    console.error('SmartChoice error:', err.message);
    res.status(502).json({ error: err.message });
  }
}));

module.exports = router;