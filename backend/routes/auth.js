const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../db');
const asyncHandler = require('../utils/asyncHandler');
const { sendVerificationEmail } = require('../services/email');
const { requireAuth, JWT_SECRET } = require('../middleware/auth');

const router = express.Router();
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const VALID_GOALS = ['lose', 'gain', 'muscle'];
const VALID_TARGET_TIME_UNITS = ['week', 'month', 'year'];
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';

function publicProfile(user) {
  const { passwordHash, ...rest } = user;
  return rest;
}

function signToken(user) {
  return jwt.sign({ sub: user.id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

function googleRedirectUri(req) {
  return process.env.GOOGLE_REDIRECT_URI || `${req.protocol}://${req.get('host')}/api/auth/google/callback`;
}

function frontendUrl(req) {
  return process.env.FRONTEND_URL || `${req.protocol}://${req.get('host')}`;
}

function verificationToken(user) {
  return jwt.sign({ purpose: 'email-verification', sub: user.id }, JWT_SECRET, { expiresIn: '24h' });
}

function googlePendingToken(googleUser) {
  return jwt.sign({
    purpose: 'google-profile',
    googleId: googleUser.sub,
    email: googleUser.email,
    name: googleUser.name || googleUser.email.split('@')[0],
  }, JWT_SECRET, { expiresIn: '15m' });
}

router.get('/google', (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return res.redirect(`${frontendUrl(req)}/?google_error=${encodeURIComponent('Google sign-in is not configured yet.')}`);
  }

  const state = jwt.sign({ purpose: 'google-oauth', nonce: crypto.randomUUID() }, JWT_SECRET, { expiresIn: '10m' });
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: googleRedirectUri(req),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    access_type: 'online',
    prompt: 'select_account',
  });
  res.redirect(`${GOOGLE_AUTH_URL}?${params}`);
});

router.get('/google/callback', asyncHandler(async (req, res) => {
  const fail = message => res.redirect(`${frontendUrl(req)}/?google_error=${encodeURIComponent(message)}`);
  try {
    if (req.query.error) return fail('Google sign-in was cancelled.');
    if (!req.query.code || !req.query.state) return fail('Google sign-in response was incomplete.');

    const state = jwt.verify(req.query.state, JWT_SECRET);
    if (state.purpose !== 'google-oauth') return fail('Invalid Google sign-in state.');

    const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: req.query.code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: googleRedirectUri(req),
        grant_type: 'authorization_code',
      }),
    });
    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok || !tokenData.access_token) throw new Error('Google token exchange failed.');

    const profileResponse = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const googleUser = await profileResponse.json();
    if (!profileResponse.ok || !googleUser.sub || !googleUser.email || googleUser.email_verified !== true) {
      throw new Error('Google account email could not be verified.');
    }

    let user = await db.findUserByGoogleId(googleUser.sub) || await db.findUserByEmail(googleUser.email);
    if (user) {
      if (!user.googleId || !user.email) {
        user = await db.updateUserProfile(user.id, { googleId: googleUser.sub, email: googleUser.email });
      }
      const token = signToken(user);
      return res.redirect(`${frontendUrl(req)}/?google_token=${encodeURIComponent(token)}`);
    }

    const pending = googlePendingToken(googleUser);
    res.redirect(`${frontendUrl(req)}/?google_pending=${encodeURIComponent(pending)}`);
  } catch (err) {
    console.error('Google authentication failed:', err.message);
    fail('Google sign-in failed. Please try again.');
  }
}));

