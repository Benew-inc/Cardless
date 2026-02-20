/**
 * Redis Connection Module
 * 
 * Financial System Design Decisions:
 * 1. Connection Pooling: Using ioredis with connection pool for high availability
 *    - Handles multiple concurrent requests efficiently
 *    - Automatic reconnection on failures (critical for financial systems)
 * 
 * 2. Caching Strategy: Redis used for:
 *    - Session management (user authentication tokens)
 *    - Rate limiting (prevent abuse/attacks)
 *    - Temporary data caching (reduces database load)
 *    - Real-time data (transaction status, account balances)
 * 
 * 3. Data Persistence: Using Redis for ephemeral data only
 *    - Financial data is NEVER stored solely in Redis
 *    - Redis is a cache layer, PostgreSQL is the source of truth
 *    - This ensures data durability and compliance requirements
 * 
 * 4. Error Handling: Graceful degradation
 *    - If Redis fails, system continues with database-only operations
 *    - Prevents single point of failure
 * 
 * 5. Security: Redis authentication and network isolation
 *    - Uses password authentication in production
 *    - Should be on private network (not exposed publicly)
 */

const Redis = require('ioredis');
const config = require('./index');

// Create Redis client with production-grade configuration
const redis = new Redis({
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password,
  // Connection pool settings
  maxRetriesPerRequest: 3,
  retryStrategy: (times) => {
    // Exponential backoff for reconnection
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  // Enable ready check
  enableReadyCheck: true,
  // Lazy connect - don't connect until first command
  lazyConnect: true,
  // Reconnect on error
  reconnectOnError: (err) => {
    const targetError = 'READONLY';
    if (err.message.includes(targetError)) {
      // Only reconnect when the error contains "READONLY"
      return true;
    }
    return false;
  },
});

// Handle Redis connection events
redis.on('connect', () => {
  console.log('Redis: Connected');
});

redis.on('ready', () => {
  console.log('Redis: Ready');
});

redis.on('error', (err) => {
  console.error('Redis connection error:', err.message);
  // In production, you might want to send alerts here
  // System continues to work without Redis (graceful degradation)
});

redis.on('close', () => {
  console.log('Redis: Connection closed');
});

redis.on('reconnecting', () => {
  console.log('Redis: Reconnecting...');
});

/**
 * Test Redis connection
 * Used for health checks
 */
const testConnection = async () => {
  try {
    const result = await redis.ping();
    return { connected: true, response: result };
  } catch (error) {
    return { connected: false, error: error.message };
  }
};

/**
 * Get a value from Redis cache
 * @param {string} key - Cache key
 * @returns {Promise<string|null>} Cached value or null
 */
const get = async (key) => {
  try {
    const value = await redis.get(key);
    return value ? JSON.parse(value) : null;
  } catch (error) {
    console.error('Redis GET error:', error.message);
    return null; // Graceful degradation
  }
};

/**
 * Set a value in Redis cache with optional expiration
 * @param {string} key - Cache key
 * @param {any} value - Value to cache
 * @param {number} ttl - Time to live in seconds (optional)
 * @returns {Promise<boolean>} Success status
 */
const set = async (key, value, ttl = null) => {
  try {
    const serialized = JSON.stringify(value);
    if (ttl) {
      await redis.setex(key, ttl, serialized);
    } else {
      await redis.set(key, serialized);
    }
    return true;
  } catch (error) {
    console.error('Redis SET error:', error.message);
    return false; // Graceful degradation
  }
};

/**
 * Delete a key from Redis cache
 * @param {string} key - Cache key to delete
 * @returns {Promise<boolean>} Success status
 */
const del = async (key) => {
  try {
    await redis.del(key);
    return true;
  } catch (error) {
    console.error('Redis DEL error:', error.message);
    return false; // Graceful degradation
  }
};

/**
 * Increment a counter (useful for rate limiting, transaction IDs)
 * @param {string} key - Counter key
 * @param {number} increment - Increment amount (default: 1)
 * @returns {Promise<number>} New counter value
 */
const incr = async (key, increment = 1) => {
  try {
    if (increment === 1) {
      return await redis.incr(key);
    }
    return await redis.incrby(key, increment);
  } catch (error) {
    console.error('Redis INCR error:', error.message);
    throw error; // Counter operations are critical, throw error
  }
};

/**
 * Set expiration on a key
 * @param {string} key - Cache key
 * @param {number} seconds - Expiration time in seconds
 * @returns {Promise<boolean>} Success status
 */
const expire = async (key, seconds) => {
  try {
    await redis.expire(key, seconds);
    return true;
  } catch (error) {
    console.error('Redis EXPIRE error:', error.message);
    return false;
  }
};

/**
 * Gracefully close Redis connection
 */
const close = async () => {
  await redis.quit();
};

module.exports = {
  redis,
  testConnection,
  get,
  set,
  del,
  incr,
  expire,
  close,
};
