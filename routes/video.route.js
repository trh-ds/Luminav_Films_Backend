// video.routes.js
import express from "express";
import {
    createVideo,
    fetchVideos,
    fetchVideoById,
    deleteVideo,
    streamVideo,
} from "../controller/video.controller.js";
import multer from 'multer';
import { uploadAndCreateVideo } from '../controller/video.controller.js';
const router = express.Router();

// ─── Streaming Route (must be defined BEFORE /:id to avoid conflict) ─────────
router.get("/stream/:category/:videoSlug/:filename", streamVideo);

// ─── Metadata Routes ──────────────────────────────────────────────────────────
router.get("/", fetchVideos);
router.post("/", createVideo);
router.get("/:id", fetchVideoById);
router.delete("/:id", deleteVideo);
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 2 * 1024 * 1024 * 1024 }, // 2GB max
    fileFilter: (_, file, cb) => {
        if (file.mimetype.startsWith('video/')) cb(null, true);
        else cb(new Error('Only video files are allowed'));
    },
});

// Add this route — before /:id
router.post('/upload', upload.single('video'), uploadAndCreateVideo);

export default router;