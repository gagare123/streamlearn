import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db, courses, courseSections, lessons } from '@db/index'
import { eq, asc, max } from 'drizzle-orm'
import { requireTutor, requireOwnerOrAdmin } from '@/lib/rbac'
import { writeAuditLog, auditMeta } from '@/lib/audit'
import { handleRouteError, Errors } from '@/lib/errors'
import { redis, RedisKeys } from '@/lib/redis'
import { createMuxDirectUpload } from '@/lib/mux'
import { env } from '@/lib/env'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string; sectionId: string }> }

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/courses/[id]/sections/[sectionId]/lessons
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(_request: Request, { params }: Params): Promise<NextResponse> {
  try {
    const { sectionId } = await params

    const rows = await db
      .select()
      .from(lessons)
      .where(eq(lessons.sectionId, sectionId))
      .orderBy(asc(lessons.position))

    return NextResponse.json({ success: true, data: { lessons: rows } })
  } catch (err) {
    return handleRouteError(err)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/courses/[id]/sections/[sectionId]/lessons
//
// Creates a lesson AND immediately creates a Mux Direct Upload.
// The tutor uploads the video directly to Mux from the browser.
// ─────────────────────────────────────────────────────────────────────────────

const createSchema = z.object({
  title: z.string().trim().min(1, 'Lesson title is required').max(255),
  description: z.string().trim().max(2000).optional(),
  isFreePreview: z.boolean().default(false),
})

export async function POST(request: Request, { params }: Params): Promise<NextResponse> {
  try {
    const identity = requireTutor(request)
    const { id: courseId, sectionId } = await params

    // Verify ownership
    const [course] = await db
      .select({ tutorId: courses.tutorId })
      .from(courses)
      .where(eq(courses.id, courseId))
      .limit(1)

    if (!course) throw Errors.notFound('Course')
    requireOwnerOrAdmin(identity, course.tutorId)

    const [section] = await db
      .select({ id: courseSections.id })
      .from(courseSections)
      .where(eq(courseSections.id, sectionId))
      .limit(1)

    if (!section) throw Errors.notFound('Section')

    let body: unknown
    try { body = await request.json() } catch { throw Errors.badRequest('Invalid JSON') }

    const parsed = createSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', code: 'VALIDATION_ERROR', fields: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }

    // Get next position
    const [maxRow] = await db
      .select({ maxPos: max(lessons.position) })
      .from(lessons)
      .where(eq(lessons.sectionId, sectionId))

    const nextPosition = (maxRow?.maxPos ?? -1) + 1

    // Create Mux Direct Upload
    const { uploadId, uploadUrl } = await createMuxDirectUpload(
      env.NEXT_PUBLIC_APP_URL,
    )

    // Create lesson record
    const [lesson] = await db
      .insert(lessons)
      .values({
        sectionId,
        title: parsed.data.title,
        description: parsed.data.description ?? null,
        position: nextPosition,
        isFreePreview: parsed.data.isFreePreview,
        muxUploadId: uploadId,
        muxAssetStatus: 'WAITING',
      })
      .returning()

    if (!lesson) throw Errors.internalError('Failed to create lesson')

    // Update course total lessons count
    await db
      .update(courses)
      .set({ totalLessons: (course as { tutorId: string } & { totalLessons?: number }).totalLessons ?? 0 })
      .where(eq(courses.id, courseId))

    // Simpler: increment with raw SQL
    await db.execute(
      `UPDATE courses SET total_lessons = total_lessons + 1, updated_at = NOW() WHERE id = '${courseId}'` as unknown as Parameters<typeof db.execute>[0],
    )

    await redis.del(RedisKeys.courseDetailCache(courseId))

    await writeAuditLog({
      actorId: identity.userId,
      action: 'lesson.upload_initiated',
      targetType: 'lesson',
      targetId: lesson.id,
      ...auditMeta(request),
      metadata: { courseId, sectionId, muxUploadId: uploadId },
    })

    return NextResponse.json(
      {
        success: true,
        data: {
          lesson,
          // Return the Mux upload URL so the client can upload the video
          muxUploadUrl: uploadUrl,
          muxUploadId: uploadId,
        },
      },
      { status: 201 },
    )
  } catch (err) {
    return handleRouteError(err)
  }
}