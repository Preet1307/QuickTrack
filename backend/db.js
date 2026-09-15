const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DB_PATH = path.join(__dirname, 'data', 'db.json');

// A small file-backed JSON store. Good enough for a demo / single-instance
// deployment. For real production use, swap this module out for a proper
// database (Postgres, MySQL, etc.) — the function signatures below are the
// seam to do that behind.

function readDB() {
  const raw = fs.readFileSync(DB_PATH, 'utf-8');
  return JSON.parse(raw);
}

function writeDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

function id() {
  return crypto.randomUUID();
}

/* ---------------- users ---------------- */

function findUserByUsername(username) {
  const db = readDB();
  return db.users.find(u => u.username === username.toLowerCase()) || null;
}

function findUserById(userId) {
  const db = readDB();
  return db.users.find(u => u.id === userId) || null;
}

function findUserByGoogleId(googleId) {
  const db = readDB();
  return db.users.find(u => u.googleId === googleId) || null;
}

function findUserByEmail(email) {
  const db = readDB();
  return db.users.find(u => u.email && u.email.toLowerCase() === email.toLowerCase()) || null;
}

function createUser({ name, username, passwordHash, age, height, weight, meds, goal, email, googleId, emailVerified = false }) {
  const db = readDB();
  db.supplements ||= [];
  const user = {
    id: id(),
    name,
    username: username.toLowerCase(),
    passwordHash,
    age,
    height,
    weight,
    meds: meds || '',
    goal,
    ...(email ? { email } : {}),
    ...(googleId ? { googleId } : {}),
    ...(email ? { emailVerified } : {}),
    createdAt: new Date().toISOString(),
  };
  db.users.push(user);
  db.devices.push({ userId: user.id, google: false, strava: false });
  writeDB(db);
  return user;
}

function updateUserProfile(userId, fields) {
  const db = readDB();
  const user = db.users.find(u => u.id === userId);
  if (!user) return null;
  Object.assign(user, fields);
  writeDB(db);
  return user;
}

function removeUser(userId) {
  const data = readDB();
  const before = data.users.length;
  data.users = data.users.filter(user => user.id !== userId);
  data.devices = data.devices.filter(device => device.userId !== userId);
  data.logs = data.logs.filter(log => log.userId !== userId);
  data.supplements = (data.supplements || []).filter(supplement => supplement.userId !== userId);
  if (data.users.length === before) return false;
  writeDB(data);
  return true;
}

/* ---------------- logs (food / workout entries) ---------------- */

function addLogEntry(userId, { date, type, name, cal, protein, carbs, fat, fiber }) {
  const db = readDB();
  const entry = { id: id(), userId, date, type, name, cal, createdAt: new Date().toISOString() };
  if (protein != null) entry.protein = protein;
  if (carbs != null) entry.carbs = carbs;
  if (fat != null) entry.fat = fat;
  if (fiber != null) entry.fiber = fiber;
  db.logs.push(entry);
  writeDB(db);
  return entry;
}

function removeLogEntry(userId, entryId) {
  const db = readDB();
  const before = db.logs.length;
  db.logs = db.logs.filter(l => !(l.id === entryId && l.userId === userId));
  writeDB(db);
  return db.logs.length < before;
}

function getLogsForDate(userId, date) {
  const db = readDB();
  return db.logs.filter(l => l.userId === userId && l.date === date);
}

function getLogsInRange(userId, startDate, endDate) {
  const db = readDB();
  return db.logs.filter(l => l.userId === userId && l.date >= startDate && l.date <= endDate);
}

/* ---------------- devices ---------------- */

function getDevices(userId) {
  const db = readDB();
  return db.devices.find(d => d.userId === userId) || { userId, google: false, strava: false };
}

function setDevice(userId, deviceKey, connected) {
  const db = readDB();
  let rec = db.devices.find(d => d.userId === userId);
  if (!rec) {
    rec = { userId, google: false, strava: false };
    db.devices.push(rec);
  }
  rec[deviceKey] = connected;
  writeDB(db);
  return rec;
}

function getSupplements(userId) {
  const db = readDB();
  return (db.supplements || []).filter(supplement => supplement.userId === userId);
}

function addSupplement(userId, supplement) {
  const db = readDB();
  db.supplements ||= [];
  const entry = { id: id(), userId, ...supplement, createdAt: new Date().toISOString() };
  db.supplements.push(entry);
  writeDB(db);
  return entry;
}

function removeSupplement(userId, supplementId) {
  const db = readDB();
  const before = (db.supplements || []).length;
  db.supplements = (db.supplements || []).filter(supplement => !(supplement.id === supplementId && supplement.userId === userId));
  writeDB(db);
  return db.supplements.length < before;
}

module.exports = {
  findUserByUsername,
  findUserById,
  findUserByGoogleId,
  findUserByEmail,
  createUser,
  updateUserProfile,
  removeUser,
  addLogEntry,
  removeLogEntry,
  getLogsForDate,
  getLogsInRange,
  getDevices,
  setDevice,
  getSupplements,
  addSupplement,
  removeSupplement,
};
