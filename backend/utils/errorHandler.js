/**
 * Global Error Handler Middleware
 * 
 * Financial System Design Decisions:
 * 1. Centralized Error Handling: Single point for all error handling
 *    - Ensures consistent error responses
 *    - Makes error handling easier to maintain and update
 *    - Critical for financial systems where error handling must be consistent
 * 
 * 2. Error Classification: Distinguishes between operational and programming errors
 *    - Operational errors: Expected errors (validation, not found, etc.)
 *    - Programming errors: Bugs, unexpected errors
 *    - Different handling strategies for each type
 * 
 * 3. Security: Prevents information leakage
 *    - Internal error details not exposed to clients
 *    - Prevents attackers from learning about system internals
 *    - Important for financial systems handling sensitive data
 * 
 * 4. Logging: Comprehensive error logging for audit trails
 *    - All errors logged with context
 *    - Required for compliance and security investigations
 *    - Helps with debugging and monitoring
 * 
 * 5. Graceful Degradation: System continues operating despite errors
 *    - Prevents cascading failures
 *    - Returns appropriate HTTP status codes
 */

const { formatErrorResponse, logError, AppError } = require('./errors');
const { logError: structuredLogError, EVENT_TYPES } = require('./logger');

/**
 * Global error handler for Fastify
 * This handler catches all errors thrown in routes, hooks, or plugins
 * 
 * Financial System Design Decisions:
 * 1. Never Leak Internal Details: Critical security requirement
 *    - Stack traces, file paths, and internal errors expose system architecture
 *    - Attackers can use this information to craft targeted attacks
 *    - Financial systems are high-value targets - minimize attack surface
 *    - Compliance requirements (PCI-DSS, SOX) mandate secure error handling
 * 
 * 2. Full Internal Logging: Log everything internally for debugging
 *    - Full error details logged server-side for developers
 *    - Enables forensic analysis of security incidents
 *    - Required for compliance audits
 *    - Helps identify patterns in errors
 * 
 * 3. Sanitized Client Responses: Only safe information sent to clients
 *    - Generic error messages prevent information leakage
 *    - Request ID included for support ticket correlation
 *    - Appropriate HTTP status codes for proper client handling
 */
const errorHandler = (error, request, reply) => {
  // Log the error with full context using structured logging
  structuredLogError(error, {
    request_id: request?.id,
    ip: request?.ip,
    method: request?.method,
    url: request?.url,
    path: request?.routerPath,
    user_id: request?.user?.id,
    body: request?.body,
    query: request?.query,
    params: request?.params,
  });

  // Also use legacy logError for compatibility
  logError(error, request);

  // Determine status code
  const statusCode = error.statusCode || 500;

  // Format error response (sanitized for client)
  const response = formatErrorResponse(error, request);

  // Send error response
  reply.status(statusCode).send(response);
};

/**
 * Handle unhandled promise rejections
 * Prevents application crashes from unhandled async errors
 */
const setupUnhandledRejectionHandler = () => {
  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    // In production, you might want to:
    // - Send alert to monitoring service
    // - Log to external logging service
    // - Gracefully shutdown the application
  });
};

/**
 * Handle uncaught exceptions
 * Last resort error handler
 */
const setupUncaughtExceptionHandler = () => {
  process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    // In production, you should gracefully shutdown
    // process.exit(1);
  });
};

/**
 * Initialize all error handlers
 */
const initializeErrorHandlers = () => {
  setupUnhandledRejectionHandler();
  setupUncaughtExceptionHandler();
};

module.exports = {
  errorHandler,
  initializeErrorHandlers,
};
