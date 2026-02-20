/**
 * Fastify Server Entry Point
 * 
 * Financial System Design Decisions:
 * 1. Modular Architecture: Server setup separated into modules
 *    - Easier to test and maintain
 *    - Better code organization
 *    - Allows for different configurations per environment
 * 
 * 2. Graceful Shutdown: Handles shutdown signals properly
 *    - Closes database connections cleanly
 *    - Prevents data corruption
 *    - Important for financial systems where data integrity is critical
 * 
 * 3. Error Handling: Global error handler registered early
 *    - Catches all errors consistently
 *    - Provides audit trail for all errors
 * 
 * 4. Security Plugins: Helmet and CORS configured
 *    - Protects against common web vulnerabilities
 *    - Critical for financial systems handling sensitive data
 * 
 * 5. Configuration Validation: Fail-fast on invalid config
 *    - Prevents running with invalid/missing configuration
 *    - Catches errors before accepting requests
 *    - Critical for financial systems
 */

// Load and validate configuration FIRST (fail-fast)
// This must happen before any other imports that depend on config
const config = require('./config');

// Initialize structured logging
const { logger, logSystem, logError, EVENT_TYPES } = require('./utils/logger');

// Create Fastify instance with structured logging
const fastify = require('fastify')({
  logger: logger,
  // Request ID generation for tracing
  genReqId: (req) => req.id || require('crypto').randomUUID(),
  // Disable request logging in production (can be verbose)
  disableRequestLogging: config.server.nodeEnv === 'production',
});

// Import modules
const { initializeErrorHandlers, errorHandler } = require('./utils/errorHandler');
const { testConnection: testDbConnection } = require('./config/database');
const { testConnection: testRedisConnection } = require('./config/redis');
const registerRoutes = require('./routes');
const { requestLogger, responseLogger } = require('./middleware/requestLogger');
const { defaultRateLimiter } = require('./middleware/rateLimiter');

/**
 * Register Fastify plugins and middleware
 */
const registerPlugins = async () => {
  // Request logging hooks (adds correlation ID and logs requests/responses)
  await fastify.register(async (fastify) => {
    fastify.addHook('onRequest', requestLogger);
    fastify.addHook('onSend', responseLogger);
  });

  // Security: Helmet sets various HTTP headers for security
  await fastify.register(require('@fastify/helmet'), {
    // Content Security Policy for financial systems
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
      },
    },
  });

  // CORS: Configure Cross-Origin Resource Sharing
  await fastify.register(require('@fastify/cors'), {
    origin: config.cors.origin,
    credentials: true,
    // In production, specify exact origins for security
  });

  // Rate limiting middleware (applied to all routes)
  await fastify.register(async (fastify) => {
    fastify.addHook('onRequest', defaultRateLimiter);
  });

  // Register global error handler
  fastify.setErrorHandler(errorHandler);
};

/**
 * Initialize database connections
 */
const initializeConnections = async () => {
  // Test database connection
  const dbStatus = await testDbConnection();
  if (!dbStatus.connected) {
    logError(new Error('Database connection failed'), {
      component: 'startup',
      dependency: 'database',
      error: dbStatus.error,
    });
    throw new Error('Database connection failed');
  }
  logSystem('PostgreSQL connected successfully', {
    component: 'startup',
    dependency: 'database',
  });

  // Test Redis connection (non-blocking - system can work without Redis)
  const redisStatus = await testRedisConnection();
  if (redisStatus.connected) {
    logSystem('Redis connected successfully', {
      component: 'startup',
      dependency: 'redis',
    });
  } else {
    logError(new Error('Redis connection failed'), {
      component: 'startup',
      dependency: 'redis',
      error: redisStatus.error,
      severity: 'warning', // Non-critical, system can continue
    });
    fastify.log.warn('System will continue without Redis caching');
  }
};

/**
 * Run database migrations (optional on startup)
 * In production, migrations should typically be run manually
 * Set RUN_MIGRATIONS_ON_STARTUP=true to enable automatic migrations
 */
const runMigrationsIfEnabled = async () => {
  if (process.env.RUN_MIGRATIONS_ON_STARTUP === 'true') {
    try {
      const { runMigrations } = require('./db/migrate');
      await runMigrations(true);
      logSystem('Database migrations completed', {
        component: 'startup',
        action: 'migrations',
      });
    } catch (error) {
      logError(error, {
        component: 'startup',
        action: 'migrations',
      });
      // In production, you might want to fail fast if migrations fail
      if (config.server.nodeEnv === 'production') {
        throw error;
      }
    }
  }
};

/**
 * Register routes
 */
const initializeRoutes = async () => {
  await registerRoutes(fastify);
  logSystem('Routes registered', {
    component: 'startup',
    action: 'routes_registered',
  });
};

/**
 * Graceful shutdown handler
 * Important for financial systems to ensure data integrity
 */
const setupGracefulShutdown = () => {
  const shutdown = async (signal) => {
    logSystem(`${signal} received, starting graceful shutdown`, {
      component: 'shutdown',
      signal,
    });

    try {
      // Close Fastify server (stops accepting new requests)
      await fastify.close();
      logSystem('Fastify server closed', {
        component: 'shutdown',
      });

      // Close database connections
      const { close: closeDb } = require('./config/database');
      await closeDb();
      logSystem('Database connections closed', {
        component: 'shutdown',
      });

      // Close Redis connection
      const { close: closeRedis } = require('./config/redis');
      await closeRedis();
      logSystem('Redis connection closed', {
        component: 'shutdown',
      });

      logSystem('Graceful shutdown completed', {
        component: 'shutdown',
      });
      process.exit(0);
    } catch (error) {
      logError(error, {
        component: 'shutdown',
      });
      process.exit(1);
    }
  };

  // Handle shutdown signals
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Handle uncaught exceptions (last resort)
  process.on('uncaughtException', (error) => {
    logError(error, {
      component: 'process',
      event_type: EVENT_TYPES.ERROR,
    });
    shutdown('uncaughtException');
  });
};

/**
 * Start the server
 */
const start = async () => {
  try {
    logSystem('Starting server', {
      component: 'startup',
      environment: config.server.nodeEnv,
      port: config.server.port,
    });

    // Initialize error handlers
    initializeErrorHandlers();

    // Register plugins
    await registerPlugins();

    // Run migrations if enabled
    await runMigrationsIfEnabled();

    // Initialize database connections
    await initializeConnections();

    // Register routes
    await initializeRoutes();

    // Setup graceful shutdown
    setupGracefulShutdown();

    // Start server
    await fastify.listen({
      port: config.server.port,
      host: config.server.host,
    });

    logSystem('Server started successfully', {
      component: 'startup',
      environment: config.server.nodeEnv,
      port: config.server.port,
      host: config.server.host,
    });
  } catch (error) {
    logError(error, {
      component: 'startup',
      event_type: EVENT_TYPES.ERROR,
    });
    process.exit(1);
  }
};

// Start the server
start();
