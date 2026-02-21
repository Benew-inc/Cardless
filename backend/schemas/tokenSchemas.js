/**
 * Token Schema Definitions
 * 
 * Financial System Design Decisions:
 * 1. JSON Schema for Fastify: Extremely efficient for validation and serialization.
 * 2. Strict Schemas: prevent extra fields and ensure type safety.
 * 3. Standardized Error Formats: 400 for validation errors, 403 for risk, etc.
 */

const generateTokenSchema = {
    description: 'Generate a new withdrawal token',
    tags: ['tokens'],
    body: {
        type: 'object',
        required: ['accountId', 'amount'],
        properties: {
            accountId: { type: 'string', format: 'uuid' },
            amount: { type: 'integer', minimum: 1 }
        },
        additionalProperties: false
    },
    response: {
        201: {
            type: 'object',
            properties: {
                success: { type: 'boolean' },
                data: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', format: 'uuid' },
                        token: { type: 'string' },
                        amount: { type: 'number' },
                        expiresAt: { type: 'string', format: 'date-time' }
                    }
                }
            }
        }
    }
};

const redeemTokenSchema = {
    description: 'Redeem a withdrawal token',
    tags: ['tokens'],
    body: {
        type: 'object',
        required: ['token', 'accountId', 'agentId'],
        properties: {
            token: { type: 'string', pattern: '^[A-Z0-9]{4}-[A-Z0-9]{8}$' },
            accountId: { type: 'string', format: 'uuid' },
            agentId: { type: 'string' },
            metadata: {
                type: 'object',
                properties: {
                    ip: { type: 'string' },
                    deviceId: { type: 'string' },
                    location: { type: 'string' }
                },
                additionalProperties: true
            }
        },
        additionalProperties: false
    },
    response: {
        200: {
            description: 'Success',
            type: 'object',
            properties: {
                success: { type: 'boolean' },
                message: { type: 'string' },
                transactionId: { type: 'string', format: 'uuid' }
            }
        },
        400: {
            description: 'Bad Request / Invalid Token',
            type: 'object',
            properties: {
                error: { type: 'string' },
                message: { type: 'string' }
            }
        },
        403: {
            description: 'Redemption declined by risk policy',
            type: 'object',
            properties: {
                error: { type: 'string' },
                message: { type: 'string' },
                reasons: { type: 'array', items: { type: 'string' } }
            }
        },
        409: {
            description: 'Token Already Used or Expired',
            type: 'object',
            properties: {
                error: { type: 'string' }
            }
        },
        429: {
            description: 'Too Many Requests',
            type: 'object',
            properties: {
                error: {
                    type: 'object',
                    properties: {
                        message: { type: 'string' }
                    }
                }
            }
        }
    }
};

module.exports = {
    generateTokenSchema,
    redeemTokenSchema
};
