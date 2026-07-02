import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { env } from './env'

// ─────────────────────────────────────────────────────────────────────────────
// Cloudflare R2 S3-compatible client
//
// Cloudflare R2 exposes an S3-compatible API — we use the AWS SDK.
// Endpoint format: https://<accountId>.r2.cloudflarestorage.com
// ─────────────────────────────────────────────────────────────────────────────

let _r2: S3Client | null = null

export function getR2Client(): S3Client {
  if (_r2) return _r2

  if (!env.R2_ACCOUNT_ID || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY) {
    throw new Error(
      'R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY must be set.',
    )
  }

  _r2 = new S3Client({
    region: 'auto',
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
  })

  return _r2
}

// ─────────────────────────────────────────────────────────────────────────────
// Object key builders
// Keeps all key patterns in one place to prevent typos.
// ─────────────────────────────────────────────────────────────────────────────

export const R2Keys = {
  /** Course thumbnail: courses/{courseId}/thumbnail.{ext} */
  courseThumbnail: (courseId: string, ext: string) =>
    `courses/${courseId}/thumbnail.${ext}`,

  /** Lesson attachment (PDF, slides): lessons/{lessonId}/attachment.{ext} */
  lessonAttachment: (lessonId: string, ext: string) =>
    `lessons/${lessonId}/attachment.${ext}`,

  /** User avatar: avatars/{userId}.{ext} */
  userAvatar: (userId: string, ext: string) => `avatars/${userId}.${ext}`,

  /** Certificate PDF: certificates/{certificateId}.pdf */
  certificate: (certificateId: string) => `certificates/${certificateId}.pdf`,
} as const

// ─────────────────────────────────────────────────────────────────────────────
// Pre-signed URL generators
// ─────────────────────────────────────────────────────────────────────────────

const BUCKET = () => {
  if (!env.R2_BUCKET_NAME) throw new Error('R2_BUCKET_NAME is not set')
  return env.R2_BUCKET_NAME
}

//const MAX_UPLOAD_BYTES = 50 * 1024 * 1024 // 50 MB

/**
 * Generate a pre-signed PUT URL.
 * The client uploads directly to R2 — the server never proxies file bytes.
 *
 * @param key        R2 object key (use R2Keys helpers)
 * @param contentType  MIME type of the file being uploaded
 * @param expiresIn  Seconds until the URL expires (default: 900 = 15 minutes)
 */
export async function getPresignedUploadUrl(
  key: string,
  contentType: string,
  expiresIn = 900,
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: BUCKET(),
    Key: key,
    ContentType: contentType,
    // Enforce max upload size via Content-Length header — client must set it
    // Note: R2 enforces this at the network level when the header is present
  })

  return getSignedUrl(getR2Client(), command, { expiresIn })
}

/**
 * Generate a pre-signed GET URL.
 * Use this for private files (attachments, certificates, avatars).
 * Public files served via R2_PUBLIC_BASE_URL don't need signed URLs.
 *
 * @param key       R2 object key
 * @param expiresIn Seconds until the URL expires (default: 3600 = 1 hour)
 */
export async function getPresignedDownloadUrl(
  key: string,
  expiresIn = 3600,
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: BUCKET(),
    Key: key,
  })

  return getSignedUrl(getR2Client(), command, { expiresIn })
}

/**
 * Delete an object from R2.
 */
export async function deleteR2Object(key: string): Promise<void> {
  const command = new DeleteObjectCommand({
    Bucket: BUCKET(),
    Key: key,
  })

  await getR2Client().send(command)
}

/**
 * Build the public URL for a publicly-accessible R2 object.
 * Only use for objects in the public bucket (e.g. course thumbnails).
 */
export function getR2PublicUrl(key: string): string {
  if (!env.R2_PUBLIC_BASE_URL) throw new Error('R2_PUBLIC_BASE_URL is not set')
  return `${env.R2_PUBLIC_BASE_URL}/${key}`
}

// ─────────────────────────────────────────────────────────────────────────────
// MIME type validation
// ─────────────────────────────────────────────────────────────────────────────

export const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const

export const ALLOWED_ATTACHMENT_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
] as const

export type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number]
export type AllowedAttachmentType = (typeof ALLOWED_ATTACHMENT_TYPES)[number]

export function isAllowedImageType(mime: string): mime is AllowedImageType {
  return (ALLOWED_IMAGE_TYPES as readonly string[]).includes(mime)
}

export function isAllowedAttachmentType(mime: string): mime is AllowedAttachmentType {
  return (ALLOWED_ATTACHMENT_TYPES as readonly string[]).includes(mime)
}

/**
 * Get the file extension for a MIME type.
 */
export function mimeToExt(mime: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'application/pdf': 'pdf',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
    'application/vnd.ms-powerpoint': 'ppt',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'text/plain': 'txt',
  }
  return map[mime] ?? 'bin'
}