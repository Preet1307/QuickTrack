const express = require('express');
const db = require('../db');
const { estimateCalories } = require('../services/calorieEstimator');
const { estimateNutrition } = require('../services/nutritionEstimator');

const router = express.Router();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function dailyTarget(user) {
  // Simplified Mifflin-St Jeor style estimate, activity factor 1.375.
  // Illustrative only — not medical guidance.
  const bmr = 10 * user.weight + 6.25 * user.height - 5 * user.age;
  const tdee = bmr * 1.375;
  if (user.goal === 'lose') return Math.round(tdee - 500);
  if (user.goal === 'gain') return Math.round(tdee + 500);
  return Math.round(tdee + 250); // muscle
}

function summarize(entries) {
  const food = entries.filter(e => e.type === 'food');
  const workout = entries.filter(e => e.type === 'workout');
  return {
    food,
    workout,
    consumed: food.reduce((s, e) => s + e.cal, 0),
    burned: workout.reduce((s, e) => s + e.cal, 0),
  };
}

router.get('/target', (req, res) => {
  const user = db.findUserById(req.userId);
  res.json({ target: dailyTarget(user) });
});

router.get('/day/:date', (req, res) => {
  const { date } = req.params;
  if (!DATE_RE.test(date)) return res.status(400).json({ error: 'Date must be in YYYY-MM-DD format.' });
  const entries = db.getLogsForDate(req.userId, date);
  res.json(summarize(entries));
});

router.post('/entry', async (req, res) => {
  const { date, type, name, cal } = req.body || {};
  if (!DATE_RE.test(date || '')) return res.status(400).json({ error: 'Date must be in YYYY-MM-DD format.' });
  if (!['food', 'workout'].includes(type)) return res.status(400).json({ error: 'Type must be "food" or "workout".' });
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Entry name is required.' });
  let numCal = Number(cal);
  let estimated = false;
  let nutrition = null;
  if (type === 'food') {
    try {
      nutrition = await estimateNutrition({ name: String(name).trim().slice(0, 500), user: db.findUserById(req.userId) });
      if (!cal) numCal = nutrition.calories;
      estimated = true;
    } catch (err) {
      if (!cal) {
        try {
          numCal = await estimateCalories({ type, name: String(name).trim().slice(0, 500), user: db.findUserById(req.userId) });
          estimated = true;
        } catch (fallbackErr) {
          return res.status(502).json({ error: fallbackErr.message });
        }
      }
    }
  } else if (!cal) {
    try {
      numCal = await estimateCalories({ type, name: String(name).trim().slice(0, 500), user: db.findUserById(req.userId) });
      estimated = true;
    } catch (err) {
      return res.status(502).json({ error: err.message });
    }
  }
  if (!numCal || numCal <= 0 || !Number.isFinite(numCal)) return res.status(400).json({ error: 'Calories must be a positive number.' });

  const entry = db.addLogEntry(req.userId, {
    date, type, name: String(name).trim(), cal: numCal,
    ...(nutrition ? { protein: nutrition.protein, carbs: nutrition.carbs, fat: nutrition.fat, fiber: nutrition.fiber } : {}),
  });
  res.status(201).json({ entry, estimated });
});

router.delete('/entry/:id', (req, res) => {
  const removed = db.removeLogEntry(req.userId, req.params.id);
  if (!removed) return res.status(404).json({ error: 'Entry not found.' });
  res.json({ ok: true });
});

// Last 7 days (including today), oldest first.
router.get('/week', (req, res) => {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'));
  }
  const entries = db.getLogsInRange(req.userId, days[0], days[days.length - 1]);
  const byDate = {};
  days.forEach(d => { byDate[d] = { date: d, consumed: 0, burned: 0 }; });
  entries.forEach(e => {
    if (!byDate[e.date]) return;
    if (e.type === 'food') byDate[e.date].consumed += e.cal;
    else byDate[e.date].burned += e.cal;
  });
  res.json({ days: days.map(d => byDate[d]) });
});

// Per-day net calories for a given month, for the calendar view.
router.get('/month/:year/:month', (req, res) => {
  const year = Number(req.params.year);
  const month = Number(req.params.month); // 1-12
  if (!year || !month || month < 1 || month > 12) {
    return res.status(400).json({ error: 'Invalid year or month.' });
  }
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  const entries = db.getLogsInRange(req.userId, start, end);
  const byDate = {};
  entries.forEach(e => {
    if (!byDate[e.date]) byDate[e.date] = { date: e.date, consumed: 0, burned: 0 };
    if (e.type === 'food') byDate[e.date].consumed += e.cal;
    else byDate[e.date].burned += e.cal;
  });
  res.json({ days: Object.values(byDate) });
});

module.exports = router;
