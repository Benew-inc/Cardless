/**
 * Redis-Backed Rate Limiting Middleware
 * 
 * Financial System Design Decisions:
 * 1. Rate Limiting: CRITICAL for financial systems
 *    - Prevents brute-force attacks on authentication endpoints
 *    - Protects against DDoS attacks
 *    - Prevents abuse of token generation endpoints
 *    - Reduces risk of account enumeration attacks
 *    - Protects database from being overwhelmed
 * 
 * 2. Redis-Backed: Distributed rate limiting
 *    - Works across multiple server instances
 *    - Consistent limits regardless of which server handles request
 *    - Required for horizontal scaling
 *    - Redis is fast enough for rate limit checks
 * 
 * 3. Per-IP Limiting: Limits requests per IP address
 *    - Prevents single IP from overwhelming system
 *    - Protects against automated attacks
 *    - Can be combined with per-user limiting for authenticated endpoints
 * 
 * 4. Per-Route Limiting: Different limits for different routes
 *    - Sensitive endpoints (token generation) can have stricter limits
 *    - Public endpoints can have more lenient limits
 *    - Prevents abuse of expensive operations
 * 
 * 5. Sliding Window: More accurate than fixed window
 *    - Prevents burst traffic at window boundaries
 *    - More fair to legitimate users
 *    - Better protection against distributed attacks
 * 
 * 6. Security Logging: Rate limit violations are logged as SECURITY events
 *    - Enables detection of attack patterns
 *    - Required for security monitoring and alerting
 *    - Helps identify compromised accounts or IPs
 */

const { redis } = require('../config/redis');
const { logSecurity } = require('../utils/logger');
const { RateLimitError } = require('../utils/errors');

// Lazy load config to avoid circular dependencies
const getConfig = () => require('../config');

/**
 * Rate limiter middleware factory
 * Creates a rate limiter with specific configuration
 * @param {Object} options - Rate limiter options
 * @param {number} options.windowMs - Time window in milliseconds
 * @param {number} options.maxRequests - Maximum requests per window
 * @param {string} options.keyGenerator - Function to generate rate limit key
 * @param {boolean} options.skipSuccessfulRequests - Skip counting successful requests
 * @returns {Function} Fastify middleware function
 */
const createRateLimiter = (options = {}) => {
  const config = getConfig();
  const {
    windowMs = config.rateLimit.windowMs,
    maxRequests = config.rateLimit.maxRequests,
    keyGenerator = (request) => `rate_limit:${request.ip}:${request.routerPath || request.url}`,
    skipSuccessfulRequests = config.rateLimit.skipSuccessfulRequests,
  } = options;

  return async (request, reply) => {
    const key = keyGenerator(request);
    const now = Date.now();
    const windowStart = now - windowMs;

    try {
      // Use Redis sorted set for sliding window rate limiting
      // Key: rate limit key
      // Score: timestamp
      // Value: request ID (unique per request)
      
      // Remove old entries outside the window
      await redis.zremrangebyscore(key, 0, windowStart);
      
      // Count current requests in window
      const currentCount = await redis.zcard(key);
      
      if (currentCount >= maxRequests) {
        // Rate limit exceeded
        const ttl = await redis.ttl(key);
        const resetTime = now + (ttl > 0 ? ttl * 1000 : windowMs);
        
        // Log security event
        logSecurity('warn', 'Rate limit exceeded', {
          ip: request.ip,
          path: request.routerPath || request.url,
          method: request.method,
          currentCount,
          maxRequests,
          windowMs,
          resetTime: new Date(resetTime).toISOString(),
        });
        
        // Return rate limit error
        reply.status(429).send({
          error: {
            message: 'Too many requests',
            statusCode: 429,
            retryAfter: Math.ceil((resetTime - now) / 1000),
            limit: maxRequests,
            windowMs,
          },
        });
        return;
      }
      
      // Add current request to sorted set
      const requestId = request.id || require('crypto').randomUUID();
      await redis.zadd(key, now, requestId);
      
      // Set expiration on key (cleanup)
      await redis.expire(key, Math.ceil(windowMs / 1000));
      
      // Add rate limit headers to response
      reply.header('X-RateLimit-Limit', maxRequests);
      reply.header('X-RateLimit-Remaining', Math.max(0, maxRequests - currentCount - 1));
      reply.header('X-RateLimit-Reset', new Date(now + windowMs).toISOString());
      
      // If skipSuccessfulRequests is true, remove entry on successful response
      if (skipSuccessfulRequests) {
        const originalSend = reply.send.bind(reply);
        reply.send = function (payload) {
          if (reply.statusCode < 400) {
            // Successful request, remove from count
            redis.zrem(key, requestId).catch(() => {
              // Ignore errors in cleanup
            });
          }
          return originalSend(payload);
        };
      }
    } catch (error) {
      // If Redis fails, log error but allow request (graceful degradation)
      // In production, you might want to fail closed for security
      logSecurity('error', 'Rate limiter Redis error', {
        error: error.message,
        ip: request.ip,
        path: request.routerPath || request.url,
      });
      
      // For financial systems, consider failing closed:
      // throw new Error('Rate limiting service unavailable');
      
      // Or fail open (current approach):
      // Allow request but log the error
    }
  };
};

/**
 * Default rate limiter (applied to all routes)
 * Uses configuration from config module
 */
const defaultRateLimiter = createRateLimiter();

/**
 * Strict rate limiter for sensitive endpoints
 * Lower limits for token generation, authentication, etc.
 */
const strictRateLimiter = createRateLimiter({
  windowMs: 60000, // 1 minute
  maxRequests: 10, // 10 requests per minute
});

/**
 * Per-user rate limiter (for authenticated endpoints)
 * Limits requests per user ID instead of IP
 */
const createUserRateLimiter = (options = {}) => {
  return createRateLimiter({
    ...options,
    keyGenerator: (request) => {
      const userId = request.user?.id || request.headers['x-user-id'];
      const path = request.routerPath || request.url;
      return `rate_limit:user:${userId}:${path}`;
    },
  });
};

module.exports = {
  createRateLimiter,
  defaultRateLimiter,
  strictRateLimiter,
  createUserRateLimiter,
};
