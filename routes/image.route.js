import express from "express";
import multer from "multer";
import {
    getImagesByCategory,
    uploadImage,
    deleteImageByCategory,
    deleteMultipleImagesByCategory,
    getCategories,
} from "../controller/image.controller.js";
import { VALID_CATEGORIES } from "../services/image.service.js";

const router = express.Router();

// Configure multer for file upload
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 50 * 1024 * 1024, // 50MB limit
    },
    fileFilter: (req, file, cb) => {
        // Accept images only
        const allowedMimeTypes = [
            "image/jpeg",
            "image/jpg",
            "image/png",
            "image/webp",
            "image/gif",
        ];
        if (allowedMimeTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(
                new Error(
                    "Invalid file type. Only JPEG, PNG, WebP, and GIF are allowed"
                ),
                false
            );
        }
    },
});

// ========================================
// PUBLIC ROUTES
// ========================================

/**
 * GET /api/images/categories
 * Get all valid image categories
 */
router.get("/categories", getCategories);

/**
 * POST /api/images/upload
 * Upload a new image
 * Body: multipart/form-data
 *   - image: file (required)
 *   - category: string (required)
 */
router.post("/upload", upload.single("image"), uploadImage);

// ========================================
// CATEGORY-SPECIFIC ROUTES
// ========================================

/**
 * GET /api/images/:category
 * Get images from a specific category
 * Query params:
 *   - limit: number (optional, default: 10, max: 100)
 *   - token: string (optional, for pagination)
 */
router.get(
    "/featured-work",
    getImagesByCategory(VALID_CATEGORIES.FEATURED_WORK)
);
router.get("/portraits", getImagesByCategory(VALID_CATEGORIES.PORTRAITS));
router.get(
    "/product-shoots",
    getImagesByCategory(VALID_CATEGORIES.PRODUCT_SHOOTS)
);
router.get("/thumbnails", getImagesByCategory(VALID_CATEGORIES.THUMBNAILS));
router.get("/documentry", getImagesByCategory(VALID_CATEGORIES.DOCUMENTARY));
router.get("/travel", getImagesByCategory(VALID_CATEGORIES.TRAVEL));

/**
 * DELETE /api/images/:category
 * Delete a single image from a specific category
 * Body: application/json
 *   - key: string (required) - S3 key of the image
 */
router.delete(
    "/featured-work",
    deleteImageByCategory(VALID_CATEGORIES.FEATURED_WORK)
);
router.delete("/portraits", deleteImageByCategory(VALID_CATEGORIES.PORTRAITS));
router.delete(
    "/product-shoots",
    deleteImageByCategory(VALID_CATEGORIES.PRODUCT_SHOOTS)
);
router.delete("/thumbnails", deleteImageByCategory(VALID_CATEGORIES.THUMBNAILS));
router.delete("/documentry", deleteImageByCategory(VALID_CATEGORIES.DOCUMENTARY));
router.delete("/travel", deleteImageByCategory(VALID_CATEGORIES.TRAVEL));
router.get("/test-aws-config", (req, res) => {
    res.json({
        hasAccessKey: !!process.env.AWS_ACCESS_KEY_ID,
        hasSecretKey: !!process.env.AWS_SECRET_ACCESS_KEY,
        region: process.env.AWS_REGION ,
        bucket: process.env.AWS_BUCKET_NAME,
        // Don't send actual credentials, just check if they exist
        accessKeyPreview: process.env.AWS_ACCESS_KEY_ID 
            ? process.env.AWS_ACCESS_KEY_ID.substring(0, 8) + "..." 
            : "NOT SET"
    });
});
/**
 * DELETE /api/images/:category/bulk
 * Delete multiple images from a specific category
 * Body: application/json
 *   - keys: string[] (required) - Array of S3 keys
 */
router.delete(
    "/featured-work/bulk",
    deleteMultipleImagesByCategory(VALID_CATEGORIES.FEATURED_WORK)
);
router.delete(
    "/portraits/bulk",
    deleteMultipleImagesByCategory(VALID_CATEGORIES.PORTRAITS)
);
router.delete(
    "/product-shoots/bulk",
    deleteMultipleImagesByCategory(VALID_CATEGORIES.PRODUCT_SHOOTS)
);
router.delete(
    "/thumbnails/bulk",
    deleteMultipleImagesByCategory(VALID_CATEGORIES.THUMBNAILS)
);
router.delete(
    "/documentry/bulk",
    deleteMultipleImagesByCategory(VALID_CATEGORIES.DOCUMENTARY)
);
router.delete(
    "/travel/bulk",
    deleteMultipleImagesByCategory(VALID_CATEGORIES.TRAVEL)
);

// ========================================
// ERROR HANDLING MIDDLEWARE
// ========================================

// Handle multer errors
router.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === "LIMIT_FILE_SIZE") {
            return res.status(400).json({
                success: false,
                message: "File is too large. Maximum size is 50MB",
            });
        }
        return res.status(400).json({
            success: false,
            message: error.message,
        });
    }
    next(error);
});
router.get("/debug-env", (req, res) => {
    res.json({
        database: {
            host: process.env.DB_HOST || "NOT SET",
            user: process.env.DB_USER || "NOT SET",
            password: process.env.DB_PASSWORD ? "SET ✅" : "NOT SET ❌",
            name: process.env.DB_NAME || "NOT SET",
            port: process.env.DB_PORT || "NOT SET",
        },
        aws: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID 
                ? process.env.AWS_ACCESS_KEY_ID.substring(0, 8) + "..." 
                : "NOT SET ❌",
            secretKey: process.env.AWS_SECRET_ACCESS_KEY ? "SET ✅" : "NOT SET ❌",
            region: process.env.AWS_REGION || "NOT SET",
            bucket: process.env.AWS_BUCKET_NAME || "NOT SET",
        }
    });
});

export default router;