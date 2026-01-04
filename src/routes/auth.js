// src/routes/auth.js
const express = require('express');
const router = express.Router();
const db = require('../db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { SECRET, TOKEN_MAX_AGE, requireAuth, requireRole } = require('../middleware/authMiddleware');


// Helpers
function isEmail(s) {
  return typeof s === 'string' && /\S+@\S+\.\S+/.test(s);
}
function isRole(s) {
  return ['Admin', 'Manager', 'Employee'].includes(s);
}

// Register (Admin creating users in production; here open with validation)
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, role } = req.body || {};
    if (!name || typeof name !== 'string' || name.length < 2) {
      return res.status(400).json({ error: 'Name required (min 2 chars)' });
    }
    if (!isEmail(email)) return res.status(400).json({ error: 'Valid email required' });
    if (!password || String(password).length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    if (!isRole(role)) return res.status(400).json({ error: 'Role must be Admin, Manager, or Employee' });

    const exists = await db('users').where({ email }).first();
    if (exists) return res.status(400).json({ error: 'Email already registered' });

    const password_hash = await bcrypt.hash(password, 10);
    const [id] = await db('users').insert({ name, email, password_hash, role });
    return res.status(201).json({ id });
  } catch (err) {
    console.error('POST /api/auth/register error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Login -> returns JWT and user info
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!isEmail(email) || !password) return res.status(400).json({ error: 'Missing credentials' });

    const user = await db('users').where({ email }).first();
    if (!user || !user.password_hash) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(400).json({ error: 'Invalid credentials' });

    const token = jwt.sign(
      { id: user.id, name: user.name, role: user.role },
      SECRET,
      { expiresIn: TOKEN_MAX_AGE }
    );

    // ✅ include email in the returned user object
    return res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (err) {
    console.error('POST /api/auth/login error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});



// Reset password (Admin only)
router.post('/reset', requireAuth, requireRole('Admin'), async (req, res) => {
  try {
    const { email, newPassword } = req.body || {};
    if (!email || !newPassword) {
      return res.status(400).json({ error: 'Email and newPassword required' });
    }
    const user = await db('users').where({ email }).first();
    if (!user) return res.status(404).json({ error: 'User not found' });

    const password_hash = await bcrypt.hash(newPassword, 10);
    await db('users').where({ id: user.id }).update({ password_hash });

    await db('audit_logs').insert({
      action: 'RESET_PASSWORD',
      user_id: req.user.id,
      details: JSON.stringify({ target_email: email })
    });

    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/auth/reset error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
