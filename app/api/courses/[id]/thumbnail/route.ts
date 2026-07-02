import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db, courses } from '@db/index'
import { eq } from 'drizzle-orm'
import { requireTutor, requireOwnerOrAdmin } from '@/lib/rbac'
import { writeAuditLog, auditMeta } from '@/lib/audit'
import { handleRouteError, Errors } from '@/lib/errors'
import { redis, RedisKeys } from '@/lib/redis'


export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/courses/[id]/thumbnail
//
// Called by the client AFTER a successful direct R2 upload.
// Stores the R2 object key on the course record.
//
// Flow:
//   1. Client fetches a presigned PUT URL via POST /api/upload/presign
//   2. Client uploads the image directly to R2
//   3. Client calls PATCH /api/courses/[id]/thumbnail with the R2 key
//   4. This handler stores the key and invalidates the cache
// ─────────────────────────────────────────────────────────────────────────────

const schema = z.object({
  // The R2 object key returned by /api/upload/presign
  r2Key: z.string().min(1, 'r2Key is required').max(500),
})

export async function PATCH(request: Request, { params }: Params): Promise<NextResponse> {
  try {
    const identity = requireTutor(request)
    const { id } = await params

    // Verify course exists and user owns it
    const [course] = await db
      .select({ id: courses.id, tutorId: courses.tutorId })
      .from(courses)
      .where(eq(courses.id, id))
      .limit(1)

    if (!course) throw Errors.notFound('Course')
    requireOwnerOrAdmin(identity, course.tutorId)

    let body: unknown
    try { body = await request.json() } catch { throw Errors.badRequest('Invalid JSON') }

    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          fields: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      )
    }

    // Validate the key belongs to this course (prevent overwriting other courses)
    const expectedPrefix = `courses/${id}/thumbnail.`
    if (!parsed.data.r2Key.startsWith(expectedPrefix)) {
      throw Errors.badRequest('Invalid R2 key for this course')
    }

    await db
      .update(courses)
      .set({ thumbnailR2Key: parsed.data.r2Key, updatedAt: new Date() })
      .where(eq(courses.id, id))

    // Invalidate cache
    await Promise.all([
      redis.del(RedisKeys.courseListCache()),
      redis.del(RedisKeys.courseDetailCache(id)),
    ])

    await writeAuditLog({
      actorId: identity.userId,
      action: 'course.updated',
      targetType: 'course',
      targetId: id,
      ...auditMeta(request),
      metadata: { field: 'thumbnailR2Key', r2Key: parsed.data.r2Key },
    })

    return NextResponse.json({
      success: true,
      data: { thumbnailR2Key: parsed.data.r2Key },
    })
  } catch (err) {
    return handleRouteError(err)
  }
}