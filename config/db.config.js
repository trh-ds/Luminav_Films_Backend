import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

// Database configuration
const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0
};

// Create connection pool
const pool = mysql.createPool(dbConfig);

/**
 * Test database connection
 */
export const testConnection = async () => {
    try {
        const connection = await pool.getConnection();
        console.log('✅ Database connected successfully');
        connection.release();
        return true;
    } catch (error) {
        console.error('❌ Database connection failed:', error.message);
        return false;
    }
};

/**
 * Execute a query
 * 
 * Uses pool.query() instead of pool.execute().
 * 
 * pool.execute() uses true prepared statements which require LIMIT and OFFSET
 * to be bound as integers. mysql2 internally serializes all params as strings,
 * causing MySQL to throw ER_WRONG_ARGUMENTS (errno 1210) on LIMIT/OFFSET clauses.
 * 
 * pool.query() sends parameters inline (client-side escaping), which correctly
 * preserves integer types and works with all clause types including LIMIT/OFFSET.
 * It is still fully safe against SQL injection.
 * 
 * @param {string} sql - SQL query
 * @param {Array} params - Query parameters
 * @returns {Promise<Object>} - Query result
 */
export const query = async (sql, params = []) => {
    try {
        const [results] = await pool.query(sql, params);  // ✅ pool.query, not pool.execute
        return results;
    } catch (error) {
        console.error('Database query error:', error);
        throw error;
    }
};

/**
 * Get a connection from the pool (for transactions)
 */
export const getConnection = async () => {
    return await pool.getConnection();
};

export default pool;