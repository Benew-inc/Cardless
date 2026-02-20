/**
 * Database Migration Runner
 * 
 * Can be run automatically on startup or manually via CLI
 * For production, migrations should typically be run manually
 * to ensure proper review and testing
 */

const knex = require('knex');
const knexConfig = require('./knexfile');
const config = require('../config');
const { logSystem, logError } = require('../utils/logger');

/**
 * Run pending migrations
 * @param {boolean} runOnStartup - Whether to run migrations automatically on startup
 */
const runMigrations = async (runOnStartup = false) => {
  const environment = config.server.nodeEnv || 'development';
  const db = knex(knexConfig[environment]);

  try {
    logSystem('Checking for pending database migrations', { environment });
    
    const [batchNo, log] = await db.migrate.latest();
    
    if (log.length === 0) {
      logSystem('Database schema is up to date', { environment });
    } else {
      logSystem('Applied database migrations', {
        environment,
        batchNo,
        migrations: log,
      });
    }
  } catch (error) {
    logError(error, {
      component: 'migration',
      environment,
    });
    throw error;
  } finally {
    await db.destroy();
  }
};

/**
 * Rollback last migration batch
 */
const rollbackMigration = async () => {
  const environment = config.server.nodeEnv || 'development';
  const db = knex(knexConfig[environment]);

  try {
    logSystem('Rolling back last migration batch', { environment });
    
    const [batchNo, log] = await db.migrate.rollback();
    
    if (log.length === 0) {
      logSystem('No migrations to rollback', { environment });
    } else {
      logSystem('Rolled back migrations', {
        environment,
        batchNo,
        migrations: log,
      });
    }
  } catch (error) {
    logError(error, {
      component: 'migration',
      environment,
    });
    throw error;
  } finally {
    await db.destroy();
  }
};

// Run migrations if called directly
if (require.main === module) {
  const command = process.argv[2];
  
  if (command === 'rollback') {
    rollbackMigration()
      .then(() => process.exit(0))
      .catch(() => process.exit(1));
  } else {
    runMigrations()
      .then(() => process.exit(0))
      .catch(() => process.exit(1));
  }
}

module.exports = {
  runMigrations,
  rollbackMigration,
};
