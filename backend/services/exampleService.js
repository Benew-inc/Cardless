/**
 * Example Service Layer
 * 
 * Financial System Design Decisions:
 * 1. Service Layer Pattern: Separates business logic from controllers
 *    - Controllers handle HTTP concerns (request/response)
 *    - Services contain business logic (reusable across different interfaces)
 *    - Makes code more testable and maintainable
 * 
 * 2. Database Abstraction: Services use database module, not direct queries
 *    - Easier to test (can mock database)
 *    - Centralized query logic
 *    - Better error handling
 * 
 * 3. Transaction Management: Services handle transactions
 *    - Ensures data consistency for complex operations
 *    - Critical for financial operations (e.g., transfers)
 * 
 * 4. Caching Strategy: Services decide what to cache
 *    - Reduces database load
 *    - Improves response times
 *    - Must ensure cache invalidation for financial data
 */

const { query, transaction } = require('../config/database');
const { get, set, del } = require('../config/redis');
const { NotFoundError, ValidationError } = require('../utils/errors');

/**
 * Example: Get data by ID with caching
 * Demonstrates caching pattern for read operations
 */
const getById = async (id) => {
  // Validate input
  if (!id) {
    throw new ValidationError('ID is required');
  }

  // Try cache first
  const cacheKey = `example:${id}`;
  const cached = await get(cacheKey);
  if (cached) {
    return cached;
  }

  // Query database
  const result = await query('SELECT * FROM examples WHERE id = $1', [id]);
  
  if (result.rows.length === 0) {
    throw new NotFoundError('Example not found');
  }

  const data = result.rows[0];

  // Cache for 5 minutes
  await set(cacheKey, data, 300);

  return data;
};

/**
 * Example: Create data with transaction
 * Demonstrates transaction pattern for write operations
 */
const create = async (data) => {
  // Validate input
  if (!data || !data.name) {
    throw new ValidationError('Name is required');
  }

  // Use transaction for data consistency
  const result = await transaction(async (client) => {
    // Insert main record
    const insertResult = await client.query(
      'INSERT INTO examples (name, created_at) VALUES ($1, NOW()) RETURNING *',
      [data.name]
    );

    // Example: Insert related record in same transaction
    // await client.query('INSERT INTO example_logs ...', [insertResult.rows[0].id]);

    return insertResult.rows[0];
  });

  // Invalidate cache
  await del(`example:${result.id}`);

  return result;
};

/**
 * Example: Update data with cache invalidation
 */
const update = async (id, data) => {
  if (!id) {
    throw new ValidationError('ID is required');
  }

  // Update in transaction
  const result = await transaction(async (client) => {
    const updateResult = await client.query(
      'UPDATE examples SET name = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [data.name, id]
    );

    if (updateResult.rows.length === 0) {
      throw new NotFoundError('Example not found');
    }

    return updateResult.rows[0];
  });

  // Invalidate cache
  await del(`example:${id}`);

  return result;
};

module.exports = {
  getById,
  create,
  update,
};
