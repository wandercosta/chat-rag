import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { s3, SOURCES_BUCKET } from "./s3.js";

export async function putSourceFile(key: string, body: Buffer, contentType: string): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: SOURCES_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

export async function getSourceFile(key: string): Promise<Buffer> {
  const result = await s3.send(new GetObjectCommand({ Bucket: SOURCES_BUCKET, Key: key }));
  const chunks: Buffer[] = [];
  for await (const chunk of result.Body as AsyncIterable<Buffer>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export function sourceObjectKey(
  organizationId: string,
  sourceId: string,
  filename: string,
): string {
  return `${organizationId}/${sourceId}/${filename}`;
}
