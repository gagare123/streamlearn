import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db, lessons, courseSections, courses } from '@db/index'
import { eq, sql } from 'drizzle-orm'
import { requireTutor, requireOwnerOrAdmin } from '@/lib/rbac'
import { writeAuditLog, auditMeta } from '@/lib/audit'
import { handleRouteError, Errors } from '@/lib/errors'
import { redis, RedisKeys } from '@/lib/redis'
import { deleteMuxAsset } from '@/lib/mux'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

// ─────────────────────────────────────────────────────────────────────────────
// Helper — fetch lesson + verify tutor ownership
// ─────────────────────────────────────────────────────────────────────────────

async function getLessonWithCourse(lessonId: string) {
  const [row] = await db
    .select({
      lesson: lessons,
      tutorId: courses.tutorId,
      courseId: courses.id,
    })
    .from(lessons)
    .innerJoin(courseSections, eq(lessons.sectionId, courseSections.id))
    .innerJoin(courses, eq(courseSections.courseId, courses.id))
    .where(eq(lessons.id, lessonId))
    .limit(1)

  return row ?? null
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/lessons/[id]
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(_request: Request, { params }: Params): Promise<NextResponse> {
  try {
    const { id } = await params
    const row = await getLessonWithCourse(id)
    if (!row) throw Errors.notFound('Lesson')

    return NextResponse.json({ success: true, data: { lesson: row.lesson } })
  } catch (err) {
    return handleRouteError(err)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/lessons/[id]
// ─────────────────────────────────────────────────────────────────────────────

const patchSchema = z.object({
  title: z.string().trim().min(1).max(255).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  isFreePreview: z.boolean().optional(),
  position: z.number().int().min(0).optional(),
})

export async function PATCH(request: Request, { params }: Params): Promise<NextResponse> {
  try {
    const identity = requireTutor(request)
    const { id } = await params

    const row = await getLessonWithCourse(id)
    if (!row) throw Errors.notFound('Lesson')

    requireOwnerOrAdmin(identity, row.tutorId)

    let body: unknown
    try { body = await request.json() } catch { throw Errors.badRequest('Invalid JSON') }

    const parsed = patchSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', code: 'VALIDATION_ERROR', fields: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }

    const updateData: Record<string, unknown> = { updatedAt: new Date() }
    const d = parsed.data
    if (d.title !== undefined) updateData['title'] = d.title
    if (d.description !== undefined) updateData['description'] = d.description
    if (d.isFreePreview !== undefined) updateData['isFreePreview'] = d.isFreePreview
    if (d.position !== undefined) updateData['position'] = d.position

    const [updated] = await db
      .update(lessons)
      .set(updateData)
      .where(eq(lessons.id, id))
      .returning()

    await redis.del(RedisKeys.courseDetailCache(row.courseId))

    await writeAuditLog({
      actorId: identity.userId,
      action: 'lesson.updated',
      targetType: 'lesson',
      targetId: id,
      ...auditMeta(request),
      metadata: { fields: Object.keys(d) },
    })

    return NextResponse.json({ success: true, data: { lesson: updated } })
  } catch (err) {
    return handleRouteError(err)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/lessons/[id]
// ─────────────────────────────────────────────────────────────────────────────

export async function DELETE(request: Request, { params }: Params): Promise<NextResponse> {
  try {
    const identity = requireTutor(request)
    const { id } = await params

    const row = await getLessonWithCourse(id)
    if (!row) throw Errors.notFound('Lesson')

    requireOwnerOrAdmin(identity, row.tutorId)

    // Delete Mux asset if it exists
    if (row.lesson.muxAssetId) {
      await deleteMuxAsset(row.lesson.muxAssetId).catch((err) =>
        console.error('[lessons] Failed to delete Mux asset:', err),
      )
    }

    await db.delete(lessons).where(eq(lessons.id, id))

    // Decrement total_lessons on the course
    await db.execute(
      sql`UPDATE courses SET total_lessons = GREATEST(0, total_lessons - 1), updated_at = NOW()
          WHERE id = ${row.courseId}`,
    )

    await redis.del(RedisKeys.courseDetailCache(row.courseId))

    await writeAuditLog({
      actorId: identity.userId,
      action: 'lesson.deleted',
      targetType: 'lesson',
      targetId: id,
      ...auditMeta(request),
      metadata: { courseId: row.courseId },
    })

    return NextResponse.json({ success: true, data: { message: 'Lesson deleted' } })
  } catch (err) {
    return handleRouteError(err)
  }
}