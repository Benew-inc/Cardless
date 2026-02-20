/**
 * Custom Error Classes and Error Handling Utilities
 * 
 * Financial System Design Decisions:
 * 1. Custom Error Classes: Different error types for different scenarios
 *    - Allows for specific error handling and logging
 *    - Helps with debugging and monitoring
 *    - Enables proper HTTP status codes
 * 
 * 2. Error Logging: Comprehensive error logging for audit trails
 *    - Financial systems require detailed audit logs
 *    - Helps with compliance and security investigations
 * 
 * 3. User-Friendly Messages: Separate internal errors from user messages
 *    - Prevents information leakage (security)
 *    - Provides better user experience
 * 
 * 4. Error Context: Include context in errors for better debugging
 *    - Request IDs, user IDs, transaction IDs
 *    - Helps trace errors through distributed systems
 */

/**
 * Base Application Error
 * All custom errors extend this class
 */
class AppError extends Error {
  constructor(message, statusCode = 500, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Bad Request Error (400)
 * Used for validation errors, malformed requests
 */
class BadRequestError extends AppError {
  constructor(message = 'Bad Request') {
    super(message, 400);
  }
}

/**
 * Unauthorized Error (401)
 * Used when authentication is required but missing/invalid
 */
class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401);
  }
}

/**
 * Forbidden Error (403)
 * Used when user is authenticated but lacks permission
 */
class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, 403);
  }
}

/**
 * Not Found Error (404)
 * Used when resource doesn't exist
 */
class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404);
  }
}

/**
 * Conflict Error (409)
 * Used when request conflicts with current state
 * Common in financial systems (e.g., duplicate transaction)
 */
class ConflictError extends AppError {
  constructor(message = 'Conflict') {
    super(message, 409);
  }
}

/**
 * Validation Error (422)
 * Used for business logic validation failures
 */
class ValidationError extends AppError {
  constructor(message = 'Validation failed', errors = []) {
    super(message, 422);
    this.errors = errors;
  }
}

/**
 * Database Error (500)
 * Used for database-related errors
 */
class DatabaseError extends AppError {
  constructor(message = 'Database error', originalError = null) {
    super(message, 500);
    this.originalError = originalError;
  }
}

/**
 * Rate Limit Error (429)
 * Used when rate limit is exceeded
 */
class RateLimitError extends AppError {
  constructor(message = 'Too many requests') {
    super(message, 429);
  }
}

/**
 * Format error response for client
 * @param {Error} error - Error object
 * @param {Object} request - Fastify request object
 * @returns {Object} Formatted error response
 */
const formatErrorResponse = (error, request) => {
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  // Base error response
  const response = {
    error: {
      message: error.message || 'Internal Server Error',
      statusCode: error.statusCode || 500,
    },
  };

  // Include stack trace in development
  if (isDevelopment && error.stack) {
    response.error.stack = error.stack;
  }

  // Include validation errors if present
  if (error.errors && Array.isArray(error.errors)) {
    response.error.errors = error.errors;
  }

  // Include request ID for tracing
  if (request && request.id) {
    response.error.requestId = request.id;
  }

  // Don't expose internal error details in production
  if (!isDevelopment && !error.isOperational) {
    response.error.message = 'An unexpected error occurred';
  }

  return response;
};

/**
 * Log error with context
 * Uses structured logging for better audit trails
 * @param {Error} error - Error object
 * @param {Object} request - Fastify request object
 */
const logError = (error, request = null) => {
  // Use structured logger if available, otherwise fallback to console
  try {
    const { logError: structuredLogError } = require('./logger');
    structuredLogError(error, {
      request_id: request?.id,
      ip: request?.ip,
      method: request?.method,
      url: request?.url,
      path: request?.routerPath,
    });
  } catch (loggerError) {
    // Fallback if logger not available
    const logData = {
      error: {
        name: error.name,
        message: error.message,
        statusCode: error.statusCode,
        stack: error.stack,
      },
    };

    if (request) {
      logData.request = {
        id: request.id,
        method: request.method,
        url: request.url,
      };
    }

    console.error('Error occurred:', JSON.stringify(logData, null, 2));
  }
};

module.exports = {
  AppError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  ValidationError,
  DatabaseError,
  RateLimitError,
  formatErrorResponse,
  logError,
};
