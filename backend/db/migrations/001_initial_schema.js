/**
 * Initial Database Schema Migration
 * 
 * Financial System Design Decisions:
 * 1. UUID Primary Keys: Better than auto-incrementing integers
 *    - Prevents enumeration attacks (can't guess IDs)
 *    - Globally unique (important for distributed systems)
 *    - Better for security in financial systems
 * 
 * 2. Timestamps: Created/updated timestamps on all tables
 *    - Required for audit trails
 *    - Enables time-based queries and reporting
 *    - Critical for compliance (SOX, PCI-DSS)
 * 
 * 3. Indexes: Strategic indexes for performance
 *    - Foreign keys indexed for join performance
 *    - Frequently queried fields indexed
 *    - Important for financial systems handling high transaction volumes
 * 
 * 4. Constraints: Data integrity constraints
 *    - NOT NULL constraints prevent invalid data
 *    - Foreign keys ensure referential integrity
 *    - Unique constraints prevent duplicates
 *    - Critical for financial data accuracy
 * 
 * 5. Extensibility: Schema designed for future tokenized cash withdrawal system
 *    - Tokens table ready for implementation
 *    - Transaction tracking table included
 *    - User/account structure in place
 */

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  // Enable UUID extension
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

  // Users table (for future authentication/authorization)
  await knex.schema.createTable('users', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.string('email').notNullable().unique();
    table.string('phone').unique();
    table.string('name');
    table.boolean('is_active').defaultTo(true);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    
    table.index('email');
    table.index('phone');
  });

  // Accounts table (for future account management)
  await knex.schema.createTable('accounts', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.string('account_number').notNullable().unique();
    table.decimal('balance', 15, 2).notNullable().defaultTo(0);
    table.string('currency', 3).notNullable().defaultTo('USD');
    table.boolean('is_active').defaultTo(true);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    
    table.index('user_id');
    table.index('account_number');
  });

  // Tokens table (for tokenized cash withdrawal system)
  await knex.schema.createTable('tokens', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('account_id').notNullable().references('id').inTable('accounts').onDelete('CASCADE');
    table.string('token').notNullable().unique();
    table.decimal('amount', 15, 2).notNullable();
    table.string('currency', 3).notNullable().defaultTo('USD');
    table.string('status').notNullable().defaultTo('pending'); // pending, redeemed, expired, cancelled
    table.timestamp('expires_at').notNullable();
    table.timestamp('redeemed_at');
    table.string('redeemed_by_ip');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    
    table.index('token');
    table.index('account_id');
    table.index('status');
    table.index('expires_at');
  });

  // Transactions table (for transaction history and audit trail)
  await knex.schema.createTable('transactions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('account_id').notNullable().references('id').inTable('accounts').onDelete('CASCADE');
    table.uuid('token_id').references('id').inTable('tokens').onDelete('SET NULL');
    table.string('type').notNullable(); // withdrawal, deposit, transfer, etc.
    table.decimal('amount', 15, 2).notNullable();
    table.string('currency', 3).notNullable().defaultTo('USD');
    table.string('status').notNullable().defaultTo('pending'); // pending, completed, failed, cancelled
    table.text('description');
    table.jsonb('metadata'); // Additional transaction metadata
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    
    table.index('account_id');
    table.index('token_id');
    table.index('type');
    table.index('status');
    table.index('created_at');
  });

  // Audit log table (for compliance and security)
  await knex.schema.createTable('audit_logs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('user_id').references('id').inTable('users').onDelete('SET NULL');
    table.string('event_type').notNullable(); // SYSTEM, SECURITY, BUSINESS, ERROR
    table.string('action').notNullable(); // login, token_generated, token_redeemed, etc.
    table.string('resource_type'); // user, account, token, transaction
    table.uuid('resource_id');
    table.string('ip_address');
    table.string('user_agent');
    table.jsonb('metadata'); // Additional event metadata
    table.timestamp('created_at').defaultTo(knex.fn.now());
    
    table.index('user_id');
    table.index('event_type');
    table.index('action');
    table.index('resource_type');
    table.index('resource_id');
    table.index('created_at');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  // Drop tables in reverse order (respecting foreign key constraints)
  await knex.schema.dropTableIfExists('audit_logs');
  await knex.schema.dropTableIfExists('transactions');
  await knex.schema.dropTableIfExists('tokens');
  await knex.schema.dropTableIfExists('accounts');
  await knex.schema.dropTableIfExists('users');
};
