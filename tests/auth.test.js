// tests/auth.test.js
const request = require('supertest');
const app = require('../src/server');
const db = require('../src/db');

beforeAll(async () => {
  // Run migrations and seeds so tables and admin user exist
  await db.migrate.latest();
  await db.seed.run();
});

afterAll(async () => {
  // Close DB connection so Jest exits cleanly
  await db.destroy();
});

describe('Auth endpoints', () => {
  it('should login seeded admin', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@example.com', password: 'admin123' });

    expect(res.statusCode).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user).toMatchObject({ email: 'admin@example.com', role: 'Admin' });
  });
});
