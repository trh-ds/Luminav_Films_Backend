// controller/admin.controller.js
import { findAdminByEmail, verifyPassword } from "../services/admin.service.js";

// ─── POST /api/admin/login ────────────────────────────────────────────────────

/**
 * Authenticates an admin by email + password.
 *
 * Security notes:
 * - Never reveals whether the email or the password was wrong (always "Invalid credentials").
 * - verifyPassword() runs bcrypt even when the email doesn't exist, so response
 *   timing is identical for "wrong email" and "wrong password" — prevents
 *   email enumeration via timing attacks.
 * - Input is trimmed and lowercased before hitting the DB.
 *
 * 200 → { message, admin: { id, email } }
 * 400 → missing fields
 * 401 → wrong email or password
 * 500 → unexpected server error
 */
export const adminLogin = async (req, res) => {
    try {
        const rawEmail = req.body?.email;
        const rawPassword = req.body?.password;

        // ── 1. Presence validation ────────────────────────────────────────────
        if (!rawEmail || !rawPassword) {
            return res.status(400).json({ message: "Email and password are required." });
        }

        // ── 2. Sanitise ───────────────────────────────────────────────────────
        const email = String(rawEmail).trim().toLowerCase();
        const password = String(rawPassword).trim();

        if (!email || !password) {
            return res.status(400).json({ message: "Email and password cannot be blank." });
        }

        // Basic email shape check — stops obviously malformed input reaching the DB
        const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!EMAIL_RE.test(email)) {
            return res.status(400).json({ message: "Enter a valid email address." });
        }

        // ── 3. Look up admin ──────────────────────────────────────────────────
        const admin = await findAdminByEmail(email);

        // ── 4. Verify password (always runs — timing-safe) ────────────────────
        //    Pass admin?.password (possibly undefined) to verifyPassword.
        //    The service uses a dummy hash when undefined so timing is identical.
        const isMatch = await verifyPassword(password, admin?.password);

        // ── 5. Unified failure response ───────────────────────────────────────
        //    Deliberately the same message for "no such email" and "wrong password".
        if (!admin || !isMatch) {
            return res.status(401).json({ message: "Invalid credentials." });
        }

        // ── 6. Success ────────────────────────────────────────────────────────
        return res.status(200).json({
            message: "Logged in successfully.",
            admin: {
                id: admin.id,
                email: admin.email,
            },
        });

    } catch (err) {
        console.error("[adminLogin] Unexpected error:", err);
        return res.status(500).json({ message: "An unexpected error occurred. Please try again." });
    }
};