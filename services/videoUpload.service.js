// services/video.service.js
import db from "../config/db.config.js"; // mysql2 / pool

export const createVideoService = async ({
    category,
    title,
    description,
    thumbnailOne,
    thumbnailTwo,
    
}) => {
    const bucket = "luminav-films-bucket";
    const region = "eu-north-1";

    // Normalize title → folder-safe
    const safeTitle = title
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_")
        .replace(/[^a-z0-9_]/g, "");

    const videoUrl = `https://${bucket}.s3.${region}.amazonaws.com/${category}/${safeTitle}/output.m3u8`;

    const [result] = await db.execute(
        `
        INSERT INTO videos 
        (category, title, description, thumbnail_one, thumbnail_two, video_url)
        VALUES (?, ?, ?, ?, ?, ?)
        `,
        [
            category,
            title,
            description,
            thumbnailOne,
            thumbnailTwo,
            videoUrl,
        ]
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
export const getAllVideos = async () => {
  const [rows] = await db.query(`
    SELECT 
      id,
      title,
      description,
      thumbnail_one,
      thumbnail_two,
      video_url
    FROM videos
    ORDER BY created_at DESC
  `);

  return rows.map((row) => ({
    id: row.id,
    thumbnails: [
      row.thumbnail_one,
      row.thumbnail_two,
    ],
    title: row.title,
    description: row.description,
    videoUrl: row.video_url,
  }));
};


export const deleteVideoById = async (videoId) => {
    try {
        const [result] = await db.query(
            'DELETE FROM videos WHERE id = ?',
            [videoId]
        );

        if (result.affectedRows === 0) {
            return null;
        }

        console.log(`✅ Video ${videoId} deleted successfully`);
        return { 
            success: true, 
            id: videoId,
            affectedRows: result.affectedRows 
        };

    } catch (error) {
        console.error(`❌ Error deleting video ${videoId}:`, error);
        throw error;
    }
};
