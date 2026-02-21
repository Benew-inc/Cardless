/**
 * Structured Logging Utility
 * 
 * Financial System Design Decisions:
 * 1. JSON Logging: Structured logs are essential for financial systems
 *    - Enables automated log analysis and alerting
 *    - Required for compliance audits and forensic investigations
 *    - Makes it easier to trace transactions and user actions
 *    - Critical for detecting fraud and security incidents
 *    - Allows correlation of events across distributed systems
 * 
 * 2. Request Correlation IDs: Every request gets a unique ID
 *    - Enables tracing a request through entire system
 *    - Critical for debugging production issues
 *    - Required for audit trails (who did what, when)
 *    - Helps correlate errors with specific user actions
 * 
 * 3. Event Categories: Categorize logs for different purposes
 *    - SYSTEM: Infrastructure events (startup, shutdown, health checks)
 *    - SECURITY: Security-related events (auth failures, rate limits, suspicious activity)
 *    - BUSINESS: Business logic events (transactions, token generation, redemptions)
 *    - ERROR: Error events (exceptions, failures, warnings)
 *    - Makes it easier to filter and analyze logs
 *    - Required for compliance reporting
 * 
 * 4. Log Levels: Appropriate levels for different scenarios
 *    - ERROR: System errors, exceptions, failures
 *    - WARN: Warnings, degraded functionality
 *    - INFO: Important business events, state changes
 *    - DEBUG: Detailed debugging information (development only)
 * 
 * 5. Audit Trail: All logs include timestamp and context
 *    - Timestamps are ISO 8601 format (standardized)
 *    - Includes user ID, request ID, IP address when available
 *    - Required for financial compliance (SOX, PCI-DSS, etc.)
 *    - Enables reconstruction of events for investigations
 */

const pino = require('pino');

/**
 * Create Pino logger instance with structured JSON output
 * Configured for production use with appropriate serializers
 */
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => {
      return { level: label.toUpperCase() };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  serializers: {
    req: (req) => ({
      id: req.id,
      method: req.method,
      url: req.url,
      path: req.routerPath,
      parameters: req.params,
      query: req.query,
      remoteAddress: req.ip,
      remotePort: req.socket?.remotePort,
    }),
    res: (res) => ({
      statusCode: res.statusCode,
    }),
    err: pino.stdSerializers.err,
  },
  // Redact sensitive information from logs to prevent exposure of PII and secrets
  redact: {
    paths: [
      'token',
      'accountId',
      'account_id',
      'token_hash',
      'salt',
      'password',
      'authorization',
      'cookie',
      'req.headers.authorization',
      'req.headers.cookie',
      'req.body.token',
      'req.body.accountId',
      'res.headers["set-cookie"]'
    ],
    remove: true // Instead of masking with [REDACTED], remove completely for security
  },
  // In production, disable pretty printing for performance
  transport: process.env.NODE_ENV === 'development' ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'HH:MM:ss Z',
      ignore: 'pid,hostname',
    },
  } : undefined,
});

/**
 * Log levels for different event types
 */
const LOG_LEVELS = {
  ERROR: 'error',
  WARN: 'warn',
  INFO: 'info',
  DEBUG: 'debug',
};

/**
 * Event categories for structured logging
 */
const EVENT_TYPES = {
  SYSTEM: 'SYSTEM',
  SECURITY: 'SECURITY',
  BUSINESS: 'BUSINESS',
  ERROR: 'ERROR',
};

/**
 * Create a child logger with additional context
 * Used to add request ID, user ID, etc. to all logs in a request
 * @param {Object} bindings - Additional fields to include in all logs
 * @returns {pino.Logger} Child logger instance
 */
const createChildLogger = (bindings = {}) => {
  return logger.child(bindings);
};

/**
 * Log a SYSTEM event
 * Used for infrastructure events: startup, shutdown, health checks, etc.
 * @param {string} message - Log message
 * @param {Object} context - Additional context data
 */
const logSystem = (message, context = {}) => {
  logger.info({
    event_type: EVENT_TYPES.SYSTEM,
    ...context,
  }, message);
};

/**
 * Log a SECURITY event
 * Used for security-related events: auth failures, rate limits, suspicious activity
 * @param {string} level - Log level (error, warn, info)
 * @param {string} message - Log message
 * @param {Object} context - Additional context data (IP, user ID, etc.)
 */
const logSecurity = (level, message, context = {}) => {
  const logFn = logger[level] || logger.warn;
  logFn({
    event_type: EVENT_TYPES.SECURITY,
    ...context,
  }, message);
};

/**
 * Log a BUSINESS event
 * Used for business logic events: transactions, token generation, redemptions
 * @param {string} message - Log message
 * @param {Object} context - Additional context data (transaction ID, amount, etc.)
 */
const logBusiness = (message, context = {}) => {
  logger.info({
    event_type: EVENT_TYPES.BUSINESS,
    ...context,
  }, message);
};

/**
 * Log an ERROR event
 * Used for errors, exceptions, failures
 * @param {Error|string} error - Error object or error message
 * @param {Object} context - Additional context data
 */
const logError = (error, context = {}) => {
  if (error instanceof Error) {
    logger.error({
      event_type: EVENT_TYPES.ERROR,
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
        code: error.code,
        statusCode: error.statusCode,
      },
      ...context,
    }, error.message);
  } else {
    logger.error({
      event_type: EVENT_TYPES.ERROR,
      ...context,
    }, error);
  }
};

/**
 * Log database operation
 * @param {string} operation - Operation name (query, transaction, etc.)
 * @param {Object} context - Additional context (query text, duration, etc.)
 */
const logDatabase = (operation, context = {}) => {
  logger.debug({
    event_type: EVENT_TYPES.SYSTEM,
    component: 'database',
    operation,
    ...context,
  }, `Database ${operation}`);
};

/**
 * Log Redis operation
 * @param {string} operation - Operation name (get, set, del, etc.)
 * @param {Object} context - Additional context (key, duration, etc.)
 */
const logRedis = (operation, context = {}) => {
  logger.debug({
    event_type: EVENT_TYPES.SYSTEM,
    component: 'redis',
    operation,
    ...context,
  }, `Redis ${operation}`);
};

module.exports = {
  logger,
  createChildLogger,
  logSystem,
  logSecurity,
  logBusiness,
  logError,
  logDatabase,
  logRedis,
  EVENT_TYPES,
  LOG_LEVELS,
};
