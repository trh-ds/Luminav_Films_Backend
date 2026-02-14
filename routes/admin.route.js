// routes/admin.route.js
import express from "express";
import { adminLogin } from "../controller/admin.controller.js";

const router = express.Router();

/**
 * POST /api/admin/login
 * Body (JSON): { email: string, password: string }
 *
 * 200 → { message: "Logged in successfully.", admin: { id, email } }
 * 400 → missing / blank / malformed fields
 * 401 → invalid credentials (intentionally vague — same for bad email & bad password)
 * 500 → server error
 */
router.post("/login", adminLogin);

export default router;