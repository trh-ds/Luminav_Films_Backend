import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306,

    // ── Pool settings ──────────────────────────────────────
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    maxIdle: 5,
    idleTimeout: 60000,    // recycle idle connections after 60s

    // ── Keep-alive ─────────────────────────────────────────
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000, // ping every 10s
};

const pool = mysql.createPool(dbConfig);

// ── Ping pool every 5 minutes to prevent ECONNRESET on idle ──
setInterval(async () => {
    try {
        await pool.query('SELECT 1');
    } catch (err) {
        console.warn('⚠️  DB keep-alive ping failed:', err.message);
    }
}, 5 * 60 * 1000);

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
 * pool.execute() uses true prepared statements which require LIMIT and OFFSET
 * to be bound as integers. mysql2 internally serializes all params as strings,
 * causing MySQL to throw ER_WRONG_ARGUMENTS (errno 1210) on LIMIT/OFFSET clauses.
 * pool.query() sends parameters inline (client-side escaping), which correctly
 * preserves integer types and works with all clause types including LIMIT/OFFSET.
 * It is still fully safe against SQL injection.
 */
export const query = async (sql, params = []) => {
    try {
        const [results] = await pool.query(sql, params);
        return results;
    } catch (error) {
        // Auto-retry once on connection reset
        if (error.code === 'ECONNRESET' || error.code === 'PROTOCOL_CONNECTION_LOST') {
            console.warn('⚠️  DB connection lost, retrying query...');
            const [results] = await pool.query(sql, params);
            return results;
        }
        console.error('❌ Database query error:', error);
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