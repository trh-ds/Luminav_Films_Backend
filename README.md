# Luminav Films Backend Server

This is the backend server for the Luminav Films website, built with Node.js and Express. It handles image uploads to AWS S3, authentication, and API endpoints for the frontend.

## Project Structure

```
server/
├── server.js          # Entry point
├── app.js             # Express app configuration
├── package.json       # Dependencies and scripts
├── .env.example       # Environment variables template
├── routes/            # Route definitions
│   ├── image.routes.js
│   └── video.routes.js
├── controllers/       # Request handlers
│   ├── image.controller.js
│   └── video.controller.js
├── services/          # Business logic
│   └── image.service.js
└── utils/             # Utility functions
    ├── auth.utils.js
    └── image.utils.js
```

## Setup Instructions

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create a `.env` file based on `.env.example`:
   ```bash
   cp .env.example .env
   ```

3. Fill in your AWS credentials and other environment variables in the `.env` file.

4. Start the development server:
   ```bash
   npm run dev
   ```

5. For production:
   ```bash
   npm start
   ```

## API Endpoints

### Authentication
- `POST /api/admin/login` - Admin login

### Images
- `POST /api/images/upload` - Upload image (admin only)
- `GET /api/images/:category` - Get images by category
- `GET /api/images` - Get all images (admin only)
- `DELETE /api/images/:id` - Delete image by ID (admin only)

### Videos
- `POST /api/videos/upload` - Upload video metadata (admin only)
- `GET /api/videos/get-data` - Get all videos
- `DELETE /api/videos/:id` - Delete video by ID (admin only)

## AWS S3 Configuration

The backend uses AWS S3 for image storage. Make sure to configure the following environment variables:

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION`
- `AWS_BUCKET_NAME`

## Security Considerations

- All admin routes are protected with authentication middleware
- Image uploads are validated for file type and size
- CORS is configured to only allow requests from the frontend origin
- Environment variables are used for sensitive configuration