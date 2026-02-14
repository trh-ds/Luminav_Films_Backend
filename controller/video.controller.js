
import {
    createVideoService,
    getAllVideos,
    getVideoById,
    deleteVideoById,
    generateSignedUrl,
} from "../services/video.service.js";
import { convertAndUpload } from '../services/upload.service.js';


export const createVideo = async (req, res) => {
    try {
        const { category, title, description, thumbnailOne, thumbnailTwo } = req.body;

        const missing = ["category", "title", "description", "thumbnailOne", "thumbnailTwo"]
            .filter((field) => !req.body[field]);

        if (missing.length > 0) {
            return res.status(400).json({
                error: "Missing required fields",
                fields: missing,
            });
        }

        const video = await createVideoService({
            category,
            title,
            description,
            thumbnailOne,
            thumbnailTwo,
        });

        return res.status(201).json({
            message: "Video metadata saved successfully",
            data: video,
        });
    } catch (err) {
        console.error("[createVideo] Error:", err);
        return res.status(500).json({ error: "Failed to save video metadata" });
    }
};


export const fetchVideos = async (_req, res) => {
    try {
        const videos = await getAllVideos();
        return res.status(200).json(videos);
    } catch (err) {
        console.error("[fetchVideos] Error:", err);
        return res.status(500).json({ error: "Failed to fetch videos" });
    }
};

export const fetchVideoById = async (req, res) => {
    try {
        const videoId = parseInt(req.params.id, 10);
        if (isNaN(videoId)) {
            return res.status(400).json({ error: "Invalid video ID" });
        }

        const video = await getVideoById(videoId);
        if (!video) {
            return res.status(404).json({ error: "Video not found" });
        }

        return res.status(200).json(video);
    } catch (err) {
        console.error("[fetchVideoById] Error:", err);
        return res.status(500).json({ error: "Failed to fetch video" });
    }
};


export const deleteVideo = async (req, res) => {
    try {
        const videoId = parseInt(req.params.id, 10);
        if (isNaN(videoId)) {
            return res.status(400).json({ error: "Invalid video ID" });
        }

        const result = await deleteVideoById(videoId);
        if (!result) {
            return res.status(404).json({ error: "Video not found" });
        }

        return res.status(200).json({
            message: "Video deleted successfully",
            id: result.id,
        });
    } catch (err) {
        console.error("[deleteVideo] Error:", err);
        return res.status(500).json({ error: "Failed to delete video" });
    }
};



// video.controller.js — streamVideo function
export const streamVideo = async (req, res) => {
    try {
        const { category, videoSlug, filename } = req.params;

        if (!category || !videoSlug || !filename) {
            return res.status(400).json({ error: "Missing stream path parameters" });
        }

        const { signedUrl, key } = await generateSignedUrl({ category, videoSlug, filename }); // ✅ await added

        console.log(`[streamVideo] Redirecting → ${key}`);
        return res.redirect(signedUrl);
    } catch (err) {
        console.error("[streamVideo] Error:", err);
        return res.status(500).json({ error: "Failed to generate stream URL" });
    }
};

export const uploadAndCreateVideo = async (req, res) => {
    // Use SSE to stream progress back to the client
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const sendEvent = (data) => {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
        const { category, title, description, thumbnailOne, thumbnailTwo } = req.body;

        if (!req.file) {
            sendEvent({ type: 'error', message: 'No video file uploaded' });
            return res.end();
        }

        const missing = ['category', 'title', 'description']
            .filter(f => !req.body[f]);

        if (missing.length > 0) {
            sendEvent({ type: 'error', message: `Missing fields: ${missing.join(', ')}` });
            return res.end();
        }

        sendEvent({ type: 'progress', stage: 'converting', percent: 0 });

        // Convert + upload
        const slug = title
            .trim()
            .toLowerCase()
            .replace(/\s+/g, '_')
            .replace(/[^a-z0-9_]/g, '');

        const { fileCount } = await convertAndUpload(
            req.file.buffer,
            category,
            slug,
            (percent) => sendEvent({ type: 'progress', stage: 'converting', percent })
        );

        sendEvent({ type: 'progress', stage: 'saving', percent: 100 });

        // Save to DB
        const video = await createVideoService({
            category,
            title,
            description,
            thumbnailOne: thumbnailOne || '',
            thumbnailTwo: thumbnailTwo || '',
        });

        sendEvent({
            type: 'complete',
            message: `Video uploaded successfully (${fileCount} chunks)`,
            data: video,
        });

        res.end();

    } catch (err) {
        console.error('[uploadAndCreateVideo] Error:', err);
        sendEvent({ type: 'error', message: err.message || 'Upload failed' });
        res.end();
    }
};