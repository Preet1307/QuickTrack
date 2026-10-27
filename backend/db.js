const crypto = require('crypto');
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'quicktrack',
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
  dateStrings: true,
  ...(process.env.DB_SSL === 'true' ? { ssl: { rejectUnauthorized: true } } : {}),
});

const schema = [
  `CREATE TABLE IF NOT EXISTS QTusers (
    id CHAR(36) PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    username VARCHAR(60) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NULL,
    email VARCHAR(254) NULL UNIQUE,
    email_verified BOOLEAN NULL,
    google_id VARCHAR(255) NULL UNIQUE,
    age SMALLINT UNSIGNED NOT NULL,
    height DECIMAL(5,2) NOT NULL,
    weight DECIMAL(5,2) NOT NULL,
    meds TEXT NOT NULL,
    goal VARCHAR(20) NOT NULL,
    target_goal VARCHAR(20) NULL,
    target_weight DECIMAL(5,2) NULL,
    target_time_value SMALLINT UNSIGNED NULL,
    target_time_unit VARCHAR(10) NULL,
    measurements JSON NULL,
    created_at DATETIME(3) NOT NULL
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS devices (
    user_id CHAR(36) PRIMARY KEY,
    google BOOLEAN NOT NULL DEFAULT FALSE,
    strava BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT fk_devices_user FOREIGN KEY (user_id) REFERENCES QTusers(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS logs (
    id CHAR(36) PRIMARY KEY,
    user_id CHAR(36) NOT NULL,
    entry_date DATE NOT NULL,
    type ENUM('food', 'workout') NOT NULL,
    name VARCHAR(500) NOT NULL,
    cal DECIMAL(10,2) NOT NULL,
    protein DECIMAL(10,2) NULL,
    carbs DECIMAL(10,2) NULL,
    fat DECIMAL(10,2) NULL,
    fiber DECIMAL(10,2) NULL,
    nutrition_status VARCHAR(30) NULL,
    created_at DATETIME(3) NOT NULL,
    INDEX idx_logs_user_date (user_id, entry_date),
    CONSTRAINT fk_logs_user FOREIGN KEY (user_id) REFERENCES QTusers(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS supplements (
    id CHAR(36) PRIMARY KEY,
    user_id CHAR(36) NOT NULL,
    name VARCHAR(255) NOT NULL,
    dose VARCHAR(255) NOT NULL,
    nutrition JSON NOT NULL,
    created_at DATETIME(3) NOT NULL,
    INDEX idx_supplements_user (user_id),
    CONSTRAINT fk_supplements_user FOREIGN KEY (user_id) REFERENCES QTusers(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS app_migrations (
    name VARCHAR(100) PRIMARY KEY,
    applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB`,
];

function toIso(value) {
  if (!value) return value;
  if (typeof value === 'string') return new Date(`${value.replace(' ', 'T')}Z`).toISOString();
  return value.toISOString();
}

function toMysqlDatetime(value) {
  return new Date(value).toISOString().slice(0, 23).replace('T', ' ');
}

function mapUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    username: row.username,
    passwordHash: row.password_hash,
    age: Number(row.age),
    height: Number(row.height),
    weight: Number(row.weight),
    meds: row.meds,
    goal: row.goal,
    ...(row.email != null ? { email: row.email } : {}),
    ...(row.google_id != null ? { googleId: row.google_id } : {}),
    ...(row.email_verified != null ? { emailVerified: Boolean(row.email_verified) } : {}),
    ...(row.target_goal != null ? { targetGoal: row.target_goal } : {}),
    ...(row.target_weight != null ? { targetWeight: Number(row.target_weight) } : {}),
    ...(row.target_time_value != null ? { targetTimeValue: Number(row.target_time_value) } : {}),
    ...(row.target_time_unit != null ? { targetTimeUnit: row.target_time_unit } : {}),
    ...(row.measurements != null ? { measurements: typeof row.measurements === 'string' ? JSON.parse(row.measurements) : row.measurements } : {}),
    createdAt: toIso(row.created_at),
  };
}

