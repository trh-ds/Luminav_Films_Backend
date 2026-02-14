import ffmpeg from 'fluent-ffmpeg';
import { Upload } from '@aws-sdk/lib-storage';
import { s3Client, BUCKET_NAME } from '../config/s3.config.js';
import { createReadStream, readdirSync, unlinkSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';

/**
 * Converts an MP4 buffer to HLS chunks using FFmpeg,
 * uploads all files to S3, and cleans up temp files.
 *
 * @param {Buffer} fileBuffer   - raw video file buffer from multer
 * @param {string} category     - e.g. "ad_films" | "short_films"
 * @param {string} slug         - folder-safe title slug
 * @param {Function} onProgress - optional callback(percent)
 */
export const convertAndUpload = async (fileBuffer, category, slug, onProgress) => {
    // ── 1. Write buffer to a temp input file ─────────────────────────────
    const tempDir = join(tmpdir(), `luminav_${randomUUID()}`);
    const inputPath = join(tempDir, 'input.mp4');
    const outputDir = join(tempDir, 'hls');

    mkdirSync(tempDir, { recursive: true });
    mkdirSync(outputDir, { recursive: true });

    await import('fs').then(fs => fs.promises.writeFile(inputPath, fileBuffer));

    // ── 2. Run FFmpeg → HLS with ~1MB chunks ─────────────────────────────
    await new Promise((resolve, reject) => {
        ffmpeg(inputPath)
            .outputOptions([
                '-codec:v libx264',       // H.264 video
                '-codec:a aac',           // AAC audio
                '-b:v 1500k',             // 1.5Mbps video bitrate
                '-b:a 128k',              // 128kbps audio
                '-vf scale=1280:720',     // 720p output
                '-hls_time 4',            // ~4s per segment → ~1MB at 1.5Mbps
                '-hls_playlist_type vod', // VOD playlist (not live)
                '-hls_segment_type mpegts',
                '-hls_segment_filename',
                join(outputDir, 'shot_%03d.ts'), // shot_001.ts, shot_002.ts ...
                '-start_number 0',
            ])
            .output(join(outputDir, 'output.m3u8'))
            .on('progress', (progress) => {
                if (onProgress && progress.percent) {
                    onProgress(Math.round(progress.percent));
                }
            })
            .on('end', resolve)
            .on('error', reject)
            .run();
    });

    // ── 3. Upload all files in outputDir to S3 ────────────────────────────
    const files = readdirSync(outputDir);
    const s3Prefix = `${category}/${slug}`;

    console.log(`📦 Uploading ${files.length} files to S3 at ${s3Prefix}/`);

    await Promise.all(
        files.map(async (filename) => {
            const filePath = join(outputDir, filename);
            const contentType = filename.endsWith('.m3u8')
                ? 'application/vnd.apple.mpegurl'
                : 'video/mp2t';

            const upload = new Upload({
                client: s3Client,
                params: {
                    Bucket: BUCKET_NAME,
                    Key: `${s3Prefix}/${filename}`,
                    Body: createReadStream(filePath),
                    ContentType: contentType,
                    ContentDisposition: 'inline',
                },
            });

            await upload.done();
            console.log(`  ✅ Uploaded: ${filename}`);
        })
    );

    // ── 4. Clean up temp files ────────────────────────────────────────────
    await import('fs').then(fs => fs.promises.rm(tempDir, { recursive: true, force: true }));
    console.log(`🧹 Temp files cleaned up`);

    return {
        s3Prefix,
        fileCount: files.length,
        playlistUrl: `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Prefix}/output.m3u8`,
    };
};