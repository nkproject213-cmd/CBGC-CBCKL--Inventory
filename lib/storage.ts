import "server-only";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

function env(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} 환경변수가 설정되지 않았습니다.`);
  return value;
}

function client() {
  return new S3Client({
    region: process.env.AWS_DEFAULT_REGION || "auto",
    endpoint: env("AWS_ENDPOINT_URL"),
    credentials: {
      accessKeyId: env("AWS_ACCESS_KEY_ID"),
      secretAccessKey: env("AWS_SECRET_ACCESS_KEY"),
    },
    forcePathStyle: true,
  });
}

export function mediaUrl(key: string) {
  return `/api/media/${encodeURIComponent(key)}`;
}

export function keyFromMediaUrl(url: string | null | undefined) {
  if (!url?.startsWith("/api/media/")) return null;
  return decodeURIComponent(url.slice("/api/media/".length));
}

export async function putImage(key: string, file: File) {
  const bytes = Buffer.from(await file.arrayBuffer());
  await client().send(new PutObjectCommand({
    Bucket: env("AWS_S3_BUCKET_NAME"),
    Key: key,
    Body: bytes,
    ContentType: file.type,
    CacheControl: "public, max-age=31536000, immutable",
  }));
}

export async function getImage(key: string) {
  return client().send(new GetObjectCommand({
    Bucket: env("AWS_S3_BUCKET_NAME"),
    Key: key,
  }));
}

export async function deleteImageByUrl(url: string | null | undefined) {
  const key = keyFromMediaUrl(url);
  if (!key) return;
  await client().send(new DeleteObjectCommand({
    Bucket: env("AWS_S3_BUCKET_NAME"),
    Key: key,
  }));
}
