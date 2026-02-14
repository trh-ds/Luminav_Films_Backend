// video.service.js
import db from "../config/db.config.js";
import { s3Client, BUCKET_NAME } from "../config/s3.config.js";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";


const REGION = process.env.AWS_REGION || "ap-south-1";
const SIGNED_URL_EXPIRY = 60 * 10; // 10 minutes

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Converts a raw title string into a folder-safe S3 prefix segment.
 * e.g. "My Cool Film!" → "my_cool_film"
 */
const toSafeSlug = (title) =>
    title
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_")
        .replace(/[^a-z0-9_]/g, "");

/**
 * Builds the HLS playlist URL for a given category + title.
 * Uses the correct virtual-hosted regional endpoint format.
 */
const buildVideoUrl = (category, title) => {
    const slug = toSafeSlug(title);
    return `https://${BUCKET_NAME}.s3.${REGION}.amazonaws.com/${category}/${slug}/output.m3u8`;
};

// ─── Video CRUD ───────────────────────────────────────────────────────────────

/**
 * Inserts video metadata into the DB and returns the full record.
 */
export const createVideoService = async ({
    category,
    title,
    description,
    thumbnailOne,
    thumbnailTwo,
}) => {
    const videoUrl = buildVideoUrl(category, title);

    const [result] = await db.execute(
        `INSERT INTO videos
            (category, title, description, thumbnail_one, thumbnail_two, video_url)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [category, title, description, thumbnailOne, thumbnailTwo, videoUrl]
    );

    return {
        id: result.insertId,
        category,
        title,
        description,
        thumbnailOne,
        thumbnailTwo,
        videoUrl,
    };
};

/**
 * Returns all videos ordered by newest first, with thumbnails grouped into an array.
 */
export const getAllVideos = async () => {
    const [rows] = await db.query(`
        SELECT id, category, title, description,
               thumbnail_one, thumbnail_two, video_url, created_at
        FROM videos
        ORDER BY created_at DESC
    `);

    return rows.map((row) => ({
        id: row.id,
        category: row.category,
        title: row.title,
        description: row.description,
        thumbnails: [row.thumbnail_one, row.thumbnail_two],
        videoUrl: row.video_url,
        createdAt: row.created_at,
    }));
};

/**
 * Returns a single video by ID, or null if not found.
 */
export const getVideoById = async (videoId) => {
    const [rows] = await db.query(
        `SELECT id, category, title, description,
                thumbnail_one, thumbnail_two, video_url, created_at
         FROM videos
         WHERE id = ?`,
        [videoId]
    );

    if (rows.length === 0) return null;

    const row = rows[0];
    return {
        id: row.id,
        category: row.category,
        title: row.title,
        description: row.description,
        thumbnails: [row.thumbnail_one, row.thumbnail_two],
        videoUrl: row.video_url,
        createdAt: row.created_at,
    };
};

/**
 * Hard-deletes a video record by ID.
 * Returns the deleted record summary, or null if the ID didn't exist.
 */
export const deleteVideoById = async (videoId) => {
    const [result] = await db.query("DELETE FROM videos WHERE id = ?", [videoId]);

    if (result.affectedRows === 0) return null;

    return { id: videoId };
};

// ─── Streaming / Signed URL ───────────────────────────────────────────────────

/**
 * Generates a short-lived presigned S3 GET URL for any object under
 * the videos prefix (playlist files, .ts segments, thumbnails, etc.).
 *
 * @param {string} category  - e.g. "ad_films" | "short_films"
 * @param {string} videoSlug - folder name exactly as stored in S3
 * @param {string} filename  - e.g. "output.m3u8" or "seg0001.ts"
 * @returns {{ signedUrl: string, key: string }}
 */
export const generateSignedUrl = async ({ category, videoSlug, filename }) => {
    const key = `${category}/${videoSlug}/${filename}`;

    const command = new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        ResponseContentDisposition: "inline",
        ResponseContentType: filename.endsWith(".m3u8")
            ? "application/vnd.apple.mpegurl"
            : filename.endsWith(".ts")
                ? "video/mp2t"
                : "application/octet-stream",
    });

    const signedUrl = await getSignedUrl(s3Client, command, {
        expiresIn: SIGNED_URL_EXPIRY,
    });

    return { signedUrl, key };
};