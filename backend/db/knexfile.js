/**
 * Knex Configuration for Database Migrations
 * 
 * Financial System Design Decisions:
 * 1. Schema Versioning: CRITICAL for production financial systems
 *    - Prevents schema drift between environments
 *    - Enables rollback of problematic schema changes
 *    - Required for reproducible deployments
 *    - Ensures all environments have identical schema
 * 
 * 2. Migration Tool: Knex provides robust migration capabilities
 *    - Version-controlled schema changes
 *    - Up and down migrations for rollback
 *    - Transaction support for safe migrations
 *    - Works well with PostgreSQL (our database)
 * 
 * 3. Environment-Specific Configs: Different settings per environment
 *    - Development: More permissive, verbose logging
 *    - Production: Strict, minimal logging, SSL required
 *    - Staging: Production-like for testing
 * 
 * 4. Migration Safety: All migrations run in transactions
 *    - Automatic rollback on failure
 *    - Prevents partial schema updates
 *    - Critical for data integrity
 */

require('dotenv').config();
const config = require('../config');

module.exports = {
  development: {
    client: 'postgresql',
    connection: config.database.url,
    pool: {
      min: 2,
      max: 10,
    },
    migrations: {
      directory: './migrations',
      tableName: 'knex_migrations',
    },
    seeds: {
      directory: './seeds',
    },
    debug: true,
  },

  staging: {
    client: 'postgresql',
    connection: config.database.url,
    pool: {
      min: 2,
      max: 10,
    },
    migrations: {
      directory: './migrations',
      tableName: 'knex_migrations',
    },
    seeds: {
      directory: './seeds',
    },
  },

  production: {
    client: 'postgresql',
    connection: {
      connectionString: config.database.url,
      ssl: { rejectUnauthorized: false },
    },
    pool: {
      min: 2,
      max: 20,
    },
    migrations: {
      directory: './migrations',
      tableName: 'knex_migrations',
    },
    seeds: {
      directory: './seeds',
    },
    // Disable debug in production
    debug: false,
  },

  // Use environment-specific config
  ...(config.server.nodeEnv && { [config.server.nodeEnv]: {} }),
};
