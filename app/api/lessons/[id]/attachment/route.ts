import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db, lessons, courseSections, courses } from '@db/index'
import { eq } from 'drizzle-orm'
import { requireTutor, requireOwnerOrAdmin } from '@/lib/rbac'
import { writeAuditLog, auditMeta } from '@/lib/audit'
import { handleRouteError, Errors } from '@/lib/errors'
import { redis, RedisKeys } from '@/lib/redis'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/lessons/[id]/attachment
//
// Called after a successful R2 upload for a lesson attachment (PDF, slides).
// Stores the R2 key and updates the lesson record.
// ─────────────────────────────────────────────────────────────────────────────

const schema = z.object({
  r2Key: z.string().min(1, 'r2Key is required').max(500),
})

export async function PATCH(request: Request, { params }: Params): Promise<NextResponse> {
  try {
    const identity = requireTutor(request)
    const { id } = await params

    // Resolve lesson → section → course for ownership check
    const [row] = await db
      .select({ lesson: lessons, tutorId: courses.tutorId, courseId: courses.id })
      .from(lessons)
      .innerJoin(courseSections, eq(lessons.sectionId, courseSections.id))
      .innerJoin(courses, eq(courseSections.courseId, courses.id))
      .where(eq(lessons.id, id))
      .limit(1)

    if (!row) throw Errors.notFound('Lesson')
    requireOwnerOrAdmin(identity, row.tutorId)

    let body: unknown
    try { body = await request.json() } catch { throw Errors.badRequest('Invalid JSON') }

    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', code: 'VALIDATION_ERROR', fields: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }

    // Validate key belongs to this lesson
    const expectedPrefix = `lessons/${id}/attachment.`
    if (!parsed.data.r2Key.startsWith(expectedPrefix)) {
      throw Errors.badRequest('Invalid R2 key for this lesson')
    }

    await db
      .update(lessons)
      .set({ attachmentR2Key: parsed.data.r2Key, updatedAt: new Date() })
      .where(eq(lessons.id, id))

    await redis.del(RedisKeys.courseDetailCache(row.courseId))

    await writeAuditLog({
      actorId: identity.userId,
      action: 'upload.completed',
      targetType: 'lesson',
      targetId: id,
      ...auditMeta(request),
      metadata: { r2Key: parsed.data.r2Key },
    })

    return NextResponse.json({
      success: true,
      data: { attachmentR2Key: parsed.data.r2Key },
    })
  } catch (err) {
    return handleRouteError(err)
  }
}