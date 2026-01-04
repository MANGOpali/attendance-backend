const request = require('supertest');
const app = require('../src/server');
const db = require('../src/db');

let token;

beforeAll(async () => {
  await db.migrate.latest();
  await db.seed.run();

  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: 'admin@example.com', password: 'admin123' });

  token = res.body.token;
});

afterAll(async () => {
  await db.destroy();
});

describe('Export CSV', () => {
  it('should export CSV', async () => {
    const res = await request(app)
      .get('/api/attendance/export')
      .set('Authorization', 'Bearer ' + token);

    expect(res.statusCode).toBe(200);
    expect(res.text).toContain('Name,Date (BS),Time,Status,Marked By');
    expect(res.text).toContain('Mango');
  });
});
