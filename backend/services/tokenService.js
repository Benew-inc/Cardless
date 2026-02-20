const crypto = require('crypto');
const Joi = require('joi');
const config = require('../config');
const logger = require('../utils/logger'); // Assuming typical logger location

/**
 * Token Service
 * Handles generation and redemption of secure withdrawal tokens.
 */
class TokenService {
    constructor(db) {
        this.db = db;
        // Base58-like charset for better readability (no 0, O, l, I)
        this.charset = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    }

    /**
     * Generates a CSPRNG token string of given length.
     * @param {number} length 
     * @returns {string} plaintext token
     */
    generateRandomToken(length = 8) {
        let result = '';
        const randomBytes = crypto.randomBytes(length);
        for (let i = 0; i < length; i++) {
            // Map random byte (0-255) to a valid charset index via modulo
            // To strictly avoid modulo bias we would need more complex logic, 
            // but for 8 chars alphanumeric this is adequate high-entropy.
            result += this.charset[randomBytes[i] % this.charset.length];
        }
        return result;
    }

    /**
     * Hashes the plaintext token using SHA-256 and global salt.
     * @param {string} plaintextToken 
     * @returns {Buffer} binary hash for storing in DB
     */
    hashToken(plaintextToken) {
        return crypto.createHash('sha256')
            .update(plaintextToken)
            .update(config.token.salt)
            .digest();
    }

    /**
     * Validates parameters for token generation
     */
    validateGenerationParams(accountId, amount) {
        const schema = Joi.object({
            accountId: Joi.string().uuid().required(),
            amount: Joi.number().positive().precision(2).required()
        });
        return schema.validate({ accountId, amount });
    }

    /**
     * Generates and stores a new withdrawal token.
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

        try {
            const plaintextToken = this.generateRandomToken(8);
            const tokenHash = this.hashToken(plaintextToken);

            const expiresAt = new Date(Date.now() + config.token.expirySeconds * 1000);

            // Store in DB
            const [tokenRecord] = await this.db('tokens').insert({
                account_id: accountId,
                amount,
                token_hash: tokenHash,
                status: 'ACTIVE',
                expires_at: expiresAt
            }).returning('*');

            logger.info({ tokenId: tokenRecord.id, accountId }, 'Withdrawal token generated successfully');

            return {
                id: tokenRecord.id,
                token: plaintextToken, // the only time it's available!
                amount,
                expiresAt
            };
        } catch (err) {
            logger.error({ err, accountId }, 'Error generating withdrawal token');
            throw err;
        }
    }

    /**
     * Redeems a token securely. Enforces single-use via DB transaction row locks.
     * Uses the manual ACID-safe logic similar to the helper function.
     * @param {string} plaintextToken 
     * @param {string} agentId 
     * @param {Object} metadata 
     * @returns {Promise<Object>} Redemption result
     */
    async redeemWithdrawalToken(plaintextToken, agentId, metadata = {}) {
        if (!plaintextToken || !agentId) {
            throw new Error('Missing required redemption parameters');
        }

        const tokenHash = this.hashToken(plaintextToken);

        return await this.db.transaction(async (trx) => {
            // 1. Lock row FOR UPDATE to prevent concurrent redemption attempts
            const token = await trx('tokens')
                .where({ token_hash: tokenHash })
                .forUpdate() // CRITICAL: Row-level lock
                .first();

            if (!token) {
                logger.warn({ agentId }, 'Failed redemption attempt: INVALID hash');
                return { result: 'INVALID' };
            }

            // 2. Check USED status
            if (token.status === 'USED') {
                logger.warn({ tokenId: token.id, agentId }, 'Failed redemption attempt: Already USED');
                await trx('redemption_attempts').insert({
                    token_id: token.id,
                    agent_id: agentId,
                    result: 'USED',
                    metadata: JSON.stringify(metadata)
                });
                return { result: 'USED', tokenId: token.id };
            }

            // 3. Check Expired status / time
            if (token.status === 'EXPIRED' || new Date() >= new Date(token.expires_at)) {
                logger.info({ tokenId: token.id, agentId }, 'Failed redemption attempt: EXPIRED');

                // Update to EXPIRED if not already
                if (token.status !== 'EXPIRED') {
                    await trx('tokens').where({ id: token.id }).update({ status: 'EXPIRED' });
                }

                await trx('redemption_attempts').insert({
                    token_id: token.id,
                    agent_id: agentId,
                    result: 'EXPIRED',
                    metadata: JSON.stringify(metadata)
                });
                return { result: 'EXPIRED', tokenId: token.id };
            }

            // 4. Mark as USED exactly once
            await trx('tokens')
                .where({ id: token.id, status: 'ACTIVE' }) // Extra sanity check
                .update({
                    status: 'USED',
                    used_at: new Date()
                });

            // 5. Insert Immutable Ledger Transaction
            const [transaction] = await trx('transactions').insert({
                account_id: token.account_id,
                token_id: token.id,
                type: 'WITHDRAWAL',
                amount: token.amount,
                status: 'SUCCESS'
            }).returning('id');

            // 6. Insert Attempt Evidence
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
        });
    }
}

module.exports = TokenService;
