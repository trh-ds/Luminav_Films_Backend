import {
    uploadImageToS3,
    getImagesFromFolder,
    deleteImageFromS3,
    deleteMultipleImagesFromS3,
    VALID_CATEGORIES,
} from "../services/image.service.js";

/**
 * Controller to get images by category with pagination.
 * Now returns thumbnailUrl alongside url for each image.
 */
export const getImagesByCategory = (category) => {
    return async (req, res) => {
        try {
            const limit = parseInt(req.query.limit) || 10;
            const page = parseInt(req.query.page) || 1;
            const offset = (page - 1) * limit;

            if (limit < 1 || limit > 100) {
                return res.status(400).json({
                    success: false,
                    message: "Limit must be between 1 and 100",
                });
            }

            const result = await getImagesFromFolder({ folder: category, limit, offset });

            res.status(200).json({
                success: true,
                category,
                ...result,
            });
        } catch (error) {
            console.error(`Error fetching images for category ${category}:`, error);
            res.status(500).json({
                success: false,
                message: error.message || "Failed to fetch images",
            });
        }
    };
};

/**
 * Controller to upload an image.
 * The service automatically generates and uploads a thumbnail — nothing extra needed here.
 */
export const uploadImage = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: "No file uploaded" });
        }

        const { category } = req.body;
        if (!category) {
            return res.status(400).json({ success: false, message: "Category is required" });
        }

        if (!Object.values(VALID_CATEGORIES).includes(category)) {
            return res.status(400).json({
                success: false,
                message: `Invalid category. Valid categories are: ${Object.values(VALID_CATEGORIES).join(", ")}`,
            });
        }

        const allowedMimeTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"];
        if (!allowedMimeTypes.includes(req.file.mimetype)) {
            return res.status(400).json({
                success: false,
                message: "Invalid file type. Only JPEG, PNG, WebP, and GIF are allowed",
            });
        }

        const result = await uploadImageToS3({ file: req.file, category });

        res.status(201).json({
            success: true,
            message: "Image uploaded successfully",
            data: {
                id: result.id,
                url: result.url,
                thumbnailUrl: result.thumbnailUrl, // returned for reference
                key: result.key,
                category: result.category,
                filename: req.file.originalname,
                size: req.file.size,
            },
        });
    } catch (error) {
        console.error("Error uploading image:", error);
        res.status(500).json({ success: false, message: error.message || "Failed to upload image" });
    }
};

/**
 * Controller to delete a single image by category.
 */
export const deleteImageByCategory = (category) => {
    return async (req, res) => {
        try {
            const { key } = req.body;
            if (!key) {
                return res.status(400).json({ success: false, message: "Image key is required" });
            }

            await deleteImageFromS3({ key, category });

            res.status(200).json({
                success: true,
                message: "Image deleted successfully",
                data: { key, category },
            });
        } catch (error) {
            console.error(`Error deleting image from category ${category}:`, error);
            res.status(500).json({ success: false, message: error.message || "Failed to delete image" });
        }
    };
};

/**
 * Controller to delete multiple images by category.
 */
export const deleteMultipleImagesByCategory = (category) => {
    return async (req, res) => {
        try {
            const { keys } = req.body;
            if (!keys || !Array.isArray(keys) || keys.length === 0) {
                return res.status(400).json({ success: false, message: "Array of image keys is required" });
            }

            if (keys.length > 50) {
                return res.status(400).json({ success: false, message: "Cannot delete more than 50 images at once" });
            }

            const result = await deleteMultipleImagesFromS3({ keys, category });

            res.status(200).json({
                success: result.success,
                message: result.success ? "All images deleted successfully" : "Some images failed to delete",
                data: {
                    deleted: result.deleted.length,
                    errors: result.errors.length,
                    details: result,
                },
            });
        } catch (error) {
            console.error(`Error deleting multiple images from category ${category}:`, error);
            res.status(500).json({ success: false, message: error.message || "Failed to delete images" });
        }
    };
};

/**
 * Controller to get all valid categories.
 */
export const getCategories = async (req, res) => {
    try {
        res.status(200).json({ success: true, categories: Object.values(VALID_CATEGORIES) });
    } catch (error) {
        console.error("Error fetching categories:", error);
        res.status(500).json({ success: false, message: "Failed to fetch categories" });
    }
};