router.post('/register', asyncHandler(async (req, res) => {
  try {
    const { name, email, username, password, age, height, weight, meds, goal } = req.body || {};

    if (!name || !email || !username || !password) {
      return res.status(400).json({ error: 'Name, email, username and password are required.' });
    }
    if (typeof email !== 'string' || !/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json({ error: 'Enter a valid email address.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }
    if (await db.findUserByUsername(username)) {
      return res.status(409).json({ error: 'That username is already taken.' });
    }
    if (await db.findUserByEmail(email)) {
      return res.status(409).json({ error: 'That email is already registered.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await db.createUser({
      name: String(name).trim(),
      username: String(username).trim(),
      passwordHash,
      age: Number(age) || 30,
      height: Number(height) || 170,
      weight: Number(weight) || 70,
      meds: meds ? String(meds).trim() : '',
      goal: VALID_GOALS.includes(goal) ? goal : 'muscle',
      email: String(email).trim().toLowerCase(),
      emailVerified: false,
    });

    const verificationUrl = `${frontendUrl(req)}/api/auth/verify-email?token=${encodeURIComponent(verificationToken(user))}`;
    try {
      await sendVerificationEmail({ email: user.email, name: user.name, verificationUrl });
    } catch (err) {
      await db.removeUser(user.id);
      return res.status(503).json({ error: err.message });
    }
    res.status(202).json({ message: 'Check your email for a verification link before logging in.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Registration failed.' });
  }
}));

router.post('/google/register', asyncHandler(async (req, res) => {
  try {
    const { pendingToken, name, username, age, height, weight, meds, goal } = req.body || {};
    const pending = jwt.verify(pendingToken || '', JWT_SECRET);
    if (pending.purpose !== 'google-profile' || !pending.googleId || !pending.email) throw new Error('Invalid Google registration session.');
    if (!name || !username || !VALID_GOALS.includes(goal)) return res.status(400).json({ error: 'Complete all required profile fields.' });
    const numAge = Number(age), numHeight = Number(height), numWeight = Number(weight);
    if (!numAge || !numHeight || !numWeight) return res.status(400).json({ error: 'Age, height and weight must be valid numbers.' });
    if (await db.findUserByUsername(username)) return res.status(409).json({ error: 'That username is already taken.' });
    if (await db.findUserByGoogleId(pending.googleId) || await db.findUserByEmail(pending.email)) return res.status(409).json({ error: 'That Google account is already registered.' });

    const user = await db.createUser({
      name: String(name).trim(), username: String(username).trim(), passwordHash: null,
      age: numAge, height: numHeight, weight: numWeight, meds: meds ? String(meds).trim() : '', goal,
      email: pending.email, googleId: pending.googleId, emailVerified: true,
    });
    res.status(201).json({ token: signToken(user), user: publicProfile(user) });
  } catch (err) {
    res.status(400).json({ error: 'Google registration session expired. Please try again.' });
  }
}));

router.get('/verify-email', asyncHandler(async (req, res) => {
  try {
    const payload = jwt.verify(req.query.token || '', JWT_SECRET);
    if (payload.purpose !== 'email-verification') throw new Error('Invalid verification token.');
    const user = await db.findUserById(payload.sub);
    if (!user) throw new Error('User not found.');
    await db.updateUserProfile(user.id, { emailVerified: true });
    res.redirect(`${frontendUrl(req)}/?verified=1`);
  } catch (err) {
    res.redirect(`${frontendUrl(req)}/?google_error=${encodeURIComponent('This verification link is invalid or expired.')}`);
  }
}));

router.post('/login', asyncHandler(async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }

    const user = await db.findUserByUsername(username);
    if (!user) {
      return res.status(401).json({ error: 'Username or password is incorrect.' });
    }

    if (user.email && user.emailVerified !== true) {
      return res.status(403).json({ error: 'Verify your email before logging in.' });
    }
    const ok = user.passwordHash && await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return res.status(401).json({ error: 'Username or password is incorrect.' });
    }

    const token = signToken(user);
    res.json({ token, user: publicProfile(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Login failed.' });
  }
}));

router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  const user = await db.findUserById(req.userId);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  res.json({ user: publicProfile(user) });
}));

router.patch('/me/target', requireAuth, asyncHandler(async (req, res) => {
  const { goal, targetWeight, timeValue, timeUnit, measurements } = req.body || {};
  if (!VALID_GOALS.includes(goal)) return res.status(400).json({ error: 'Choose a valid target goal.' });

  const numTargetWeight = Number(targetWeight);
  const numTimeValue = Number(timeValue);
  if (!Number.isFinite(numTargetWeight) || numTargetWeight < 30 || numTargetWeight > 300) {
    return res.status(400).json({ error: 'Enter a target weight between 30 and 300 kg.' });
  }
  if (!Number.isInteger(numTimeValue) || numTimeValue < 1 || numTimeValue > 100) {
    return res.status(400).json({ error: 'Enter a time value between 1 and 100.' });
  }
  if (!VALID_TARGET_TIME_UNITS.includes(timeUnit)) {
    return res.status(400).json({ error: 'Choose week, month, or year for the target timeline.' });
  }

  const cleanMeasurements = {};
  if (measurements && typeof measurements === 'object') {
    for (const key of ['chest', 'thigh', 'biceps', 'shoulder', 'waist', 'hip']) {
      const value = measurements[key];
      if (value === '' || value == null) continue;
      const numValue = Number(value);
      if (!Number.isFinite(numValue) || numValue <= 0 || numValue > 300) {
        return res.status(400).json({ error: 'Body measurements must be between 0 and 300 cm.' });
      }
      cleanMeasurements[key] = numValue;
    }
  }

  const user = await db.updateUserProfile(req.userId, {
    targetGoal: goal,
    targetWeight: numTargetWeight,
    targetTimeValue: numTimeValue,
    targetTimeUnit: timeUnit,
    measurements: cleanMeasurements,
  });
  if (!user) return res.status(404).json({ error: 'User not found.' });
  res.json({ user: publicProfile(user) });
}));

router.patch('/me', requireAuth, asyncHandler(async (req, res) => {
  const { name, age, height, weight, meds, goal } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Name is required.' });
  if (!VALID_GOALS.includes(goal)) return res.status(400).json({ error: 'Choose a valid fitness goal.' });

  const numAge = Number(age), numHeight = Number(height), numWeight = Number(weight);
  if (!Number.isFinite(numAge) || numAge < 10 || numAge > 100 ||
      !Number.isFinite(numHeight) || numHeight < 100 || numHeight > 250 ||
      !Number.isFinite(numWeight) || numWeight < 30 || numWeight > 300) {
    return res.status(400).json({ error: 'Enter valid age, height, and weight values.' });
  }

  const user = await db.updateUserProfile(req.userId, {
    name: String(name).trim(),
    age: numAge,
    height: numHeight,
    weight: numWeight,
    meds: meds ? String(meds).trim() : '',
    goal,
  });
  if (!user) return res.status(404).json({ error: 'User not found.' });
  res.json({ user: publicProfile(user) });
}));

module.exports = router;
