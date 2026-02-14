// current.controller.js
import {
    getCurrentFilm,
    createCurrentFilm,
    deleteCurrentFilm,
    uploadTeaserAndConvert,
} from "../services/current.service.js";

// ─── GET /api/current ─────────────────────────────────────────────────────────

/**
 * Returns the current featured film, or 404 if none is set.
 */
export const fetchCurrentFilm = async (_req, res) => {
    try {
        const film = await getCurrentFilm();

        if (!film) {
            return res.status(404).json({
                success: false,
                message: "No current film set.",
            });
        }

        return res.status(200).json({ success: true, data: film });
    } catch (err) {
        console.error("[fetchCurrentFilm] Error:", err);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch current film.",
        });
    }
};

// ─── POST /api/current ────────────────────────────────────────────────────────

/**
 * Creates the current film entry.
 *
 * Expects JSON body:
 *   { title, description, videoUrl, teaserUrl }
 *
 * teaserUrl must already be a valid HLS URL (uploaded separately via
 * POST /api/current/upload-teaser, or an existing S3 URL).
 *
 * Returns 409 if an entry already exists.
 */
export const addCurrentFilm = async (req, res) => {
    try {
        const { title, description, videoUrl, teaserUrl } = req.body;

        // ── Validate required fields ─────────────────────────────────────────────
        const missing = ["title", "description", "videoUrl", "teaserUrl"].filter(
            (f) => !req.body[f]?.trim()
        );

        if (missing.length > 0) {
            return res.status(400).json({
                success: false,
                message: "Missing required fields.",
                fields: missing,
            });
        }

        const film = await createCurrentFilm({
            title: title.trim(),
            description: description.trim(),
            videoUrl: videoUrl.trim(),
            teaserUrl: teaserUrl.trim(),
        });

        return res.status(201).json({
            success: true,
            message: "Current film saved successfully.",
            data: film,
        });
    } catch (err) {
        // Singleton violation
        if (err.code === "ALREADY_EXISTS") {
            return res.status(409).json({
                success: false,
                message: err.message,
            });
        }

        console.error("[addCurrentFilm] Error:", err);
        return res.status(500).json({
            success: false,
            message: "Failed to save current film.",
        });
    }
};

// ─── DELETE /api/current ──────────────────────────────────────────────────────

/**
 * Deletes the current film entry.
 * Returns 404 if no entry exists.
 * Does NOT delete the S3 video/teaser files — only the DB record.
 */
export const removeCurrentFilm = async (_req, res) => {
    try {
        const deleted = await deleteCurrentFilm();

        if (!deleted) {
            return res.status(404).json({
                success: false,
                message: "No current film to delete.",
            });
        }

        return res.status(200).json({
            success: true,
            message: "Current film deleted. You can now add a new one.",
        });
    } catch (err) {
        console.error("[removeCurrentFilm] Error:", err);
        return res.status(500).json({
            success: false,
            message: "Failed to delete current film.",
        });
    }
};

// ─── POST /api/current/upload-teaser (SSE) ────────────────────────────────────

/**
 * Accepts a video file upload, converts it to HLS via FFmpeg,
 * uploads the segments to S3 under short_films/teaser/,
 * and streams progress back to the client via Server-Sent Events.
 *
 * Expects: multipart/form-data with field "teaser" (video file).
 *
 * SSE event types:
 *   { type: "progress", stage: "converting" | "uploading", percent: number }
 *   { type: "complete", teaserUrl: string }
 *   { type: "error",   message: string }
 */
export const uploadTeaser = async (req, res) => {
    // ── Set up SSE ────────────────────────────────────────────────────────────
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

    try {
        if (!req.file) {
            send({ type: "error", message: "No teaser file uploaded." });
            return res.end();
        }

        send({ type: "progress", stage: "converting", percent: 0 });

        const { teaserUrl, fileCount } = await uploadTeaserAndConvert(
            req.file.buffer,
            (percent) => send({ type: "progress", stage: "converting", percent })
        );

        send({ type: "progress", stage: "uploading", percent: 100 });

        send({
            type: "complete",
            message: `Teaser uploaded (${fileCount} segments).`,
            teaserUrl,
        });

        res.end();
    } catch (err) {
        console.error("[uploadTeaser] Error:", err);
        send({ type: "error", message: err.message || "Teaser upload failed." });
        res.end();
    }
};