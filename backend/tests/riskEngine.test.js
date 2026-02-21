const RiskEngine = require('../services/riskEngine');

describe('RiskEngine Unit Tests', () => {
    const defaultContext = {
        velocity10m: 0,
        avgAmount: 100,
        failedAttempts24h: 0,
        lastIp: '127.0.0.1',
        currentAmount: 100
    };

    const defaultMetadata = { ip: '127.0.0.1' };

    it('approves a normal request', () => {
        const result = RiskEngine.evaluateRedemption(defaultContext, defaultMetadata);
        expect(result.score).toBe(0);
        expect(result.decision).toBe('APPROVE');
        expect(result.reasons).toHaveLength(0);
    });

    it('challenges high velocity', () => {
        const context = { ...defaultContext, velocity10m: 2 };
        const result = RiskEngine.evaluateRedemption(context, defaultMetadata);
        expect(result.score).toBe(0.15); // Elevated
        expect(result.decision).toBe('APPROVE'); // Not high enough for challenge yet (threshold 0.3)

        const highContext = { ...defaultContext, velocity10m: 4 };
        const highResult = RiskEngine.evaluateRedemption(highContext, defaultMetadata);
        expect(highResult.score).toBe(0.4);
        expect(highResult.decision).toBe('CHALLENGE');
        expect(highResult.reasons).toContain('High token generation velocity (10m)');
    });

    it('challenges significant amount deviation', () => {
        const context = { ...defaultContext, currentAmount: 350 }; // > 200% deviation from 100
        const result = RiskEngine.evaluateRedemption(context, defaultMetadata);
        expect(result.score).toBe(0.3);
        expect(result.decision).toBe('CHALLENGE');
        expect(result.reasons[0]).toMatch(/Significant deviation/);
    });

    it('rejects brute force / excessive failures', () => {
        const context = { ...defaultContext, failedAttempts24h: 6 };
        const result = RiskEngine.evaluateRedemption(context, defaultMetadata);
        expect(result.score).toBe(0.5);
        expect(result.decision).toBe('CHALLENGE');

        // Combined with something else
        const combinedContext = { ...defaultContext, failedAttempts24h: 6, velocity10m: 4 };
        const resultCombined = RiskEngine.evaluateRedemption(combinedContext, defaultMetadata);
        expect(resultCombined.score).toBe(0.9); // 0.5 + 0.4
        expect(resultCombined.decision).toBe('REJECT');
        expect(resultCombined.reasons).toContain('Excessive failed redemption attempts (24h)');
        expect(resultCombined.reasons).toContain('High token generation velocity (10m)');
    });

    it('detects IP anomalies', () => {
        const metadata = { ip: '1.2.3.4' }; // Different from lastIp 127.0.0.1
        const result = RiskEngine.evaluateRedemption(defaultContext, metadata);
        expect(result.score).toBe(0.2);
        expect(result.decision).toBe('APPROVE');

        // Combined with deviation
        const context = { ...defaultContext, currentAmount: 250 }; // 150% deviation
        const resultCombined = RiskEngine.evaluateRedemption(context, metadata);
        expect(resultCombined.score).toBe(0.35); // 0.2 + 0.15
        expect(resultCombined.decision).toBe('CHALLENGE');
    });
});
