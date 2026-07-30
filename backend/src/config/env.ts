import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  PORT: z.coerce.number().default(3333),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  APP_MASTER_KEY: z.string().min(32, "APP_MASTER_KEY precisa ter pelo menos 32 caracteres"),
  SESSION_COOKIE_NAME: z.string().default("chatrag_session"),
  SESSION_TTL_HOURS: z.coerce.number().default(12),
  S3_ENDPOINT: z.string().min(1),
  S3_REGION: z.string().default("us-east-1"),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  S3_FORCE_PATH_STYLE: z.coerce.boolean().default(true),
});

export const env = schema.parse(process.env);