function mapLog(row) {
  if (!row) return null;
  const entry = {
    id: row.id,
    userId: row.user_id,
    date: row.entry_date,
    type: row.type,
    name: row.name,
    cal: Number(row.cal),
    createdAt: toIso(row.created_at),
  };
  for (const field of ['protein', 'carbs', 'fat', 'fiber']) {
    if (row[field] != null) entry[field] = Number(row[field]);
  }
  if (row.nutrition_status != null) entry.nutritionStatus = row.nutrition_status;
  return entry;
}

function mapSupplement(row) {
  const nutrition = typeof row.nutrition === 'string' ? JSON.parse(row.nutrition) : row.nutrition;
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    dose: row.dose,
    ...nutrition,
    createdAt: toIso(row.created_at),
  };
}

async function initialize() {
  if (!process.env.DB_NAME) {
    throw new Error('Set DB_NAME in backend/.env to the MySQL database you created.');
  }
  for (const statement of schema) {
    await pool.query(statement);
  }
  await pool.query("UPDATE QTusers SET username = LOWER(username), email = LOWER(email) WHERE username <> LOWER(username) OR email <> LOWER(email)");
}

/* ---------------- users ---------------- */

async function findUserByUsername(username) {
  const [rows] = await pool.execute('SELECT * FROM QTusers WHERE username = LOWER(?) LIMIT 1', [username]);
  return mapUser(rows[0]);
}

async function findUserById(userId) {
  const [rows] = await pool.execute('SELECT * FROM QTusers WHERE id = ? LIMIT 1', [userId]);
  return mapUser(rows[0]);
}

async function findUserByGoogleId(googleId) {
  const [rows] = await pool.execute('SELECT * FROM QTusers WHERE google_id = ? LIMIT 1', [googleId]);
  return mapUser(rows[0]);
}

async function findUserByEmail(email) {
  const [rows] = await pool.execute('SELECT * FROM QTusers WHERE email = LOWER(?) LIMIT 1', [email]);
  return mapUser(rows[0]);
}

