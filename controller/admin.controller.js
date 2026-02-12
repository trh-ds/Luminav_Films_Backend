import { findAdminByEmail, verifyPassword } from "../services/admin.services.js";


export const adminLogin = async (req, res) => {
    try {
        const { email, password } = req.body;

        // 1️⃣ Basic validation
        if (!email || !password) {
            return res.status(400).json({ message: "Email and password required" });
        }

        // 2️⃣ Find admin
        const admin = await findAdminByEmail(email);
        if (!admin) {
            return res.status(401).json({ message: "Invalid credentials" });
        }

        // 3️⃣ Verify password
        const isMatch = await verifyPassword(password, admin.password);
        if (!isMatch) {
            return res.status(401).json({ message: "Invalid credentials" });
        }

        // ✅ SUCCESS (frontend only cares about this)
        return res.status(200).json({
            message: "Admin logged in successfully",
            admin: {
                id: admin.id,
                email: admin.email,
            },
        });

    } catch (err) {
        console.error("Admin login error:", err);
        return res.status(500).json({ message: "Server error" });
    }
};
