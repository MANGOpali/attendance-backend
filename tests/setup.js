const db = require('../src/db');

module.exports = async () => {
  await db.migrate.latest();
  await db.seed.run();
};
