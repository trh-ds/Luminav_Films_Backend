// current.route.js
import express from "express";
import multer from "multer";
import {
    fetchCurrentFilm,
    addCurrentFilm,
    removeCurrentFilm,
    uploadTeaser,
} from "../controller/current.controller.js";

const router = express.Router();

// ── Multer for teaser video upload (memory storage, up to 2 GB) ──────────────
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 2 * 1024 * 1024 * 1024 }, // 2 GB
    fileFilter: (_req, file, cb) => {
        if (file.mimetype.startsWith("video/")) {
            cb(null, true);
        } else {
            cb(new Error("Only video files are allowed for the teaser."), false);
        }
    },
});

// ─── Routes ──────────────────────────────────────────────────────────────────

/**
 * GET /api/current
 * Returns the single current featured film.
 * 200  → { success: true, data: { id, title, description, videoUrl, teaserUrl, ... } }
 * 404  → { success: false, message: "No current film set." }
 */
router.get("/", fetchCurrentFilm);

/**
 * POST /api/current
 * Save the current featured film metadata.
 * Body (JSON): { title, description, videoUrl, teaserUrl }
 *
 * - videoUrl  : full HLS URL already on S3 (user pastes it in)
 * - teaserUrl : HLS URL returned by POST /api/current/upload-teaser,
 *               OR an existing S3 URL if re-using a previously uploaded teaser.
 *
 * 201 → { success: true, data: { ... } }
 * 400 → missing fields
 * 409 → entry already exists (delete first)
 */
router.post("/", addCurrentFilm);

/**
 * DELETE /api/current
 * Removes the current film DB record (does NOT touch S3 files).
 * 200 → { success: true, message: "..." }
 * 404 → nothing to delete
 */
router.delete("/", removeCurrentFilm);

/**
 * POST /api/current/upload-teaser
 * Upload + convert a teaser video to HLS and store it on S3.
 * Streams progress via SSE; final event contains { teaserUrl }.
 *
 * Body: multipart/form-data, field name "teaser"
 *
 * SSE events:
 *   { type: "progress", stage: "converting", percent: 0-100 }
 *   { type: "progress", stage: "uploading",  percent: 100 }
 *   { type: "complete", teaserUrl: "https://...", message: "..." }
 *   { type: "error",   message: "..." }
 *
 * Use the returned teaserUrl in the POST /api/current body.
 */
router.post("/upload-teaser", upload.single("teaser"), uploadTeaser);

router.use((err, _req, res, _next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
            return res.status(400).json({
                success: false,
                message: "File too large. Maximum teaser size is 2 GB.",
            });
        }
        return res.status(400).json({ success: false, message: err.message });
    }
    if (err) {
        return res.status(400).json({ success: false, message: err.message });
    }
});

export default router;