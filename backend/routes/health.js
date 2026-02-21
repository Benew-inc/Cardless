/**
 * Health Check Routes
 * 
 * Financial System Design Decisions:
 * 1. Health Checks: Essential for production monitoring
 *    - Allows load balancers to route traffic correctly
 *    - Enables automatic failover
 *    - Critical for high-availability financial systems
 * 
 * 2. Dependency Checks: Verify database and Redis connectivity
 *    - Ensures system is fully operational before accepting traffic
 *    - Prevents serving requests when critical dependencies are down
 * 
 * 3. Readiness vs Liveness: Different endpoints for different purposes
 *    - /health: Basic health check (liveness)
 *    - /ready: Full readiness check including dependencies
 * 
 * 4. Structured Response: Consistent JSON structure for monitoring tools
 *    - Easy to parse and monitor
 *    - Includes uptime for performance tracking
 *    - Logs failures as ERROR events for alerting
 */

const { testConnection: testDbConnection } = require('../config/database');
const { testConnection: testRedisConnection } = require('../config/redis');
const { logError, logSystem, EVENT_TYPES } = require('../utils/logger');

// Track server start time for uptime calculation
const serverStartTime = Date.now();

/**
 * Basic health check endpoint (liveness probe)
 * Returns 200 if server is running
 * Used by Kubernetes/Docker health checks
 */
const healthCheck = async (_request, _reply) => {
  const uptime = Math.floor((Date.now() - serverStartTime) / 1000);

  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'backend',
    uptime: uptime, // Uptime in seconds
  };
};

/**
 * Readiness check endpoint (readiness probe)
 * Checks all dependencies (database, Redis)
 * Returns 200 only if all dependencies are healthy
 * Used by load balancers to determine if server can accept traffic
 */
const readinessCheck = async (_request, reply) => {
  const uptime = Math.floor((Date.now() - serverStartTime) / 1000);

  let dbStatus;
  let redisStatus;

  try {
    dbStatus = await testDbConnection();
  } catch (error) {
    logError(error, {
      component: 'health_check',
      dependency: 'database',
    });
    dbStatus = { connected: false, error: error.message };
  }

  try {
    redisStatus = await testRedisConnection();
  } catch (error) {
    logError(error, {
      component: 'health_check',
      dependency: 'redis',
    });
    redisStatus = { connected: false, error: error.message };
  }

  const isReady = dbStatus.connected && redisStatus.connected;

  // Log failures as ERROR events for monitoring/alerting
  if (!dbStatus.connected) {
    logError(new Error('Database connection failed'), {
      component: 'health_check',
      dependency: 'database',
      event_type: EVENT_TYPES.ERROR,
    });
  }

  if (!redisStatus.connected) {
    logError(new Error('Redis connection failed'), {
      component: 'health_check',
      dependency: 'redis',
      event_type: EVENT_TYPES.ERROR,
    });
  }

  if (!isReady) {
    reply.status(503); // Service Unavailable
  }

  return {
    status: isReady ? 'ready' : 'not ready',
    timestamp: new Date().toISOString(),
    uptime: uptime,
    database: {
      connected: dbStatus.connected,
      ...(dbStatus.timestamp && { timestamp: dbStatus.timestamp }),
      ...(dbStatus.error && { error: dbStatus.error }),
    },
    redis: {
      connected: redisStatus.connected,
      ...(redisStatus.response && { response: redisStatus.response }),
      ...(redisStatus.error && { error: redisStatus.error }),
    },
  };
};

module.exports = {
  healthCheck,
  readinessCheck,
};
