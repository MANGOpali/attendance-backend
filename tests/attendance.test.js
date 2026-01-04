// tests/attendance.test.js
const request = require('supertest');
const app = require('../src/server');
const db = require('../src/db');

let token;

beforeAll(async () => {
  // Run migrations and seeds so tables and data exist
  await db.migrate.latest();
  await db.seed.run();

  // Login as seeded admin
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: 'admin@example.com', password: 'admin123' });

  token = res.body.token;
});

afterAll(async () => {
  // Close DB connection so Jest exits cleanly
  await db.destroy();
});

describe('Attendance endpoints', () => {
  it('should login seeded admin', async () => {
    expect(token).toBeDefined();
  });

  it('should mark attendance for Mango', async () => {
    const res = await request(app)
      .post('/api/attendance')
      .set('Authorization', 'Bearer ' + token)
      .send({ employee_id: 1, date_bs: '2082-01-01' });

    expect(res.statusCode).toBe(201);
    expect(res.body.id).toBeDefined();
  });

  it('should export CSV', async () => {
    const res = await request(app)
      .get('/api/attendance/export')
      .set('Authorization', 'Bearer ' + token);

    expect(res.statusCode).toBe(200);
    expect(res.text).toContain('Name,Date (BS),Time,Status,Marked By');
    expect(res.text).toContain('Mango');
  });
});
