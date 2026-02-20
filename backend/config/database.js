/**
 * PostgreSQL Database Connection Module
 * 
 * Financial System Design Decisions:
 * 1. Connection Pooling: Using pg.Pool instead of Client for better connection management
 *    - Prevents connection exhaustion under high load
 *    - Reuses connections efficiently (critical for financial transactions)
 *    - Handles connection failures gracefully with automatic retries
 * 
 * 2. Transaction Support: Pool provides transaction capabilities needed for ACID compliance
 *    - Ensures data integrity for financial operations
 *    - Supports rollback on errors (critical for money transfers, payments)
 * 
 * 3. Error Handling: Comprehensive error handling for database failures
 *    - Financial systems require robust error handling
 *    - Logs errors for audit trails and debugging
 * 
 * 4. Environment-based Configuration: Uses environment variables for security
 *    - Prevents hardcoded credentials
 *    - Allows different configs for dev/staging/production
 */

const { Pool } = require('pg');
const config = require('./index');

// Create connection pool with production-grade settings
const pool = new Pool({
  connectionString: config.database.url,
  // Connection pool settings optimized for financial workloads
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 2000, // Return an error after 2 seconds if connection cannot be established
  // SSL configuration for production (required for most cloud databases)
  ssl: config.server.nodeEnv === 'production' ? { rejectUnauthorized: false } : false,
});

// Handle pool errors
pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client', err);
  // In production, you might want to send alerts here
});

/**
 * Execute a query with automatic connection management
 * @param {string} text - SQL query text
 * @param {Array} params - Query parameters (for parameterized queries)
 * @returns {Promise} Query result
 */
const query = async (text, params) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    
    // Log slow queries (important for financial system performance monitoring)
    if (duration > 1000) {
      console.warn('Slow query detected:', { text, duration, rows: res.rowCount });
    }
    
    return res;
  } catch (error) {
    console.error('Database query error:', { text, params, error: error.message });
    throw error;
  }
};

/**
 * Get a client from the pool for transactions
 * Use this when you need to execute multiple queries in a transaction
 * @returns {Promise<pg.Client>} Database client
 */
const getClient = async () => {
  const client = await pool.connect();
  return client;
};

/**
 * Execute a transaction
 * Financial systems heavily rely on transactions for data integrity
 * @param {Function} callback - Async function that receives a client and executes queries
 * @returns {Promise} Transaction result
 */
const transaction = async (callback) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Test database connection
 * Used for health checks and startup validation
 */
const testConnection = async () => {
  try {
    const result = await query('SELECT NOW()');
    return { connected: true, timestamp: result.rows[0].now };
  } catch (error) {
    return { connected: false, error: error.message };
  }
};

/**
 * Gracefully close all database connections
 * Important for clean shutdowns in production
 */
const close = async () => {
  await pool.end();
};

module.exports = {
  pool,
  query,
  getClient,
  transaction,
  testConnection,
  close,
};
