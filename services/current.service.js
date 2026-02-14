// current.service.js
import db from "../config/db.config.js";
import { s3Client, BUCKET_NAME } from "../config/s3.config.js";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Upload } from "@aws-sdk/lib-storage";
import ffmpeg from "fluent-ffmpeg";
import {
    createReadStream,
    readdirSync,
    mkdirSync,
} from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { promises as fsp } from "fs";

const SIGNED_URL_EXPIRY = 60 * 10; // 10 minutes
const TEASER_S3_PREFIX = "short_films/teaser"; // fixed location for the teaser

// ─── Duplicate-entry error code ───────────────────────────────────────────────
const MYSQL_DUP_ENTRY = "ER_DUP_ENTRY";

// ─── Shape a DB row into the response object ──────────────────────────────────
const formatRow = (row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    videoUrl: row.video_url,
    teaserUrl: row.teaser_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
});

// ─── READ ─────────────────────────────────────────────────────────────────────

/**
 * Returns the single current_film row, or null if none exists.
 */
export const getCurrentFilm = async () => {
    const [rows] = await db.query(
        `SELECT id, title, description, video_url, teaser_url, created_at, updated_at
     FROM current_film
     LIMIT 1`
    );
    return rows.length ? formatRow(rows[0]) : null;
};

// ─── CREATE ───────────────────────────────────────────────────────────────────

/**
 * Inserts the one-and-only current_film row.
 *
 * Throws a structured error with `code: "ALREADY_EXISTS"` when a row is
 * already present (MySQL duplicate-key on lock_col = 1).
 *
 * @param {{ title, description, videoUrl, teaserUrl }} param
 */
export const createCurrentFilm = async ({
    title,
    description,
    videoUrl,
    teaserUrl,
}) => {
    try {
        const [result] = await db.execute(
            `INSERT INTO current_film (lock_col, title, description, video_url, teaser_url)
       VALUES (1, ?, ?, ?, ?)`,
            [title, description, videoUrl, teaserUrl]
        );

        return {
            id: result.insertId,
            title,
            description,
            videoUrl,
            teaserUrl,
        };
    } catch (err) {
        // MySQL throws ER_DUP_ENTRY when lock_col = 1 already exists
        if (err.code === MYSQL_DUP_ENTRY) {
            const alreadyExists = new Error(
                "A current film already exists. Delete it before adding a new one."
            );
            alreadyExists.code = "ALREADY_EXISTS";
            throw alreadyExists;
        }
        throw err;
    }
};

// ─── DELETE ───────────────────────────────────────────────────────────────────

/**
 * Deletes the current_film row.
 * Returns true if a row was deleted, false if the table was already empty.
 */
export const deleteCurrentFilm = async () => {
    const [result] = await db.query(`DELETE FROM current_film WHERE lock_col = 1`);
    return result.affectedRows > 0;
};

// ─── TEASER UPLOAD + HLS CONVERSION ──────────────────────────────────────────

/**
 * Accepts a raw video Buffer, converts it to HLS via FFmpeg,
 * uploads all segments to S3 under `short_films/teaser/`, and
 * returns the public playlist URL.
 *
 * Mirrors the logic in upload.service.js — kept self-contained here
 * so this module has no cross-service dependency.
 *
 * @param {Buffer}   fileBuffer  Raw video bytes from multer
 * @param {Function} onProgress  Optional callback(percent: number)
 * @returns {{ teaserUrl: string, fileCount: number }}
 */
export const uploadTeaserAndConvert = async (fileBuffer, onProgress) => {
    // 1. Write buffer to a temp directory
    const tempDir = join(tmpdir(), `luminav_teaser_${randomUUID()}`);
    const inputPath = join(tempDir, "input.mp4");
    const outputDir = join(tempDir, "hls");

    mkdirSync(tempDir, { recursive: true });
    mkdirSync(outputDir, { recursive: true });
    await fsp.writeFile(inputPath, fileBuffer);

    // 2. FFmpeg → HLS
    await new Promise((resolve, reject) => {
        ffmpeg(inputPath)
            .outputOptions([
                "-codec:v libx264",
                "-codec:a aac",
                "-b:v 1500k",
                "-b:a 128k",
                "-vf scale=1280:720",
                "-hls_time 4",
                "-hls_playlist_type vod",
                "-hls_segment_type mpegts",
                "-hls_segment_filename",
                join(outputDir, "shot_%03d.ts"),
                "-start_number 0",
            ])
            .output(join(outputDir, "output.m3u8"))
            .on("progress", (p) => {
                if (onProgress && p.percent) onProgress(Math.round(p.percent));
            })
            .on("end", resolve)
            .on("error", reject)
            .run();
    });

    // 3. Upload all files to S3
    const files = readdirSync(outputDir);

    await Promise.all(
        files.map(async (filename) => {
            const filePath = join(outputDir, filename);
            const contentType = filename.endsWith(".m3u8")
                ? "application/vnd.apple.mpegurl"
                : "video/mp2t";

            const upload = new Upload({
                client: s3Client,
                params: {
                    Bucket: BUCKET_NAME,
                    Key: `${TEASER_S3_PREFIX}/${filename}`,
                    Body: createReadStream(filePath),
                    ContentType: contentType,
                    ContentDisposition: "inline",
                },
            });

            await upload.done();
        })
    );

    // 4. Clean up
    await fsp.rm(tempDir, { recursive: true, force: true });

    const teaserUrl = `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${TEASER_S3_PREFIX}/output.m3u8`;

    return { teaserUrl, fileCount: files.length };
};

// ─── SIGNED URL (for streaming segments behind a presigned URL if needed) ────

/**
 * Generates a short-lived presigned GET URL for any object under the
 * `short_films/` prefix (teaser segments, film segments, etc.).
 *
 * @param {string} key  Full S3 key, e.g. "short_films/teaser/output.m3u8"
 */
export const generateCurrentFilmSignedUrl = async (key) => {
    const command = new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        ResponseContentDisposition: "inline",
        ResponseContentType: key.endsWith(".m3u8")
            ? "application/vnd.apple.mpegurl"
            : key.endsWith(".ts")
                ? "video/mp2t"
                : "application/octet-stream",
    });

    const signedUrl = await getSignedUrl(s3Client, command, {
        expiresIn: SIGNED_URL_EXPIRY,
    });

    return { signedUrl, key };
};