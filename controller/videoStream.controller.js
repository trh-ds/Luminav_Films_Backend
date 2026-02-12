import { s3Client, BUCKET_NAME } from "../config/s3.config.js";

export const streamVideoController = async (req, res) => {
    try {
        const { category, videoId, filename } = req.params;

        const key = `${category}/${videoId}/${filename}`;
        console.log("🔐 SIGNING KEY:", key);

        const signedUrl = s3.getSignedUrl("getObject", {
            Bucket: "luminav-films-bucket",
            Key: key,
            Expires: 60 * 10, // 10 minutes
        });

        // 🔁 Redirect browser directly to S3
        res.redirect(signedUrl);

    } catch (err) {
        console.error("SIGNED URL ERROR:", err);
        res.status(500).send("Streaming failed");
    }
};
