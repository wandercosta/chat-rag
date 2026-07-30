/**
 * Cria o bucket do MinIO usado por knowledge/sources (PDF/DOCX). So precisa
 * rodar uma vez por ambiente local (docker compose up -d antes).
 * Uso: npm run bucket:create
 */
import { CreateBucketCommand, HeadBucketCommand } from "@aws-sdk/client-s3";
import { s3, SOURCES_BUCKET } from "../src/storage/s3.js";

try {
  await s3.send(new HeadBucketCommand({ Bucket: SOURCES_BUCKET }));
  console.log(`bucket ${SOURCES_BUCKET} ja existe`);
} catch {
  await s3.send(new CreateBucketCommand({ Bucket: SOURCES_BUCKET }));
  console.log(`bucket ${SOURCES_BUCKET} criado`);
}
