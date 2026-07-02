import { NextResponse } from 'next/server'
import { db, enrollments, courses, users, lessonProgress, lessons, courseSections } from '@db/index'
import { eq, and, count, desc } from 'drizzle-orm'
import { requireIdentity } from '@/lib/rbac'
import { redis, RedisKeys, RedisTTL } from '@/lib/redis'
import { handleRouteError } from '@/lib/errors'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/enrollments
//
// Returns all enrollments for the authenticated student,
// each with course details and progress percentage.
// Results are cached per student for 5 minutes.
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const identity = requireIdentity(request)

    // Only students can list their own enrollments
    // (tutors/admins use a different endpoint)
    if (identity.role !== 'STUDENT') {
      return NextResponse.json({
        success: true,
        data: { enrollments: [] },
      })
    }

    // ── Cache check ────────────────────────────────────────────────────────
    const cacheKey = RedisKeys.studentEnrollmentsCache(identity.userId)
    const cached = await redis.get<string>(cacheKey)
    if (cached) {
      const parsed = typeof cached === 'string' ? JSON.parse(cached) : cached
      return NextResponse.json({ success: true, data: parsed, cached: true })
    }

    // ── Fetch enrollments with course + tutor ──────────────────────────────
    const rows = await db
      .select({
        enrollment: {
          id: enrollments.id,
          status: enrollments.status,
          completedAt: enrollments.completedAt,
          createdAt: enrollments.createdAt,
        },
        course: {
          id: courses.id,
          title: courses.title,
          slug: courses.slug,
          thumbnailR2Key: courses.thumbnailR2Key,
          totalLessons: courses.totalLessons,
          totalDurationSeconds: courses.totalDurationSeconds,
          level: courses.level,
          priceKobo: courses.priceKobo,
        },
        tutor: {
          id: users.id,
          name: users.name,
        },
      })
      .from(enrollments)
      .innerJoin(courses, eq(enrollments.courseId, courses.id))
      .innerJoin(users, eq(courses.tutorId, users.id))
      .where(
        and(
          eq(enrollments.studentId, identity.userId),
          eq(enrollments.status, 'ACTIVE'),
        ),
      )
      .orderBy(desc(enrollments.createdAt))

    // ── Compute progress for each course ──────────────────────────────────
    const enriched = await Promise.all(
      rows.map(async (row) => {
        // Count completed lessons for this student in this course
        const [completedRow] = await db
          .select({ completed: count() })
          .from(lessonProgress)
          .innerJoin(lessons, eq(lessonProgress.lessonId, lessons.id))
          .innerJoin(courseSections, eq(lessons.sectionId, courseSections.id))
          .where(
            and(
              eq(lessonProgress.studentId, identity.userId),
              eq(courseSections.courseId, row.course.id),
              eq(lessonProgress.isCompleted, true),
            ),
          )

        const completedLessons = completedRow?.completed ?? 0
        const totalLessons = row.course.totalLessons
        const progressPct =
          totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0

        return {
          ...row.enrollment,
          course: row.course,
          tutor: row.tutor,
          progress: {
            completedLessons,
            totalLessons,
            percentComplete: progressPct,
          },
        }
      }),
    )

    const data = { enrollments: enriched }

    // Cache for 5 minutes
    await redis.set(cacheKey, JSON.stringify(data), { ex: RedisTTL.ENROLLMENT_CACHE })

    return NextResponse.json({ success: true, data })
  } catch (err) {
    return handleRouteError(err)
  }
}