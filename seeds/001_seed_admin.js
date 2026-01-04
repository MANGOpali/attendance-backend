// seeds/001_seed_admin.js
const bcrypt = require('bcryptjs');

exports.seed = async function(knex) {
  // Clear tables
  await knex('attendance').del().catch(()=>{});
  await knex('employees').del().catch(()=>{});
  await knex('users').del().catch(()=>{});

  // Admin user
  const passwordHash = await bcrypt.hash('admin123', 10);
  await knex('users').insert({
    id: 1,
    name: 'Administrator',
    email: 'admin@example.com',
    password_hash: passwordHash,
    role: 'Admin'
  });

  // Employee
  await knex('employees').insert({ id: 1, name: 'Mango', linked_user_id: 1 });

  // Attendance row (include required fields)
  await knex('attendance').insert({
    id: 1,
    employee_id: 1,
    date_bs: '2082-01-01',
    date_ad: '2025-04-13',
    time_display: '10:00 AM',
    time_iso: '2025-04-13T10:00:00Z',
    status: 'Present',
    marked_by: 1
  });
};
