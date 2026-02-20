const TokenService = require('../services/tokenService');
const crypto = require('crypto');

// Mock Config Object
jest.mock('../config', () => ({
    token: {
        expirySeconds: 300,
        salt: 'test_super_secure_salt_value_16_chars_plus'
    }
}));

// Mock logger
jest.mock('../utils/logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
}));

describe('TokenService Security & Expiry Logic', () => {
    let tokenService;
    let mockDb;
    let mockTrx;

    beforeEach(() => {
        // Reset DB mock state
        mockDb = jest.fn();
        mockDb.insert = jest.fn().mockReturnThis();
        mockDb.returning = jest.fn().mockResolvedValue([{ id: 'mock-token-uuid' }]);

        mockTrx = jest.fn();
        mockTrx.where = jest.fn().mockReturnThis();
        mockTrx.forUpdate = jest.fn().mockReturnThis();
        mockTrx.first = jest.fn();
        mockTrx.update = jest.fn().mockResolvedValue(1);
        mockTrx.insert = jest.fn().mockReturnThis();
        mockTrx.returning = jest.fn().mockResolvedValue([{ id: 'mock-tx-uuid' }]);

        // Make mockDb support both standard knex queries and transactions
        const dbInstance = (table) => {
            // Very basic mimic of Knex chained API
            const chain = {
                insert: mockDb.insert,
                returning: mockDb.returning
            };
            return chain;
        };
        dbInstance.transaction = jest.fn(async (callback) => {
            const trxInstance = (table) => {
                return {
                    where: mockTrx.where,
                    forUpdate: mockTrx.forUpdate,
                    first: mockTrx.first,
                    update: mockTrx.update,
                    insert: mockTrx.insert,
                    returning: mockTrx.returning
                };
            };
            return await callback(trxInstance);
        });

        tokenService = new TokenService(dbInstance);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('Token Generation (generateRandomToken)', () => {
        it('should generate an 8 character token', () => {
            const token = tokenService.generateRandomToken();
            expect(token).toBeDefined();
            expect(typeof token).toBe('string');
            expect(token.length).toBe(8);
        });

        it('should contain only alphanumeric characters without confusing chars', () => {
            const token = tokenService.generateRandomToken(100);
            const invalidChars = /[0OlI\-\_\!]/; // Basic check for excluded chars
            expect(invalidChars.test(token)).toBe(false);
        });
    });

    describe('Token Hashing (hashToken)', () => {
        it('should generate consistent SHA-256 hashes with the configured salt', () => {
            const plaintext = 'token123';
            const hash1 = tokenService.hashToken(plaintext);
            const hash2 = tokenService.hashToken(plaintext);

            expect(hash1.equals(hash2)).toBe(true);

            const expectedManualHash = crypto.createHash('sha256')
                .update(plaintext)
                .update('test_super_secure_salt_value_16_chars_plus') // from our mock config above
                .digest();

            expect(hash1.equals(expectedManualHash)).toBe(true);
        });
    });

    describe('generateWithdrawalToken()', () => {
        it('should validate params and throw error on invalid amounts', async () => {
            const accountId = crypto.randomUUID();
            await expect(tokenService.generateWithdrawalToken(accountId, -50)).rejects.toThrow();
            await expect(tokenService.generateWithdrawalToken(accountId, 0)).rejects.toThrow();
        });

        it('should successfully store new token and return plaintext token', async () => {
            const accountId = crypto.randomUUID();
            const result = await tokenService.generateWithdrawalToken(accountId, 100);

            expect(result.token).toBeDefined();
            expect(result.token.length).toBe(8);
            expect(result.amount).toBe(100);

            expect(mockDb.insert).toHaveBeenCalledTimes(1);

            // Verify expire time was properly calculated (+300s)
            const now = Date.now();
            const expiresTime = result.expiresAt.getTime();
            expect(expiresTime - now).toBeGreaterThan(290000);
            expect(expiresTime - now).toBeLessThan(310000);
        });
    });

    describe('redeemWithdrawalToken()', () => {
        it('should throw if params missing', async () => {
            await expect(tokenService.redeemWithdrawalToken(null, 'agent-1')).rejects.toThrow('Missing required redemption parameters');
        });

        it('should correctly handle successful redemption', async () => {
            // Mock active, not-expired token in DB
            mockTrx.first.mockResolvedValueOnce({
                id: 'token-uuid',
                account_id: crypto.randomUUID(),
                amount: 200,
                status: 'ACTIVE',
                expires_at: new Date(Date.now() + 10000) // Future expiry
            });

            const res = await tokenService.redeemWithdrawalToken('validToken', 'atm-1');

            expect(mockTrx.forUpdate).toHaveBeenCalled(); // Ensure row lock happened
            expect(res.result).toBe('SUCCESS');

            // Verify USED update
            expect(mockTrx.update).toHaveBeenCalledWith(expect.objectContaining({
                status: 'USED'
            }));

            // Verify Transaction Ledger Insert
            expect(mockTrx.insert).toHaveBeenCalledWith(expect.objectContaining({
                type: 'WITHDRAWAL',
                amount: 200,
                status: 'SUCCESS'
            }));
        });

        it('should reject already USED tokens to prevent double-spend', async () => {
            mockTrx.first.mockResolvedValueOnce({
                id: 'token-uuid',
                status: 'USED'
            });

            const res = await tokenService.redeemWithdrawalToken('usedToken', 'atm-1');

            expect(res.result).toBe('USED');
            expect(mockTrx.update).not.toHaveBeenCalled(); // No status update
        });

        it('should reject and update expired tokens', async () => {
            mockTrx.first.mockResolvedValueOnce({
                id: 'token-uuid',
                status: 'ACTIVE',
                expires_at: new Date(Date.now() - 10000) // Past expiry
            });

            const res = await tokenService.redeemWithdrawalToken('expiredToken', 'atm-1');

            expect(res.result).toBe('EXPIRED');
            expect(mockTrx.update).toHaveBeenCalledWith({ status: 'EXPIRED' });
        });

        it('should return INVALID if token not found (wrong plaintext token)', async () => {
            mockTrx.first.mockResolvedValueOnce(null);

            const res = await tokenService.redeemWithdrawalToken('fakeToken', 'atm-1');

            expect(res.result).toBe('INVALID');
        });
    });
});
