import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db, lessonProgress, lessons, courseSections, enrollments } from '@db/index'
import { eq, and } from 'drizzle-orm'
import { requireIdentity } from '@/lib/rbac'
import { writeAuditLog, auditMeta } from '@/lib/audit'
import { redis, RedisKeys } from '@/lib/redis'
import { handleRouteError, Errors } from '@/lib/errors'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  lessonId:       z.string().uuid('Invalid lesson ID'),
  watchedSeconds: z.number().int().min(0).max(86400),
  isCompleted:    z.boolean().optional(),
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/progress
//
// Upsert lesson watch progress for the authenticated student.
// Called by the Mux player every ~10 seconds and on pause/seek/end.
//
// Guards:
//   - STUDENT only
//   - Student must be enrolled in the course containing the lesson
//   - Lesson must be READY (has a playback ID)
//
// Auto-completes when watchedSeconds >= 90% of lesson duration.
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const identity = requireIdentity(request)

    if (identity.role !== 'STUDENT') {
      throw Errors.forbidden('Only students can track progress')
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

    const { lessonId, watchedSeconds, isCompleted: clientCompleted } = parsed.data

    // ── Fetch lesson + course info ─────────────────────────────────────────
    const [lessonRow] = await db
      .select({
        id: lessons.id,
        durationSeconds: lessons.durationSeconds,
        muxAssetStatus: lessons.muxAssetStatus,
        isFreePreview: lessons.isFreePreview,
        courseId: courseSections.courseId,
      })
      .from(lessons)
      .innerJoin(courseSections, eq(lessons.sectionId, courseSections.id))
      .where(eq(lessons.id, lessonId))
      .limit(1)

    if (!lessonRow) throw Errors.notFound('Lesson')

    if (lessonRow.muxAssetStatus !== 'READY') {
      throw Errors.badRequest('Lesson video is not yet ready')
    }

    // ── Verify enrollment (unless free preview) ───────────────────────────
    if (!lessonRow.isFreePreview) {
      const [enrollment] = await db
        .select({ id: enrollments.id })
        .from(enrollments)
        .where(
          and(
            eq(enrollments.studentId, identity.userId),
            eq(enrollments.courseId, lessonRow.courseId),
          ),
        )
        .limit(1)

      if (!enrollment) {
        throw Errors.forbidden('You must be enrolled to track progress')
      }
    }

    // ── Calculate completion ───────────────────────────────────────────────
    // Auto-complete at 90% of lesson duration, or use client flag
    const duration = lessonRow.durationSeconds ?? 0
    const autoCompleted = duration > 0 && watchedSeconds >= duration * 0.9
    const isCompleted = clientCompleted ?? autoCompleted

    // ── Upsert progress (high-water mark for watchedSeconds) ──────────────
    const now = new Date()
    const existingRows = await db
      .select({ id: lessonProgress.id, watchedSeconds: lessonProgress.watchedSeconds, isCompleted: lessonProgress.isCompleted })
      .from(lessonProgress)
      .where(
        and(
          eq(lessonProgress.studentId, identity.userId),
          eq(lessonProgress.lessonId, lessonId),
        ),
      )
      .limit(1)

    const existing = existingRows[0]

    // Only update if new progress is greater (high-water mark)
    const newWatchedSeconds = existing
      ? Math.max(existing.watchedSeconds, watchedSeconds)
      : watchedSeconds
    const newIsCompleted = existing?.isCompleted || isCompleted

    if (existing) {
      await db
        .update(lessonProgress)
        .set({
          watchedSeconds: newWatchedSeconds,
          isCompleted: newIsCompleted,
          completedAt: newIsCompleted && !existing.isCompleted ? now : undefined,
          updatedAt: now,
        })
        .where(eq(lessonProgress.id, existing.id))
    } else {
      await db.insert(lessonProgress).values({
        studentId: identity.userId,
        lessonId,
        watchedSeconds: newWatchedSeconds,
        isCompleted: newIsCompleted,
        completedAt: newIsCompleted ? now : null,
      })
    }

    // Invalidate enrollment cache so dashboard shows updated progress
    await redis.del(RedisKeys.studentEnrollmentsCache(identity.userId))

    // Audit only on first completion
    if (newIsCompleted && !existing?.isCompleted) {
      await writeAuditLog({
        actorId: identity.userId,
        action: 'lesson.progress_updated',
        targetType: 'lesson',
        targetId: lessonId,
        ...auditMeta(request),
        metadata: { courseId: lessonRow.courseId, watchedSeconds, isCompleted: true },
      })
    }

    return NextResponse.json({
      success: true,
      data: {
        watchedSeconds: newWatchedSeconds,
        isCompleted: newIsCompleted,
      },
    })
  } catch (err) {
    return handleRouteError(err)
  }
}