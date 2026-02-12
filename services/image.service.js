import { S3Client, PutObjectCommand, DeleteObjectCommand, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { v4 as uuidv4 } from "uuid";
import sharp from "sharp";
import { query } from "../config/db.config.js";

// AWS S3 Client Configuration
const s3Client = new S3Client({
    region: process.env.AWS_REGION || "eu-north-1",
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});

const BUCKET_NAME = process.env.AWS_BUCKET_NAME || "luminav-films-bucket";
const BUCKET_URL = `https://${BUCKET_NAME}.s3.ap-south-1.amazonaws.com`;

// Valid image categories
export const VALID_CATEGORIES = {
    FEATURED_WORK: "featured_work",
    PORTRAITS: "portraits",
    PRODUCT_SHOOTS: "product_shoots",
    THUMBNAILS: "thumbnails",
    DOCUMENTARY: "documentry",
    TRAVEL: "travel",
};

/**
 * Upload an image to S3 in a specific category folder.
 * Also generates and uploads a compressed thumbnail automatically.
 */
export const uploadImageToS3 = async ({ file, category }) => {
    if (!Object.values(VALID_CATEGORIES).includes(category)) {
        throw new Error(`Invalid category: ${category}`);
    }

    const timestamp = Date.now();
    const uniqueId = uuidv4();
    const sanitizedFilename = file.originalname.replace(/[^a-zA-Z0-9.-]/g, "_");

    // S3 keys
    const originalKey = `${category}/${timestamp}-${uniqueId}-${sanitizedFilename}`;
    const thumbnailKey = `${category}/thumbnails/${timestamp}-${uniqueId}-${sanitizedFilename}`;

    // Generate thumbnail buffer using Sharp (done in memory, no temp files)
    // Skip thumbnail generation for the thumbnails category itself
    let thumbnailBuffer = null;
    if (category !== VALID_CATEGORIES.THUMBNAILS) {
        thumbnailBuffer = await sharp(file.buffer)
            .resize({ width: 400, withoutEnlargement: true })
            .jpeg({ quality: 60 })
            .toBuffer();
    }

    try {
        // Upload original image
        await s3Client.send(new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: originalKey,
            Body: file.buffer,
            ContentType: file.mimetype,
        }));

        // Upload thumbnail (skip for thumbnails category)
        if (thumbnailBuffer) {
            await s3Client.send(new PutObjectCommand({
                Bucket: BUCKET_NAME,
                Key: thumbnailKey,
                Body: thumbnailBuffer,
                ContentType: "image/jpeg",
            }));
        }

        const uploadUrl = `${BUCKET_URL}/${originalKey}`;
        const thumbnailUrl = thumbnailBuffer ? `${BUCKET_URL}/${thumbnailKey}` : null;

        // Save both URLs to database
        const sql = `
            INSERT INTO images 
            (s3_key, s3_url, thumbnail_url, bucket_name, category, original_filename, file_size, mime_type, uploaded_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const params = [
            originalKey,
            uploadUrl,
            thumbnailUrl,
            BUCKET_NAME,
            category,
            file.originalname,
            file.size,
            file.mimetype,
            "admin",
        ];

        const result = await query(sql, params);

        return {
            id: result.insertId,
            url: uploadUrl,
            thumbnailUrl,
            key: originalKey,
            category,
        };
    } catch (error) {
        console.error("S3 Upload or Database Error:", error);
        throw new Error(`Failed to upload image: ${error.message}`);
    }
};

/**
 * Get images from a specific category folder with pagination.
 * Returns both original URL and thumbnail URL.
 */
export const getImagesFromFolder = async ({ folder, limit = 10, offset = 0 }) => {
    if (!Object.values(VALID_CATEGORIES).includes(folder)) {
        throw new Error(`Invalid category: ${folder}`);
    }

    // Parse and validate — critical so we can safely interpolate into SQL
    const parsedLimit = parseInt(limit, 10);
    const parsedOffset = parseInt(offset, 10);

    if (isNaN(parsedLimit) || parsedLimit <= 0) {
        throw new Error("limit must be a positive integer");
    }
    if (isNaN(parsedOffset) || parsedOffset < 0) {
        throw new Error("offset must be a non-negative integer");
    }

    try {
        // Total count
        const countSql = `
            SELECT COUNT(*) as total 
            FROM images 
            WHERE category = ? AND is_active = 1
        `;
        const countResult = await query(countSql, [folder]);
        const total = countResult[0].total;

        // ✅ LIMIT and OFFSET interpolated directly as integers (safe — already validated above)
        // mysql2 has a known bug where some query wrapper patterns strip integer type
        // from bound parameters, causing ER_WRONG_ARGUMENTS on LIMIT/OFFSET clauses.
        const sql = `
            SELECT 
                id,
                s3_key as \`key\`,
                s3_url as url,
                thumbnail_url as thumbnailUrl,
                original_filename,
                file_size as size,
                mime_type,
                width,
                height,
                created_at as lastModified,
                uploaded_by
            FROM images 
            WHERE category = ? AND is_active = 1
            ORDER BY created_at DESC
            LIMIT ${parsedLimit} OFFSET ${parsedOffset}
        `;

        // Only `folder` is a bound parameter now — LIMIT/OFFSET are baked in as integers
        const images = await query(sql, [folder]);

        return {
            images,
            pagination: {
                total,
                limit: parsedLimit,
                offset: parsedOffset,
                currentPage: Math.floor(parsedOffset / parsedLimit) + 1,
                totalPages: Math.ceil(total / parsedLimit),
                hasMore: parsedOffset + parsedLimit < total,
            },
            count: images.length,
        };
    } catch (error) {
        console.error("Database Query Error:", error);
        throw new Error(`Failed to fetch images from database: ${error.message}`);
    }
};

