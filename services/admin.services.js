import bcrypt from "bcrypt";
import { db } from "../server.js";

export const findAdminByEmail = async (email) => {
    const [rows] = await db.query(
        "SELECT * FROM admins WHERE email = ? LIMIT 1",
        [email]
    );
    return rows[0];
};

export const verifyPassword = async (plainPassword, hashedPassword) => {
    return bcrypt.compare(plainPassword, hashedPassword);
};

// Optional helper to create admin
export const createAdmin = async (email, password) => {
    const hashedPassword = await bcrypt.hash(password, 10);
    await db.query(
        "INSERT INTO admins (email, password) VALUES (?, ?)",
        [email, hashedPassword]
    );
};
