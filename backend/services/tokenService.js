const crypto = require('crypto');
const Joi = require('joi');
const config = require('../config');
const { logger } = require('../utils/logger');

/**
 * Token Service
 * Handles generation and redemption of secure withdrawal tokens.
 */
class TokenService {
    constructor(db) {
        this.db = db;
        // Strict uppercase alphanumeric charset as requested (A-Z, 0-9)
        this.charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        // Max retries for handling very rare token collisions
        this.MAX_RETRIES = 3;
    }

    /**
     * Generates a CSPRNG token string of given length using crypto.randomInt.
     * @param {number} length 
     * @returns {string} plaintext token
     */
    generateRandomToken(length = 8) {
        let result = '';
        for (let i = 0; i < length; i++) {
            // crypto.randomInt guarantees unbiased, uniformly distributed random numbers
            const randomIndex = crypto.randomInt(0, this.charset.length);
            result += this.charset[randomIndex];
        }
        return result;
    }

    /**
     * Hashes the plaintext token using SHA-256 with pepper and per-token salt.
     * Format: SHA256(pepper + token + salt)
     * @param {string} plaintextToken 
     * @param {Buffer} salt
     * @returns {Buffer} binary hash for storing in DB
     */
    hashToken(plaintextToken, salt) {
        return crypto.createHash('sha256')
            .update(config.token.pepper) // Global secret pepper
            .update(plaintextToken)
            .update(salt) // Per-token random salt
            .digest();
    }

    /**
     * Validates parameters for token generation
     */
    validateGenerationParams(accountId, amount) {
        const schema = Joi.object({
            accountId: Joi.string().uuid().required(),
            // Amount must be STRICTLY a positive integer (no floats)
            amount: Joi.number().integer().positive().required()
        });
        return schema.validate({ accountId, amount });
    }

    /**
     * Generates and stores a new withdrawal token.
     * Implements collision retry logic.
     * @param {string} accountId 
     * @param {number} amount 
     * @returns {Promise<Object>} The plaintext token and related info
     */
    async generateWithdrawalToken(accountId, amount) {
        const { error } = this.validateGenerationParams(accountId, amount);
        if (error) {
            const msg = `Invalid token generation params: ${error.message}`;
            logger.warn({ accountId, amount }, msg);
            throw new Error(msg);
        }

        let retries = 0;

        while (retries < this.MAX_RETRIES) {
            try {
                // High-entropy 8-character core
                const coreToken = this.generateRandomToken(8);

                // Non-secret random prefix (e.g. 4 chars) to enable O(1) row lookup later
                const tokenIdPrefix = this.generateRandomToken(4);
                const plaintextToken = `${tokenIdPrefix}-${coreToken}`;

                const salt = crypto.randomBytes(16); // 16 bytes for per-token salt
                const tokenHash = this.hashToken(plaintextToken, salt);

                const expiresAt = new Date(Date.now() + config.token.expirySeconds * 1000);

                const [tokenRecord] = await this.db('tokens').insert({
                    account_id: accountId,
                    amount,
                    token_hash: tokenHash,
                    salt: salt, // Persist the salt
                    prefix: tokenIdPrefix, // Store the non-secret prefix for fast lookup
                    status: 'ACTIVE',
                    expires_at: expiresAt
                }).returning('*');

                logger.info({ tokenId: tokenRecord.id, accountId }, 'Withdrawal token generated successfully');

                return {
                    id: tokenRecord.id,
                    token: plaintextToken, // Returned exactly once
                    amount,
                    expiresAt
                };
            } catch (err) {
                // Postgres unique violation code is '23505'
                if (err.code === '23505') {
                    retries++;
                    logger.warn({ accountId, retryAttempt: retries }, 'Token Hash Collision detected, retrying');
                    if (retries >= this.MAX_RETRIES) {
                        throw new Error('Failed to generate unique token after maximum retries');
                    }
                    continue;
                }

                logger.error({ err, accountId }, 'Error generating withdrawal token');
                throw err;
            }
        }
    }

