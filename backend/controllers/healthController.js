/**
 * Health Check Controller
 * 
 * This controller handles health check requests
 * Separated from routes for better organization and testability
 */

const { healthCheck, readinessCheck } = require('../routes/health');

module.exports = {
  healthCheck,
  readinessCheck,
};
