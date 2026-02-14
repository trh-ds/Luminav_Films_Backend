// services/admin.service.js
import bcrypt from "bcrypt";
import db from "../config/db.config.js"; // ✅ import from db config, NOT server.js

// ─── Find admin by email ──────────────────────────────────────────────────────

/**
 * Looks up an admin record by email.
 * Returns the full row (including hashed password) or undefined if not found.
 *
 * @param {string} email
 * @returns {Promise<Object|undefined>}
 */
export const findAdminByEmail = async (email) => {
    const [rows] = await db.query(
        "SELECT id, email, password FROM admins WHERE email = ? LIMIT 1",
        [email]
    );
    return rows[0]; // undefined when not found
};

// ─── Verify password ──────────────────────────────────────────────────────────

/**
 * Constant-time comparison of a plain-text password against a bcrypt hash.
 * Always runs bcrypt even if no hash is supplied, preventing timing attacks
 * that would let an attacker enumerate valid email addresses.
 *
 * @param {string} plainPassword
 * @param {string|undefined} hashedPassword  undefined when admin was not found
 * @returns {Promise<boolean>}
 */
export const verifyPassword = async (plainPassword, hashedPassword) => {
    // If no hash was found (email doesn't exist) we still run bcrypt against a
    // dummy hash so the response time is identical to a wrong-password attempt.
    const DUMMY_HASH =
        "$2b$10$abcdefghijklmnopqrstuvuXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX";

    const hash = hashedPassword ?? DUMMY_HASH;
    return bcrypt.compare(plainPassword, hash);
};

// ─── Create admin (utility / seed script only) ────────────────────────────────

/**
 * Inserts a new admin with a bcrypt-hashed password.
 * Not exposed via any route — call from a one-off seed script.
 *
 * Example usage:
 *   node -e "import('./services/admin.service.js').then(m => m.createAdmin('admin@luminavfilms.com', 'yourPassword'))"
 *
 * @param {string} email
 * @param {string} plainPassword
 */
export const createAdmin = async (email, password) => {
    if (!email || !password) throw new Error("Email and password are required.");

    const hashedPassword = await bcrypt.hash(password, 12); // 12 rounds (stronger than 10)

    const [result] = await db.query(
        "INSERT INTO admins (email, password) VALUES (?, ?)",
        [email, hashedPassword]
    );

    return { id: result.insertId, email };
};