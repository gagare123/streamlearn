import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db, courses, courseSections, lessons, users } from '@db/index'
import { eq, asc } from 'drizzle-orm'
import { requireTutor, requireOwnerOrAdmin, getIdentityFromHeaders } from '@/lib/rbac'
import { writeAuditLog, auditMeta } from '@/lib/audit'
import { handleRouteError, Errors } from '@/lib/errors'
import { redis, RedisKeys } from '@/lib/redis'
import { deleteMuxAsset } from '@/lib/mux'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/courses/[id]
//
// Returns the full course with sections and lessons.
// Draft courses are only visible to the owner or ADMIN.
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(request: Request, { params }: Params): Promise<NextResponse> {
  try {
    const { id } = await params
    const identity = getIdentityFromHeaders(request)

    const [course] = await db
      .select({
        id: courses.id,
        title: courses.title,
        slug: courses.slug,
        description: courses.description,
        thumbnailR2Key: courses.thumbnailR2Key,
        priceKobo: courses.priceKobo,
        status: courses.status,
        level: courses.level,
        tags: courses.tags,
        totalLessons: courses.totalLessons,
        totalDurationSeconds: courses.totalDurationSeconds,
        totalEnrollments: courses.totalEnrollments,
        createdAt: courses.createdAt,
        updatedAt: courses.updatedAt,
        tutor: { id: users.id, name: users.name, bio: users.bio, avatarR2Key: users.avatarR2Key },
      })
      .from(courses)
      .innerJoin(users, eq(courses.tutorId, users.id))
      .where(eq(courses.id, id))
      .limit(1)

    if (!course) throw Errors.notFound('Course')

    // Draft courses — only owner or admin can view
    if (course.status !== 'PUBLISHED') {
      if (!identity) throw Errors.forbidden('This course is not yet published')
      if (identity.role !== 'ADMIN' && identity.userId !== course.tutor.id) {
        throw Errors.forbidden('This course is not yet published')
      }
    }

    // Fetch sections with lessons
    const sectionsWithLessons = await db
      .select({
        id: courseSections.id,
        title: courseSections.title,
        position: courseSections.position,
      })
      .from(courseSections)
      .where(eq(courseSections.courseId, id))
      .orderBy(asc(courseSections.position))

    const sectionIds = sectionsWithLessons.map((s) => s.id)

    const allLessons = sectionIds.length > 0
      ? await db
          .select({
            id: lessons.id,
            sectionId: lessons.sectionId,
            title: lessons.title,
            description: lessons.description,
            position: lessons.position,
            muxPlaybackId: lessons.muxPlaybackId,
            muxAssetStatus: lessons.muxAssetStatus,
            durationSeconds: lessons.durationSeconds,
            isFreePreview: lessons.isFreePreview,
          })
          .from(lessons)
          .where(eq(lessons.sectionId, sectionIds[0]!))
          // We'll gather all lessons below
          .orderBy(asc(lessons.position))
          .limit(0) // placeholder — replaced below
      : []

    // Gather lessons for all sections efficiently
    const lessonsBySection: Record<string, typeof allLessons> = {}
    if (sectionIds.length > 0) {
      for (const sectionId of sectionIds) {
        const sectionLessons = await db
          .select({
            id: lessons.id,
            sectionId: lessons.sectionId,
            title: lessons.title,
            description: lessons.description,
            position: lessons.position,
            muxPlaybackId: lessons.muxPlaybackId,
            muxAssetStatus: lessons.muxAssetStatus,
            durationSeconds: lessons.durationSeconds,
            isFreePreview: lessons.isFreePreview,
          })
          .from(lessons)
          .where(eq(lessons.sectionId, sectionId))
          .orderBy(asc(lessons.position))
        lessonsBySection[sectionId] = sectionLessons
      }
    }

    const curriculum = sectionsWithLessons.map((section) => ({
      ...section,
      lessons: lessonsBySection[section.id] ?? [],
    }))

    return NextResponse.json({
      success: true,
      data: { course: { ...course, curriculum } },
    })
  } catch (err) {
    return handleRouteError(err)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/courses/[id] — update course metadata or status
// ─────────────────────────────────────────────────────────────────────────────

const patchSchema = z.object({
  title: z.string().trim().min(5).max(255).optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  priceKobo: z.number().int().min(0).optional(),
  level: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED']).optional(),
  tags: z.array(z.string().trim().max(50)).max(10).optional(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
})

export async function PATCH(request: Request, { params }: Params): Promise<NextResponse> {
  try {
    const identity = requireTutor(request)
    const { id } = await params

    const [course] = await db
      .select({ id: courses.id, tutorId: courses.tutorId, status: courses.status, totalLessons: courses.totalLessons })
      .from(courses)
      .where(eq(courses.id, id))
      .limit(1)

    if (!course) throw Errors.notFound('Course')

    requireOwnerOrAdmin(identity, course.tutorId)

    let body: unknown
    try { body = await request.json() } catch { throw Errors.badRequest('Invalid JSON') }

    const parsed = patchSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', code: 'VALIDATION_ERROR', fields: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }

    const data = parsed.data

    // Publishing requirements
    if (data.status === 'PUBLISHED') {
      if (course.totalLessons < 1) {
        throw Errors.badRequest('A course must have at least one lesson before it can be published')
      }
    }

    const updateData: Record<string, unknown> = { updatedAt: new Date() }
    if (data.title !== undefined) updateData['title'] = data.title
    if (data.description !== undefined) updateData['description'] = data.description
    if (data.priceKobo !== undefined) updateData['priceKobo'] = data.priceKobo
    if (data.level !== undefined) updateData['level'] = data.level
    if (data.tags !== undefined) updateData['tags'] = data.tags
    if (data.status !== undefined) updateData['status'] = data.status

    const [updated] = await db
      .update(courses)
      .set(updateData)
      .where(eq(courses.id, id))
      .returning({ id: courses.id, title: courses.title, status: courses.status })

    // Invalidate caches
    await Promise.all([
      redis.del(RedisKeys.courseListCache()),
      redis.del(RedisKeys.courseDetailCache(id)),
    ])

    const auditAction = data.status === 'PUBLISHED'
      ? 'course.published'
      : data.status === 'ARCHIVED'
      ? 'course.archived'
      : 'course.updated'

    await writeAuditLog({
      actorId: identity.userId,
      action: auditAction,
      targetType: 'course',
      targetId: id,
      ...auditMeta(request),
      metadata: { changes: Object.keys(data) },
    })

    return NextResponse.json({ success: true, data: { course: updated } })
  } catch (err) {
    return handleRouteError(err)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/courses/[id]
// ─────────────────────────────────────────────────────────────────────────────

export async function DELETE(request: Request, { params }: Params): Promise<NextResponse> {
  try {
    const identity = requireTutor(request)
    const { id } = await params

    const [course] = await db
      .select({ id: courses.id, tutorId: courses.tutorId, status: courses.status })
      .from(courses)
      .where(eq(courses.id, id))
      .limit(1)

    if (!course) throw Errors.notFound('Course')
    requireOwnerOrAdmin(identity, course.tutorId)

    // Only allow deleting DRAFT courses (to protect enrolled students)
    if (course.status === 'PUBLISHED') {
      throw Errors.badRequest('Published courses cannot be deleted. Archive the course first.')
    }

    // Delete all Mux assets for lessons in this course
    const allLessons = await db
      .select({ muxAssetId: lessons.muxAssetId })
      .from(lessons)
      .innerJoin(courseSections, eq(lessons.sectionId, courseSections.id))
      .where(eq(courseSections.courseId, id))

    await Promise.allSettled(
      allLessons
        .filter((l) => l.muxAssetId)
        .map((l) => deleteMuxAsset(l.muxAssetId!)),
    )

    await db.delete(courses).where(eq(courses.id, id))

    await Promise.all([
      redis.del(RedisKeys.courseListCache()),
      redis.del(RedisKeys.courseDetailCache(id)),
    ])

    await writeAuditLog({
      actorId: identity.userId,
      action: 'course.deleted',
      targetType: 'course',
      targetId: id,
      ...auditMeta(request),
    })

    return NextResponse.json({ success: true, data: { message: 'Course deleted' } })
  } catch (err) {
    return handleRouteError(err)
  }
}