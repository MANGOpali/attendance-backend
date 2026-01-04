// knexfile.js
module.exports = {
  development: {
    client: 'sqlite3',
    connection: { filename: './dev.sqlite3' },
    useNullAsDefault: true,
    migrations: { directory: './migrations' },
    seeds: { directory: './seeds' }
  },
  test: {
    client: 'sqlite3',
    connection: { filename: './test.sqlite3' }, // file DB so CLI and tests share same DB
    useNullAsDefault: true,
    migrations: { directory: './migrations' },
    seeds: { directory: './seeds' }
  },
  production: {
    client: 'pg',
    connection: process.env.DATABASE_URL,
    migrations: { directory: './migrations' },
    seeds: { directory: './seeds' }
  }
};
