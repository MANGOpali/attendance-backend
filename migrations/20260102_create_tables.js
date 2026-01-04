exports.up = function(knex) {
  return knex.schema
    .createTable('users', t => {
      t.increments('id').primary();
      t.string('name').notNullable();
      t.string('email').notNullable().unique();
      t.string('password_hash').notNullable();
      t.string('role').notNullable();
      t.timestamp('created_at').defaultTo(knex.fn.now());
    })
    .createTable('employees', t => {
      t.increments('id').primary();
      t.string('name').notNullable();
      t.integer('linked_user_id').unsigned().references('id').inTable('users').onDelete('SET NULL');
      t.timestamp('created_at').defaultTo(knex.fn.now());
    })
    .createTable('attendance', t => {
      t.increments('id').primary();
      t.integer('employee_id').unsigned().notNullable().references('id').inTable('employees').onDelete('CASCADE');
      t.string('date_bs').notNullable();
      t.date('date_ad').notNullable();
      t.time('time_iso').notNullable();
      t.string('time_display').notNullable();
      t.string('status').notNullable();
      t.integer('marked_by').unsigned().references('id').inTable('users');
      t.timestamp('created_at').defaultTo(knex.fn.now());
      t.unique(['employee_id','date_bs']);
    });
};

exports.down = function(knex) {
  return knex.schema
    .dropTableIfExists('attendance')
    .dropTableIfExists('employees')
    .dropTableIfExists('users');
};
