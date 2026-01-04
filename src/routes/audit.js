// src/routes/audit.js
const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');

// Admin/Manager can view logs
router.get('/', requireAuth, requireRole('Admin','Manager'), async (req,res) => {
  try {
    const logs = await db('audit_logs').orderBy('timestamp','desc').limit(100);
    res.json(logs);
  } catch (err) {
    console.error('GET /api/audit error', err);
    res.status(500).json({ error: 'DB error' });
  }
});

module.exports = router;
