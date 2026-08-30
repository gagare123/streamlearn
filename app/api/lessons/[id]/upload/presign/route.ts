import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireTutor } from '@/lib/rbac'
import { getPresignedUploadUrl, R2Keys, isAllowedAttachmentType, mimeToExt } from '@/lib/r2'
import { writeAuditLog, auditMeta } from '@/lib/audit'
import { rateLimitByUser, RateLimits, rateLimitHeaders } from '@/lib/rate-limit'
import { handleRouteError, Errors } from '@/lib/errors'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  fileName: z.string().min(1).max(255),
  contentType: z.string().min(1),
  target: z.enum(['lesson']),
  lessonId: z.string().uuid(),
})

export async function POST(request: Request) {
  try {
    const identity = requireTutor(request)

    const rl = await rateLimitByUser(identity.userId, 'upload:presign', RateLimits.AUTH)
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
        { success: false, error: 'Validation failed', fields: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }

    const { fileName, contentType, target, lessonId } = parsed.data

    if (!isAllowedAttachmentType(contentType)) {
      throw Errors.badRequest('File type not allowed. Accepted: PDF, PPT, DOCX, TXT')
    }

    const ext = mimeToExt(contentType)
    let r2Key: string

    if (target === 'lesson') {
      r2Key = R2Keys.lessonAttachment(lessonId, ext)
    } else {
      throw Errors.badRequest('Invalid target')
    }

    const uploadUrl = await getPresignedUploadUrl(r2Key, contentType, 900)

    await writeAuditLog({
      actorId: identity.userId,
      action: 'upload.presigned_url_issued',
      targetType: 'lesson',
      targetId: lessonId,
      ...auditMeta(request),
      metadata: { fileName, contentType, r2Key },
    })

    return NextResponse.json({ success: true, data: { uploadUrl, r2Key } })
  } catch (err) {
    return handleRouteError(err)
  }
}