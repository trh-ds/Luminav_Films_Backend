import dotenv from 'dotenv';
dotenv.config();

import express from "express";
import mysql from "mysql2/promise";

import cookieParser from "cookie-parser";
import adminRoutes from "./routes/admin.route.js";
import imageRoutes from "./routes/image.route.js";
import videoRoutes from "./routes/video.route.js";
import uploadRoutes from "./routes/videoUpload.route.js";
import cors from "cors";



const app = express();

app.use(cors({
    origin: true,
    credentials: true,
}));




app.use(express.json());
app.use(cookieParser());

export const db = mysql.createPool({
    host: "luminav-films-database.ctgqwaq8oedy.eu-north-1.rds.amazonaws.com",
    user: "admin",
    password: "luminav_films_2026",
    database: "luminav_films",
});

// Routes
app.use("/api/admin", adminRoutes);
app.use("/api/images", imageRoutes);
app.use("/api/videos", videoRoutes);
app.use("/api/videos-upload", uploadRoutes);
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🔥 Server running on port ${PORT}`);
});
