/**
 * Request Logging Middleware
 * 
 * Adds request correlation ID and logs all requests
 * Essential for audit trails in financial systems
 */

const { createChildLogger, logSystem } = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

/**
 * Request logging middleware
 * Adds request ID and logs request/response
 * 
 * Note: This is registered as a hook in server.js, not as middleware
 */
const requestLogger = async (request, reply) => {
  // Generate or use existing request ID
  request.id = request.id || uuidv4();
  
  // Create child logger with request context
  request.log = createChildLogger({
    request_id: request.id,
    ip: request.ip,
    method: request.method,
    url: request.url,
  });
  
  // Store start time for duration calculation
  request.startTime = Date.now();
  
  // Log request start
  request.log.info({
    event_type: 'SYSTEM',
    component: 'http',
    action: 'request_start',
  }, `${request.method} ${request.url}`);
};

/**
 * Response logging hook
 * Logs response when request completes
 */
const responseLogger = async (request, reply) => {
  const duration = Date.now() - (request.startTime || Date.now());
  
  if (request.log) {
    request.log.info({
      event_type: 'SYSTEM',
      component: 'http',
      action: 'request_complete',
      statusCode: reply.statusCode,
      duration,
    }, `${request.method} ${request.url} - ${reply.statusCode} (${duration}ms)`);
  }
};

module.exports = {
  requestLogger,
  responseLogger,
};
