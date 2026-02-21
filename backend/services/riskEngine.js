const { logger } = require('../utils/logger');

/**
 * Production Risk Engine
 * Deterministic fraud prevention using historical and contextual signals.
 */
class RiskEngine {
    /**
     * Evaluate redemption risk using deterministic signals.
     * @param {Object} context Historical context from getRiskContext
     * @param {Object} metadata Current request metadata (IP, deviceId, etc.)
     * @returns {Object} { score: number, decision: 'APPROVE' | 'CHALLENGE' | 'REJECT', reasons: string[] }
     */
    static evaluateRedemption(context, metadata = {}) {
        let score = 0;
        const reasons = [];

        // 1. Velocity Signal (High weight: 40%)
        // Threshold: > 3 tokens in 10 minutes is highly suspicious
        if (context.velocity10m > 3) {
            score += 0.4;
            reasons.push('High token generation velocity (10m)');
        } else if (context.velocity10m > 1) {
            score += 0.15;
            reasons.push('Elevated token generation velocity (10m)');
        }

        // 2. Behavior Signal (Moderate weight: 30%)
        // Deviation from average withdrawal amount
        if (context.avgAmount > 0) {
            const deviation = Math.abs(context.currentAmount - context.avgAmount) / context.avgAmount;
            if (deviation > 2.0) { // > 200% deviation
                score += 0.3;
                reasons.push(`Significant deviation from average amount (${Math.round(deviation * 100)}%)`);
            } else if (deviation > 1.0) { // > 100% deviation
                score += 0.15;
                reasons.push(`Moderate deviation from average amount (${Math.round(deviation * 100)}%)`);
            }
        }

        // 3. Abuse Signal (High weight: 40%)
        // Number of failed redemptions in last 24 hours
        if (context.failedAttempts24h > 5) {
            score += 0.5;
            reasons.push('Excessive failed redemption attempts (24h)');
        } else if (context.failedAttempts24h > 2) {
            score += 0.25;
            reasons.push('Elevated failed redemption attempts (24h)');
        }

        // 4. Geo/IP Signal (Moderate weight: 20%)
        // Check for IP change from last successful redemption
        const currentIp = metadata.ip || '127.0.0.1';
        if (context.lastIp && context.lastIp !== currentIp) {
            score += 0.2;
            reasons.push('IP address mismatch from last success');
        }

        // Cap score at 1.0
        score = Math.min(1.0, parseFloat(score.toFixed(2)));

        let decision = 'APPROVE';
        if (score > 0.7) decision = 'REJECT';
        else if (score >= 0.3) decision = 'CHALLENGE';

        logger.info({
            score,
            decision,
            reasons,
            context: {
                velocity: context.velocity10m,
                failed: context.failedAttempts24h,
                deviationFromAvg: context.avgAmount > 0 ? (context.currentAmount - context.avgAmount) / context.avgAmount : 0
            }
        }, 'Deterministic risk evaluation completed');

        return { score, decision, reasons };
    }
}

module.exports = RiskEngine;
