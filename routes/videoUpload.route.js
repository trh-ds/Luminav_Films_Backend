// routes/video.routes.js
import express from "express";
import { createVideo, deleteVideo } from "../controller/videoUpload.controller.js";
import { fetchVideos } from "../controller/videoUpload.controller.js";
const router = express.Router();
console.log("🔥 videos-upload routes loaded");
router.post("/", createVideo);
router.get("/get-data", fetchVideos)
router.delete("/:id", deleteVideo);
export default router;