/**
 * Delete an image from S3 and database.
 * Also deletes the thumbnail from S3 if it exists.
 */
export const deleteImageFromS3 = async ({ key, category, hardDelete = false }) => {
    if (!Object.values(VALID_CATEGORIES).includes(category)) {
        throw new Error(`Invalid category: ${category}`);
    }

    if (!key.startsWith(`${category}/`)) {
        throw new Error(`Image key does not belong to category: ${category}`);
    }

    try {
        // Fetch thumbnail_url before deleting from DB so we can clean up S3
        const fetchSql = `SELECT thumbnail_url FROM images WHERE s3_key = ? LIMIT 1`;
        const rows = await query(fetchSql, [key]);
        const thumbnailUrl = rows[0]?.thumbnail_url || null;

        if (hardDelete) {
            // Delete original from S3
            await s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: key }));

            // Delete thumbnail from S3 if it exists
            if (thumbnailUrl) {
                const thumbnailKey = thumbnailUrl.replace(`${BUCKET_URL}/`, "");
                await s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: thumbnailKey }));
            }

            // Delete from database
            await query(`DELETE FROM images WHERE s3_key = ?`, [key]);
        } else {
            // Soft delete
            await query(
                `UPDATE images SET is_active = FALSE, deleted_at = NOW() WHERE s3_key = ?`,
                [key]
            );
        }

        // Log deletion
        await query(
            `INSERT INTO image_activity_log (image_id, action, user_id)
             SELECT id, 'DELETE', 'admin' FROM images WHERE s3_key = ? LIMIT 1`,
            [key]
        );

        return true;
    } catch (error) {
        console.error("S3 Delete or Database Error:", error);
        throw new Error(`Failed to delete image: ${error.message}`);
    }
};

/**
 * Delete multiple images from S3 and database.
 * Also deletes their thumbnails from S3.
 */
export const deleteMultipleImagesFromS3 = async ({ keys, category, hardDelete = false }) => {
    if (!Object.values(VALID_CATEGORIES).includes(category)) {
        throw new Error(`Invalid category: ${category}`);
    }

    const invalidKeys = keys.filter((key) => !key.startsWith(`${category}/`));
    if (invalidKeys.length > 0) {
        throw new Error(
            `Some keys do not belong to category ${category}: ${invalidKeys.join(", ")}`
        );
    }

    try {
        const deleted = [];
        const errors = [];

        if (hardDelete) {
            // Fetch thumbnail keys before deleting
            const placeholders = keys.map(() => "?").join(",");
            const rows = await query(
                `SELECT s3_key, thumbnail_url FROM images WHERE s3_key IN (${placeholders})`,
                keys
            );

            // Build full list of S3 keys to delete (originals + thumbnails)
            const allS3Keys = [...keys];
            rows.forEach((row) => {
                if (row.thumbnail_url) {
                    const thumbnailKey = row.thumbnail_url.replace(`${BUCKET_URL}/`, "");
                    allS3Keys.push(thumbnailKey);
                }
            });

            // Bulk delete from S3
            const deleteParams = {
                Bucket: BUCKET_NAME,
                Delete: {
                    Objects: allS3Keys.map((k) => ({ Key: k })),
                    Quiet: false,
                },
            };

            const s3Result = await s3Client.send(new DeleteObjectsCommand(deleteParams));

            // Delete from database
            await query(`DELETE FROM images WHERE s3_key IN (${placeholders})`, keys);

            deleted.push(...(s3Result.Deleted || []));
            errors.push(...(s3Result.Errors || []));
        } else {
            const placeholders = keys.map(() => "?").join(",");
            await query(
                `UPDATE images SET is_active = FALSE, deleted_at = NOW() WHERE s3_key IN (${placeholders})`,
                keys
            );
            deleted.push(...keys.map((key) => ({ Key: key })));
        }

        // Log bulk deletion
        const placeholders = keys.map(() => "?").join(",");
        await query(
            `INSERT INTO image_activity_log (image_id, action, user_id)
             SELECT id, 'DELETE', 'admin' FROM images WHERE s3_key IN (${placeholders})`,
            keys
        );

        return { deleted, errors, success: errors.length === 0 };
    } catch (error) {
        console.error("S3 Bulk Delete or Database Error:", error);
        throw new Error(`Failed to delete images: ${error.message}`);
    }
};

/**
 * Check if an image exists in the database.
 */
export const imageExists = async ({ key }) => {
    try {
        const sql = `
            SELECT id, s3_key, s3_url, thumbnail_url, category, original_filename, 
                   file_size, mime_type, is_active, created_at
            FROM images 
            WHERE s3_key = ? AND is_active = TRUE
            LIMIT 1
        `;
        const result = await query(sql, [key]);
        return result.length > 0 ? result[0] : null;
    } catch (error) {
        console.error("Database query error:", error);
        throw error;
    }
};

/**
 * Get statistics for all categories.
 */
export const getCategoryStatistics = async () => {
    try {
        const sql = `
            SELECT 
                category,
                COUNT(*) as total_images,
                SUM(file_size) as total_size_bytes,
                ROUND(SUM(file_size) / 1024 / 1024, 2) as total_size_mb,
                MIN(created_at) as oldest_upload,
                MAX(created_at) as newest_upload
            FROM images 
            WHERE is_active = TRUE
            GROUP BY category
            ORDER BY total_images DESC
        `;
        return await query(sql);
    } catch (error) {
        console.error("Database query error:", error);
        throw error;
    }
};