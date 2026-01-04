// src/routes/employees.js
const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');

// Get all employees
router.get('/', requireAuth, async (req, res) => {
  try {
    const rows = await db('employees').select();
    res.json(rows);
  } catch (err) {
    console.error('GET /api/employees error', err);
    res.status(500).json({ error: 'DB error' });
  }
});

// Create employee (Admin only)
router.post('/', requireAuth, requireRole('Admin'), async (req, res) => {
  try {
    const { name, linked_user_id } = req.body || {};
    if (!name || typeof name !== 'string' || name.length < 2) {
      return res.status(400).json({ error: 'Name required (min 2 chars)' });
    }
    let uid = null;
    if (linked_user_id != null) {
      const user = await db('users').where({ id: linked_user_id }).first();
      if (!user) return res.status(400).json({ error: 'linked_user_id does not exist' });
      uid = user.id;
    }
    const [id] = await db('employees').insert({ name, linked_user_id: uid });
    res.status(201).json({ id });
  } catch (err) {
    console.error('POST /api/employees error', err);
    res.status(500).json({ error: 'DB error' });
  }
});

// Link an employee to an existing user by email (Admin only)
router.post('/:id/link', requireAuth, requireRole('Admin'), async (req, res) => {
  try {
    const empId = Number(req.params.id);
    if (!Number.isInteger(empId) || empId <= 0) return res.status(400).json({ error: 'Invalid employee id' });

    const { user_email } = req.body || {};
    if (!user_email || !/\S+@\S+\.\S+/.test(user_email)) {
      return res.status(400).json({ error: 'Valid user_email required' });
    }

    const emp = await db('employees').where({ id: empId }).first();
    if (!emp) return res.status(404).json({ error: 'Employee not found' });

    const user = await db('users').where({ email: user_email }).first();
    if (!user) return res.status(404).json({ error: 'User not found' });

    await db('employees').where({ id: empId }).update({ linked_user_id: user.id });
    res.json({ ok: true, employee_id: empId, linked_user_id: user.id });
  } catch (err) {
    console.error('POST /api/employees/:id/link error', err);
    res.status(500).json({ error: 'DB error' });
  }
});

module.exports = router;