async function createUser({ name, username, passwordHash, age, height, weight, meds, goal, email, googleId, emailVerified = false }) {
  const user = {
    id: crypto.randomUUID(),
    name,
    username: username.toLowerCase(),
    passwordHash,
    age,
    height,
    weight,
    meds: meds || '',
    goal,
    ...(email ? { email: email.toLowerCase() } : {}),
    ...(googleId ? { googleId } : {}),
    ...(email ? { emailVerified } : {}),
    createdAt: new Date().toISOString(),
  };
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute(
      `INSERT INTO QTusers (id, name, username, password_hash, email, email_verified, google_id, age, height, weight, meds, goal, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [user.id, user.name, user.username, user.passwordHash, user.email || null,
        user.emailVerified == null ? null : user.emailVerified, user.googleId || null,
          user.age, user.height, user.weight, user.meds, user.goal, toMysqlDatetime(user.createdAt)]
    );
    await connection.execute('INSERT INTO devices (user_id) VALUES (?)', [user.id]);
    await connection.commit();
    return user;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function updateUserProfile(userId, fields) {
  const columns = {
    name: 'name',
    username: 'username',
    passwordHash: 'password_hash',
    age: 'age',
    height: 'height',
    weight: 'weight',
    meds: 'meds',
    goal: 'goal',
    email: 'email',
    googleId: 'google_id',
    emailVerified: 'email_verified',
    targetGoal: 'target_goal',
    targetWeight: 'target_weight',
    targetTimeValue: 'target_time_value',
    targetTimeUnit: 'target_time_unit',
    measurements: 'measurements',
  };
  const assignments = [];
  const values = [];
  for (const [field, value] of Object.entries(fields)) {
    const column = columns[field];
    if (!column) throw new Error(`Unsupported user profile field: ${field}`);
    assignments.push(`${column} = ?`);
    values.push(field === 'measurements' ? JSON.stringify(value) : value);
  }
  if (assignments.length) {
    values.push(userId);
    await pool.execute(`UPDATE QTusers SET ${assignments.join(', ')} WHERE id = ?`, values);
  }
  return findUserById(userId);
}

async function removeUser(userId) {
  const [result] = await pool.execute('DELETE FROM QTusers WHERE id = ?', [userId]);
  return result.affectedRows > 0;
}

/* ---------------- logs ---------------- */

async function addLogEntry(userId, { date, type, name, cal, protein, carbs, fat, fiber }) {
  const entry = { id: crypto.randomUUID(), userId, date, type, name, cal, createdAt: new Date().toISOString() };
  if (protein != null) entry.protein = protein;
  if (carbs != null) entry.carbs = carbs;
  if (fat != null) entry.fat = fat;
  if (fiber != null) entry.fiber = fiber;
  await pool.execute(
    `INSERT INTO logs (id, user_id, entry_date, type, name, cal, protein, carbs, fat, fiber, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [entry.id, userId, date, type, name, cal, protein ?? null, carbs ?? null, fat ?? null, fiber ?? null, toMysqlDatetime(entry.createdAt)]
  );
  return entry;
}

async function removeLogEntry(userId, entryId) {
  const [result] = await pool.execute('DELETE FROM logs WHERE id = ? AND user_id = ?', [entryId, userId]);
  return result.affectedRows > 0;
}

async function updateLogNutrition(userId, entryId, nutrition) {
  const columns = { protein: 'protein', carbs: 'carbs', fat: 'fat', fiber: 'fiber', nutritionStatus: 'nutrition_status' };
  const assignments = [];
  const values = [];
  for (const [field, value] of Object.entries(nutrition)) {
    const column = columns[field];
    if (!column) throw new Error(`Unsupported nutrition field: ${field}`);
    assignments.push(`${column} = ?`);
    values.push(value);
  }
  if (assignments.length) {
    values.push(entryId, userId);
    await pool.execute(`UPDATE logs SET ${assignments.join(', ')} WHERE id = ? AND user_id = ? AND type = 'food'`, values);
  }
  const [rows] = await pool.execute('SELECT * FROM logs WHERE id = ? AND user_id = ? AND type = ? LIMIT 1', [entryId, userId, 'food']);
  return mapLog(rows[0]);
}

async function getLogsForDate(userId, date) {
  const [rows] = await pool.execute('SELECT * FROM logs WHERE user_id = ? AND entry_date = ? ORDER BY created_at', [userId, date]);
  return rows.map(mapLog);
}

async function getLogsInRange(userId, startDate, endDate) {
  const [rows] = await pool.execute(
    'SELECT * FROM logs WHERE user_id = ? AND entry_date BETWEEN ? AND ? ORDER BY entry_date, created_at',
    [userId, startDate, endDate]
  );
  return rows.map(mapLog);
}

/* ---------------- devices ---------------- */

async function getDevices(userId) {
  const [rows] = await pool.execute('SELECT user_id, google, strava FROM devices WHERE user_id = ? LIMIT 1', [userId]);
  const row = rows[0];
  return row
    ? { userId: row.user_id, google: Boolean(row.google), strava: Boolean(row.strava) }
    : { userId, google: false, strava: false };
}

async function setDevice(userId, deviceKey, connected) {
  if (!['google', 'strava'].includes(deviceKey)) throw new Error('Unsupported device key.');
  await pool.execute(
    `INSERT INTO devices (user_id, ${deviceKey}) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE ${deviceKey} = VALUES(${deviceKey})`,
    [userId, connected]
  );
  return getDevices(userId);
}

async function getSupplements(userId) {
  const [rows] = await pool.execute('SELECT * FROM supplements WHERE user_id = ? ORDER BY created_at', [userId]);
  return rows.map(mapSupplement);
}

async function addSupplement(userId, supplement) {
  const entry = { id: crypto.randomUUID(), userId, ...supplement, createdAt: new Date().toISOString() };
  const nutrition = { ...supplement };
  delete nutrition.name;
  delete nutrition.dose;
  await pool.execute(
    'INSERT INTO supplements (id, user_id, name, dose, nutrition, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [entry.id, userId, entry.name, entry.dose, JSON.stringify(nutrition), toMysqlDatetime(entry.createdAt)]
  );
  return entry;
}

async function removeSupplement(userId, supplementId) {
  const [result] = await pool.execute('DELETE FROM supplements WHERE id = ? AND user_id = ?', [supplementId, userId]);
  return result.affectedRows > 0;
}

async function migrateFromJson(data) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [markers] = await connection.execute('SELECT name FROM app_migrations WHERE name = ?', ['json-file-import-v1']);
    if (markers.length) {
      await connection.rollback();
      return false;
    }
    const [counts] = await connection.query('SELECT (SELECT COUNT(*) FROM QTusers) AS users, (SELECT COUNT(*) FROM logs) AS logs');
    if (Number(counts[0].users) || Number(counts[0].logs)) {
      throw new Error('JSON import stopped: MySQL already contains user or log data.');
    }
    const now = new Date().toISOString();
    for (const user of data.users || []) {
      await connection.execute(
        `INSERT INTO QTusers (id, name, username, password_hash, email, email_verified, google_id, age, height, weight, meds, goal,
          target_goal, target_weight, target_time_value, target_time_unit, measurements, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [user.id, user.name, user.username.toLowerCase(), user.passwordHash || null, user.email || null,
          user.emailVerified == null ? null : user.emailVerified, user.googleId || null, user.age, user.height, user.weight,
          user.meds || '', user.goal || 'muscle', user.targetGoal || null, user.targetWeight ?? null,
          user.targetTimeValue ?? null, user.targetTimeUnit || null,
          user.measurements == null ? null : JSON.stringify(user.measurements), toMysqlDatetime(user.createdAt || now)]
      );
    }
    for (const device of data.devices || []) {
      await connection.execute(
        `INSERT INTO devices (user_id, google, strava) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE google = VALUES(google), strava = VALUES(strava)`,
        [device.userId, Boolean(device.google), Boolean(device.strava)]
      );
    }
    for (const user of data.users || []) {
      await connection.execute('INSERT IGNORE INTO devices (user_id) VALUES (?)', [user.id]);
    }
    for (const entry of data.logs || []) {
      await connection.execute(
        `INSERT INTO logs (id, user_id, entry_date, type, name, cal, protein, carbs, fat, fiber, nutrition_status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [entry.id, entry.userId, entry.date, entry.type, entry.name, entry.cal, entry.protein ?? null,
          entry.carbs ?? null, entry.fat ?? null, entry.fiber ?? null, entry.nutritionStatus || null,
          toMysqlDatetime(entry.createdAt || now)]
      );
    }
    for (const supplement of data.supplements || []) {
      const nutrition = { ...supplement };
      for (const field of ['id', 'userId', 'name', 'dose', 'createdAt']) delete nutrition[field];
      await connection.execute(
        'INSERT INTO supplements (id, user_id, name, dose, nutrition, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [supplement.id, supplement.userId, supplement.name, supplement.dose, JSON.stringify(nutrition), toMysqlDatetime(supplement.createdAt || now)]
      );
    }
    await connection.execute('INSERT INTO app_migrations (name) VALUES (?)', ['json-file-import-v1']);
    await connection.commit();
    return true;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function close() {
  await pool.end();
}

module.exports = {
  initialize,
  close,
  migrateFromJson,
  findUserByUsername,
  findUserById,
  findUserByGoogleId,
  findUserByEmail,
  createUser,
  updateUserProfile,
  removeUser,
  addLogEntry,
  removeLogEntry,
  updateLogNutrition,
  getLogsForDate,
  getLogsInRange,
  getDevices,
  setDevice,
  getSupplements,
  addSupplement,
  removeSupplement,
};
