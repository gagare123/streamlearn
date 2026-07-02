import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireTutor } from '@/lib/rbac'
import { getPresignedUploadUrl, R2Keys, isAllowedImageType, isAllowedAttachmentType, mimeToExt } from '@/lib/r2'
import { writeAuditLog, auditMeta } from '@/lib/audit'
import { rateLimitByUser, RateLimits, rateLimitHeaders } from '@/lib/rate-limit'
import { handleRouteError, Errors } from '@/lib/errors'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/upload/presign
//
// Issues a pre-signed R2 PUT URL.
// The client uploads the file directly to Cloudflare R2 — the server
// never proxies the file bytes.
//
// Supported targets:
//   • course_thumbnail — JPEG/PNG/WebP, max 5 MB
//   • lesson_attachment — PDF/PPTX/DOCX, max 50 MB
//   • user_avatar — JPEG/PNG/WebP, max 2 MB
//
// TUTOR or ADMIN only.
// ─────────────────────────────────────────────────────────────────────────────

const schema = z.object({
  target: z.enum(['course_thumbnail', 'lesson_attachment', 'user_avatar']),
  resourceId: z.string().uuid('resourceId must be a valid UUID'),
  contentType: z.string().min(1, 'contentType is required'),
  fileSizeBytes: z.number().int().positive().max(
    50 * 1024 * 1024,
    'File must be under 50 MB',
  ),
})

const MAX_SIZES: Record<string, number> = {
  course_thumbnail: 5 * 1024 * 1024,   // 5 MB
  lesson_attachment: 50 * 1024 * 1024, // 50 MB
  user_avatar: 2 * 1024 * 1024,        // 2 MB
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const identity = requireTutor(request)

    // Rate limit: 20 presign requests per minute per user
    const rl = await rateLimitByUser(identity.userId, 'upload:presign', RateLimits.UPLOAD)
    if (!rl.allowed) {
      return NextResponse.json(
        { success: false, error: 'Too many upload requests', code: 'RATE_LIMITED' },
        { status: 429, headers: rateLimitHeaders(rl) },
      )
    }

    let body: unknown
    try { body = await request.json() } catch { throw Errors.badRequest('Invalid JSON') }

    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', code: 'VALIDATION_ERROR', fields: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }

    const { target, resourceId, contentType, fileSizeBytes } = parsed.data

    // ── Validate content type per target ──────────────────────────────────
    if (target === 'course_thumbnail' || target === 'user_avatar') {
      if (!isAllowedImageType(contentType)) {
        throw Errors.badRequest(`${contentType} is not allowed for ${target}. Use JPEG, PNG, or WebP.`)
      }
    }

    if (target === 'lesson_attachment') {
      if (!isAllowedAttachmentType(contentType)) {
        throw Errors.badRequest(`${contentType} is not allowed for attachments. Use PDF, PPTX, DOCX, or TXT.`)
      }
    }

    // ── Validate file size per target ─────────────────────────────────────
    const maxBytes = MAX_SIZES[target] ?? 0
    if (fileSizeBytes > maxBytes) {
      const maxMb = Math.round(maxBytes / (1024 * 1024))
      throw Errors.badRequest(`File exceeds the ${maxMb} MB limit for ${target}`)
    }

    // ── Build R2 object key ───────────────────────────────────────────────
    const ext = mimeToExt(contentType)
    let key: string

    switch (target) {
      case 'course_thumbnail':
        key = R2Keys.courseThumbnail(resourceId, ext)
        break
      case 'lesson_attachment':
        key = R2Keys.lessonAttachment(resourceId, ext)
        break
      case 'user_avatar':
        key = R2Keys.userAvatar(resourceId, ext)
        break
    }

    // ── Generate pre-signed URL (15-minute expiry) ────────────────────────
    const uploadUrl = await getPresignedUploadUrl(key, contentType, 900)

    await writeAuditLog({
      actorId: identity.userId,
      action: 'upload.presigned_url_issued',
      targetType: 'upload',
      ...auditMeta(request),
      metadata: { target, resourceId, contentType, fileSizeBytes, key },
    })

    return NextResponse.json({
      success: true,
      data: {
        uploadUrl,
        key,
        expiresIn: 900,
        method: 'PUT',
      },
    })
  } catch (err) {
    return handleRouteError(err)
  }
}