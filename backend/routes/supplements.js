const express = require('express');
const db = require('../db');
const { estimateNutrition } = require('../services/nutritionEstimator');

const router = express.Router();

router.get('/', (req, res) => res.json({ supplements: db.getSupplements(req.userId) }));

router.post('/', async (req, res) => {
  const name = String(req.body?.name || '').trim();
  const dose = String(req.body?.dose || '').trim();
  if (!name || !dose) return res.status(400).json({ error: 'Supplement name and daily dose are required.' });
  try {
    const nutrition = await estimateNutrition({ name: `${name}, daily dose: ${dose}`, user: db.findUserById(req.userId), supplement: true });
    const supplement = db.addSupplement(req.userId, { name, dose, ...nutrition });
    res.status(201).json({ supplement });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

router.delete('/:id', (req, res) => {
  if (!db.removeSupplement(req.userId, req.params.id)) return res.status(404).json({ error: 'Supplement not found.' });
  res.json({ ok: true });
});

module.exports = router;