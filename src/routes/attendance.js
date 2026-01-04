// src/routes/attendance.js
const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');

// Helpers
function isBSDate(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}
function safeTimeDisplay() {
  try { return new Date().toLocaleTimeString(); } catch { return '00:00 AM'; }
}
function safeIsoDate() {
  try { return new Date().toISOString().slice(0, 10); } catch { return '1970-01-01'; }
}
function safeIsoTime() {
  try { return new Date().toTimeString().split(' ')[0]; } catch { return '00:00:00'; }
}

// Mark attendance (upsert)
router.post('/', requireAuth, async (req, res) => {
  try {
    const { employee_id, date_bs, date_ad, time_iso, time_display, status } = req.body || {};
    const empId = Number(employee_id);
    if (!Number.isInteger(empId) || empId <= 0) return res.status(400).json({ error: 'Valid employee_id required' });
    if (!isBSDate(date_bs)) return res.status(400).json({ error: 'date_bs must be YYYY-MM-DD' });

    // If Employee role, ensure they can only mark their linked employee
    if (req.user.role === 'Employee') {
      const emp = await db('employees').where({ id: empId }).first();
      if (!emp || emp.linked_user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
    }

    await db('attendance').where({ employee_id: empId, date_bs }).del();
    const [id] = await db('attendance').insert({
      employee_id: empId,
      date_bs,
      date_ad: date_ad || safeIsoDate(),
      time_iso: time_iso || safeIsoTime(),
      time_display: time_display || safeTimeDisplay(),
      status: status || 'Present',
      marked_by: req.user.id
    });

    // Audit log
    await db('audit_logs').insert({
      action: 'MARK_ATTENDANCE',
      user_id: req.user.id,
      details: JSON.stringify({ employee_id: empId, date_bs })
    });

    res.status(201).json({ id });
  } catch (err) {
    console.error('POST /api/attendance error', err);
    res.status(500).json({ error: 'DB error' });
  }
});

// Get attendance (optionally filter by BS date)
router.get('/', requireAuth, async (req, res) => {
  try {
    const { date_bs } = req.query || {};
    let rows;
    if (date_bs) {
      if (!isBSDate(date_bs)) return res.status(400).json({ error: 'date_bs must be YYYY-MM-DD' });
      rows = await db('attendance').where({ date_bs });
    } else {
      rows = await db('attendance').select();
    }
    res.json(rows);
  } catch (err) {
    console.error('GET /api/attendance error', err);
    res.status(500).json({ error: 'DB error' });
  }
});

// Export CSV (Admin or Manager)
router.get('/export', requireAuth, requireRole('Admin', 'Manager'), async (req, res) => {
  try {
    const { date_bs } = req.query || {};
    if (date_bs && !isBSDate(date_bs)) return res.status(400).json({ error: 'date_bs must be YYYY-MM-DD' });

    const rows = date_bs ? await db('attendance').where({ date_bs }) : await db('attendance').select();

    // join employee and marker info
    const out = [];
    for (const r of rows) {
      const emp = await db('employees').where({ id: r.employee_id }).first();
      const marker = r.marked_by ? await db('users').where({ id: r.marked_by }).first() : null;
      out.push({
        name: emp ? emp.name : r.employee_id,
        date_bs: r.date_bs,
        time: r.time_display,
        status: r.status,
        marked_by: marker ? marker.name : ''
      });
    }

    const header = ['Name','Date (BS)','Time','Status','Marked By'].join(',') + '\n';
    const csvBody = out.map(o => [o.name,o.date_bs,o.time,o.status,o.marked_by].map(v => {
      if (v == null) return '';
      const s = String(v);
      return (s.includes(',') || s.includes('"') || s.includes('\n')) ? `"${s.replace(/"/g,'""')}"` : s;
    }).join(',')).join('\n');

    // Audit log
    await db('audit_logs').insert({
      action: 'EXPORT_CSV',
      user_id: req.user.id,
      details: JSON.stringify({ date_bs })
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="attendance_${date_bs || 'all'}.csv"`);
    res.send(header + csvBody);
  } catch (err) {
    console.error('GET /api/attendance/export error', err);
    res.status(500).json({ error: 'Export failed' });
  }
});

module.exports = router;
