import { createVideoService } from "../services/videoUpload.service.js";
import { getAllVideos } from "../services/videoUpload.service.js";
import { deleteVideoById } from "../services/videoUpload.service.js";
// Properly formatted video upload function
export const createVideo = async (req, res) => {
    try {
        const { category, title, description, thumbnailOne, thumbnailTwo } = req.body;

        // Validate required fields
        if (!category || !title || !description || !thumbnailOne || !thumbnailTwo) {
            return res.status(400).json({
                message: "All fields are required: category, title, description, thumbnailOne, thumbnailTwo",
            });
        }

        // Create video document
        const video = await createVideoService({
            category,
            title,
            description,
            thumbnailOne,
            thumbnailTwo,
        });

        res.status(201).json({
            message: "Video metadata saved successfully",
            data: video,
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({
            message: "Failed to save video",
        });
    }
};

export const fetchVideos = async (req, res) => {
  try {
    const videos = await getAllVideos();
    res.status(200).json(videos);
  } catch (error) {
    console.error("❌ Error fetching videos:", error);
    res.status(500).json({ message: "Failed to fetch videos" });
  }
};

export const deleteVideo = async (req, res) => {
    try {
        const videoId = parseInt(req.params.id);

        if (isNaN(videoId)) {
            return res.status(400).json({ 
                error: "Invalid video ID" 
            });
        }

        const result = await deleteVideoById(videoId);

        if (!result) {
            return res.status(404).json({ 
                error: "Video not found" 
            });
        }

        res.status(200).json({ 
            message: "Video deleted successfully",
            id: videoId 
        });

    } catch (error) {
        console.error("❌ Error deleting video:", error);
        res.status(500).json({ 
            error: "Failed to delete video",
            details: error.message 
        });
    }
};
