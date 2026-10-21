/**
 * Cria o bucket do storage S3 usado por knowledge/sources (PDF/DOCX). So precisa
 * rodar uma vez por ambiente (o entrypoint do container roda sempre; e idempotente).
 * Uso local: npm run bucket:create
 */
import { CreateBucketCommand, HeadBucketCommand } from "@aws-sdk/client-s3";
import { s3, SOURCES_BUCKET } from "../storage/s3.js";

try {
  await s3.send(new HeadBucketCommand({ Bucket: SOURCES_BUCKET }));
  console.log(`bucket ${SOURCES_BUCKET} ja existe`);
} catch {
  await s3.send(new CreateBucketCommand({ Bucket: SOURCES_BUCKET }));
  console.log(`bucket ${SOURCES_BUCKET} criado`);
}