    /**
   * Redeems a token securely. Enforces single-use via DB transaction row locks
   * and strict isolation levels.
   * @param {string} fullToken String containing prefix and core token (e.g. PREFIX-CORETOKEN)
   * @param {string} agentId 
   * @param {Object} metadata 
   * @returns {Promise<Object>} Redemption result
   */
    async redeemWithdrawalToken(fullToken, agentId, metadata = {}) {
        if (!fullToken || !fullToken.includes('-') || !agentId) {
            return { result: 'INVALID' };
        }

        const [prefix, coreToken] = fullToken.split('-');

        // Enforce length and constraints to prevent abuse
        if (prefix.length !== 4 || coreToken.length !== 8) {
            return { result: 'INVALID' };
        }

        return await this.db.transaction(async (trx) => {
            // 1. Fetch only ACTIVE tokens matching the non-secret prefix.
            const candidateTokens = await trx('tokens')
                .where({ prefix: prefix, status: 'ACTIVE' })
                .andWhere('expires_at', '>', new Date());

            let matchedTokenId = null;

            // Constant time verification loop to prevent timing attacks.
            for (const t of candidateTokens) {
                const candidateHash = this.hashToken(fullToken, t.salt);

                // Constant-time comparison
                if (crypto.timingSafeEqual(candidateHash, t.token_hash)) {
                    matchedTokenId = t.id;
                    break;
                }
            }

            if (!matchedTokenId) {
                logger.warn({ agentId, prefix }, 'Failed redemption attempt: INVALID token / hash mismatch');
                return { result: 'INVALID' };
            }

            // 2. We found the token. NOW we explicitly lock that specific row FOR UPDATE
            const token = await trx('tokens')
                .where({ id: matchedTokenId })
                .forUpdate() // CRITICAL: Row-level lock
                .first();

            if (!token || token.status !== 'ACTIVE' || new Date() >= new Date(token.expires_at)) {
                return { result: 'EXPIRED_OR_USED' };
            }

            // 3. Mark as USED exactly once
            await trx('tokens')
                .where({ id: token.id, status: 'ACTIVE' }) // Extra sanity check
                .update({
                    status: 'USED',
                    used_at: new Date()
                });

            // 4. Insert Immutable Ledger Transaction
            const [transaction] = await trx('transactions').insert({
                account_id: token.account_id,
                token_id: token.id,
                type: 'WITHDRAWAL',
                amount: token.amount,
                status: 'SUCCESS'
            }).returning('id');

            // 5. Insert Attempt Evidence
            await trx('redemption_attempts').insert({
                token_id: token.id,
                agent_id: agentId,
                result: 'SUCCESS',
                metadata: JSON.stringify(metadata)
            });

            logger.info({ tokenId: token.id, transactionId: transaction.id, agentId }, 'Token successfully redeemed');

            return {
                result: 'SUCCESS',
                tokenId: token.id,
                transactionId: transaction.id
            };
        }, { isolationLevel: 'repeatable read' });
    }

    /**
     * Gathers historical signals for risk evaluation.
     * @param {string} accountId 
     * @param {string} agentId 
     * @param {number} currentAmount 
     * @returns {Promise<Object>} Risk context data
     */
    async getRiskContext(accountId, agentId, currentAmount) {
        const now = new Date();
        const tenMinutesAgo = new Date(now - 10 * 60 * 1000);
        const twentyFourHoursAgo = new Date(now - 24 * 60 * 60 * 1000);

        // 1. Velocity: Tokens generated in last 10 minutes
        const recentTokensCount = await this.db('tokens')
            .where({ account_id: accountId })
            .andWhere('created_at', '>', tenMinutesAgo)
            .count('id as count')
            .first();

        // 2. Behavior: Average withdrawal amount for this account
        const avgAmountResult = await this.db('transactions')
            .where({ account_id: accountId, type: 'WITHDRAWAL', status: 'SUCCESS' })
            .avg('amount as avg')
            .first();

        // 3. Abuse: Failed redemption attempts in last 24 hours
        const failedAttemptsCount = await this.db('redemption_attempts as ra')
            .join('tokens as t', 'ra.token_id', 't.id')
            .where({ 't.account_id': accountId })
            .andWhere('ra.result', '<>', 'SUCCESS')
            .andWhere('ra.created_at', '>', twentyFourHoursAgo)
            .count('ra.id as count')
            .first();

        // 4. Geo/IP: Last successful redemption IP
        const lastSuccessAttempt = await this.db('redemption_attempts as ra')
            .join('tokens as t', 'ra.token_id', 't.id')
            .where({ 't.account_id': accountId, 'ra.result': 'SUCCESS' })
            .orderBy('ra.created_at', 'desc')
            .select('ra.metadata')
            .first();

        let lastIp = null;
        if (lastSuccessAttempt && lastSuccessAttempt.metadata) {
            try {
                const meta = typeof lastSuccessAttempt.metadata === 'string'
                    ? JSON.parse(lastSuccessAttempt.metadata)
                    : lastSuccessAttempt.metadata;
                lastIp = meta.ip;
            } catch (_e) {
                // Ignore parse errors
            }
        }

        return {
            velocity10m: parseInt(recentTokensCount?.count || 0),
            avgAmount: parseFloat(avgAmountResult?.avg || 0),
            failedAttempts24h: parseInt(failedAttemptsCount?.count || 0),
            lastIp,
            currentAmount
        };
    }
}

module.exports = TokenService;
