import { NextResponse } from 'next/server'
import { db, enrollments, courses, courseSections, lessons, lessonProgress } from '@db/index'
import { eq, and, asc } from 'drizzle-orm'
import { requireIdentity, requireOwnerOrAdmin } from '@/lib/rbac'
import { handleRouteError, Errors } from '@/lib/errors'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/enrollments/[id]
//
// Returns enrollment detail with full curriculum + per-lesson progress.
// Only the enrolled student or an ADMIN may access.
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(request: Request, { params }: Params): Promise<NextResponse> {
  try {
    const identity = requireIdentity(request)
    const { id } = await params

    // Fetch enrollment
    const [enrollment] = await db
      .select({
        id: enrollments.id,
        studentId: enrollments.studentId,
        courseId: enrollments.courseId,
        status: enrollments.status,
        completedAt: enrollments.completedAt,
        createdAt: enrollments.createdAt,
      })
      .from(enrollments)
      .where(eq(enrollments.id, id))
      .limit(1)

    if (!enrollment) throw Errors.notFound('Enrollment')

    // Ownership check — only the student or ADMIN
    requireOwnerOrAdmin(identity, enrollment.studentId)

    // Fetch course with sections and lessons
    const [course] = await db
      .select({
        id: courses.id,
        title: courses.title,
        slug: courses.slug,
        totalLessons: courses.totalLessons,
        totalDurationSeconds: courses.totalDurationSeconds,
      })
      .from(courses)
      .where(eq(courses.id, enrollment.courseId))
      .limit(1)

    if (!course) throw Errors.notFound('Course')

    const sections = await db
      .select()
      .from(courseSections)
      .where(eq(courseSections.courseId, enrollment.courseId))
      .orderBy(asc(courseSections.position))

    // Fetch all lessons and progress in parallel
    const [allLessons, allProgress] = await Promise.all([
      sections.length > 0
        ? db
            .select({
              id: lessons.id,
              sectionId: lessons.sectionId,
              title: lessons.title,
              position: lessons.position,
              muxPlaybackId: lessons.muxPlaybackId,
              muxAssetStatus: lessons.muxAssetStatus,
              durationSeconds: lessons.durationSeconds,
              isFreePreview: lessons.isFreePreview,
            })
            .from(lessons)
            .where(eq(lessons.sectionId, sections[0]!.id)) // placeholder
            .limit(0) // we fetch per section below
        : Promise.resolve([]),

      db
        .select({
          lessonId: lessonProgress.lessonId,
          watchedSeconds: lessonProgress.watchedSeconds,
          isCompleted: lessonProgress.isCompleted,
        })
        .from(lessonProgress)
        .where(eq(lessonProgress.studentId, enrollment.studentId)),
    ])

    const progressMap = new Map(
      allProgress.map((p) => [p.lessonId, p]),
    )

    // Build curriculum with progress
    const curriculum = await Promise.all(
      sections.map(async (section) => {
        const sectionLessons = await db
          .select({
            id: lessons.id,
            sectionId: lessons.sectionId,
            title: lessons.title,
            position: lessons.position,
            muxPlaybackId: lessons.muxPlaybackId,
            muxAssetStatus: lessons.muxAssetStatus,
            durationSeconds: lessons.durationSeconds,
            isFreePreview: lessons.isFreePreview,
          })
          .from(lessons)
          .where(eq(lessons.sectionId, section.id))
          .orderBy(asc(lessons.position))

        return {
          ...section,
          lessons: sectionLessons.map((lesson) => ({
            ...lesson,
            progress: progressMap.get(lesson.id) ?? {
              watchedSeconds: 0,
              isCompleted: false,
            },
          })),
        }
      }),
    )

    const totalCompleted = allProgress.filter((p) => p.isCompleted).length
    const progressPct =
      course.totalLessons > 0
        ? Math.round((totalCompleted / course.totalLessons) * 100)
        : 0

    return NextResponse.json({
      success: true,
      data: {
        enrollment: {
          ...enrollment,
          course,
          curriculum,
          progress: {
            completedLessons: totalCompleted,
            totalLessons: course.totalLessons,
            percentComplete: progressPct,
          },
        },
      },
    })
  } catch (err) {
    return handleRouteError(err)
  }
}