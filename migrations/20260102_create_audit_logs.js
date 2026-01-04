// migrations/20260102_create_audit_logs.js
exports.up = async function(knex) {
  await knex.schema.createTable('audit_logs', table => {
    table.increments('id').primary();
    table.string('action').notNullable(); // e.g. 'MARK_ATTENDANCE', 'EXPORT_CSV', 'LINK_EMPLOYEE'
    table.integer('user_id').unsigned().references('id').inTable('users').onDelete('SET NULL');
    table.timestamp('timestamp').defaultTo(knex.fn.now());
    table.json('details'); // flexible JSON payload
  });
};

exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('audit_logs');
};
