import express from "express";
import multer from "multer";
import { streamVideoController } from "../controller/videoStream.controller.js";
const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

/**
 * POST /videos/upload/:category/:videoId
 * category = ad_shoots | short_films
 */
router.get("/:category/:videoId/:filename", streamVideoController);
export default router;
