import { s3, BUCKET_NAME } from "../config/s3.config.js";

export const streamFromS3 = async ({ res, key, range }) => {
    const params = {
        Bucket: BUCKET_NAME,
        Key: key,
    };

    if (range) params.Range = range;

    const stream = s3.getObject(params).createReadStream();
    stream.pipe(res);
};
