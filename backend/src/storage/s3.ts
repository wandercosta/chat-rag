import { S3Client } from "@aws-sdk/client-s3";
import { env } from "../config/env.js";

/** Cliente compartilhado (MinIO local / S3 compativel em outros ambientes). */
export const s3 = new S3Client({
  endpoint: env.S3_ENDPOINT,
  region: env.S3_REGION,
  forcePathStyle: env.S3_FORCE_PATH_STYLE,
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
  },
});

export const SOURCES_BUCKET = env.S3_BUCKET;
