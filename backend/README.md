# Financial Transaction System Backend

Production-grade Node.js backend using Fastify, PostgreSQL, and Redis, hardened for financial transaction processing.

## Features

### ✅ Centralized Configuration
- **Fail-fast validation** using Joi schema validation
- All required environment variables validated at startup
- Prevents running with invalid/missing configuration
- Type-safe configuration access

### ✅ Structured Logging
- JSON-formatted logs using Pino
- Request correlation IDs for tracing
- Event categories: SYSTEM, SECURITY, BUSINESS, ERROR
- Comprehensive audit trail for compliance

### ✅ Database Migrations
- Knex-based migration system
- Version-controlled schema changes
- Rollback capability
- Transaction-safe migrations

### ✅ Rate Limiting
- Redis-backed distributed rate limiting
- Per-IP and per-route limits
- Configurable thresholds
- Security event logging

### ✅ Error Handling
- Global error handler
- Sanitized error responses (no stack traces in production)
- Full error logging internally
- Request ID correlation

### ✅ Health Checks
- `/health` - Liveness probe
- `/ready` - Readiness probe (checks dependencies)
- Structured JSON responses
- Uptime tracking

## Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL 15+
- Redis 7+

### Installation

1. Install dependencies:
```bash
npm install
```

2. Copy environment file:
```bash
cp .env.example .env
```

3. Update `.env` with your configuration:
```env
PORT=3000
DATABASE_URL=postgresql://user:password@localhost:5432/cardless_db
REDIS_HOST=localhost
REDIS_PORT=6379
TOKEN_EXPIRY_SECONDS=3600
NODE_ENV=development
```

4. Run database migrations:
```bash
npm run migrate:latest
```

5. Start the server:
```bash
npm run dev  # Development
npm start    # Production
```

## Environment Variables

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `PORT` | Server port | `3000` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/db` |
| `REDIS_HOST` | Redis hostname | `localhost` |
| `REDIS_PORT` | Redis port | `6379` |
| `TOKEN_EXPIRY_SECONDS` | Token expiry time (60-86400) | `3600` |
| `NODE_ENV` | Environment (development/staging/production) | `development` |

### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `HOST` | Server host | `0.0.0.0` |
| `LOG_LEVEL` | Log level | `info` |
| `REDIS_PASSWORD` | Redis password | (empty) |
| `CORS_ORIGIN` | Allowed CORS origins | `*` |
| `RATE_LIMIT_WINDOW_MS` | Rate limit window | `60000` |
| `RATE_LIMIT_MAX_REQUESTS` | Max requests per window | `100` |
| `RUN_MIGRATIONS_ON_STARTUP` | Auto-run migrations | `false` |

## Database Migrations

### Run Migrations
```bash
npm run migrate:latest
```

### Rollback Last Migration
```bash
npm run migrate:rollback
```

### Migration Files
Migrations are located in `db/migrations/`. Each migration file:
- Has a version number prefix
- Contains `up()` and `down()` functions
- Runs in transactions for safety

## API Endpoints

### Health Checks

#### GET /health
Basic health check (liveness probe)
```json
{
  "status": "ok",
  "timestamp": "2026-02-20T12:00:00.000Z",
  "service": "backend",
  "uptime": 3600
}
```

#### GET /ready
Readiness check (checks dependencies)
```json
{
  "status": "ready",
  "timestamp": "2026-02-20T12:00:00.000Z",
  "uptime": 3600,
  "database": {
    "connected": true,
    "timestamp": "2026-02-20T12:00:00.000Z"
  },
  "redis": {
    "connected": true,
    "response": "PONG"
  }
}
```

## Architecture

### Folder Structure
```
backend/
├── config/          # Configuration modules
│   ├── index.js     # Centralized config with validation
│   ├── database.js  # PostgreSQL connection
│   └── redis.js     # Redis connection
├── db/              # Database migrations
│   ├── knexfile.js  # Knex configuration
│   └── migrations/  # Migration files
├── middleware/      # Express/Fastify middleware
│   ├── rateLimiter.js    # Rate limiting
│   └── requestLogger.js # Request logging
├── routes/          # Route definitions
├── controllers/     # Route controllers
├── services/        # Business logic
├── utils/           # Utilities
│   ├── logger.js    # Structured logging
│   ├── errors.js    # Error classes
│   └── errorHandler.js # Error handler
└── server.js        # Application entry point
```

### Design Principles

1. **Fail-Fast Configuration**: Invalid config prevents startup
2. **Structured Logging**: All logs are JSON with correlation IDs
3. **Security First**: Rate limiting, error sanitization, input validation
4. **Audit Trail**: All events logged for compliance
5. **Graceful Degradation**: System continues operating when possible

## Security Features

- ✅ Rate limiting (Redis-backed)
- ✅ Helmet.js security headers
- ✅ CORS configuration
- ✅ Input validation (Joi)
- ✅ Error sanitization (no stack traces in production)
- ✅ Request correlation IDs
- ✅ Security event logging

## Logging

### Log Format
All logs are JSON with the following structure:
```json
{
  "level": "INFO",
  "time": "2026-02-20T12:00:00.000Z",
  "request_id": "uuid-here",
  "event_type": "SYSTEM|SECURITY|BUSINESS|ERROR",
  "component": "component-name",
  "message": "Log message"
}
```

### Log Categories

- **SYSTEM**: Infrastructure events (startup, shutdown, health checks)
- **SECURITY**: Security events (auth failures, rate limits, suspicious activity)
- **BUSINESS**: Business logic events (transactions, token operations)
- **ERROR**: Errors, exceptions, failures

## Development

### Scripts
- `npm start` - Start production server
- `npm run dev` - Start development server with nodemon
- `npm run migrate:latest` - Run pending migrations
- `npm run migrate:rollback` - Rollback last migration
- `npm run lint` - Run ESLint
- `npm run format` - Format code with Prettier

## Production Deployment

### Docker

Build and run with Docker Compose:
```bash
docker-compose up
```

### Environment Setup

1. Set `NODE_ENV=production`
2. Configure production database URL
3. Set strong `REDIS_PASSWORD`
4. Configure `CORS_ORIGIN` (not `*`)
5. Set `RUN_MIGRATIONS_ON_STARTUP=false` (run migrations manually)
6. Configure log aggregation service

### Migration Strategy

**DO NOT** set `RUN_MIGRATIONS_ON_STARTUP=true` in production.

Instead:
1. Run migrations manually before deployment
2. Test migrations in staging first
3. Have rollback plan ready
4. Monitor migration execution

## Compliance & Audit

This system is designed with financial compliance in mind:

- ✅ All requests logged with correlation IDs
- ✅ Security events logged separately
- ✅ Database transactions for data integrity
- ✅ Audit log table for compliance
- ✅ Timestamps on all records
- ✅ No sensitive data in logs

## License

ISC
