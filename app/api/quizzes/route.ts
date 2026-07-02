import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db, quizzes, courses, enrollments } from '@db/index'
import { eq, and } from 'drizzle-orm'
import { requireTutor, requireOwnerOrAdmin, getIdentityFromHeaders } from '@lib/rbac'
import { writeAuditLog, auditMeta } from '@lib/audit'
import { handleRouteError, Errors } from '@lib/errors'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/quizzes?courseId=...
//
// Returns quizzes for a course.
// Students only see published quizzes.
// Tutors/Admins see all quizzes for their own courses.
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const identity = getIdentityFromHeaders(request)
    const url = new URL(request.url)
    const courseId = url.searchParams.get('courseId')

    if (!courseId) throw Errors.badRequest('courseId query parameter is required')

    const [course] = await db
      .select({ tutorId: courses.tutorId, status: courses.status })
      .from(courses)
      .where(eq(courses.id, courseId))
      .limit(1)

    if (!course) throw Errors.notFound('Course')

    // Build conditions based on role
    const conditions = [eq(quizzes.courseId, courseId)]

    if (!identity || identity.role === 'STUDENT') {
      // Students only see published quizzes (and must be enrolled)
      conditions.push(eq(quizzes.isPublished, true))

      if (identity) {
        // Verify enrollment
        const [enrollment] = await db
          .select({ id: enrollments.id })
          .from(enrollments)
          .where(and(eq(enrollments.studentId, identity.userId), eq(enrollments.courseId, courseId)))
          .limit(1)

        if (!enrollment) throw Errors.forbidden('You must be enrolled to access quizzes')
      }
    } else if (identity.role === 'TUTOR' && identity.userId !== course.tutorId) {
      // Tutors can only see quizzes for their own courses
      throw Errors.forbidden('You do not own this course')
    }

    const rows = await db
      .select({
        id: quizzes.id,
        title: quizzes.title,
        description: quizzes.description,
        timeLimitSeconds: quizzes.timeLimitSeconds,
        passMark: quizzes.passMark,
        maxAttempts: quizzes.maxAttempts,
        isPublished: quizzes.isPublished,
        createdAt: quizzes.createdAt,
      })
      .from(quizzes)
      .where(and(...conditions))

    return NextResponse.json({ success: true, data: { quizzes: rows } })
  } catch (err) {
    return handleRouteError(err)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/quizzes — create a quiz (TUTOR/ADMIN)
// ─────────────────────────────────────────────────────────────────────────────

const createSchema = z.object({
  courseId: z.string().uuid('Invalid course ID'),
  title: z.string().trim().min(3, 'Title must be at least 3 characters').max(255),
  description: z.string().trim().max(2000).optional(),
  timeLimitSeconds: z.number().int().min(60).max(10800).nullable().optional(),
  passMark: z.number().int().min(0).max(100).default(70),
  maxAttempts: z.number().int().min(1).max(10).default(3),
})

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const identity = requireTutor(request)

    let body: unknown
    try { body = await request.json() } catch { throw Errors.badRequest('Invalid JSON') }

    const parsed = createSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', code: 'VALIDATION_ERROR', fields: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }

    const { courseId, title, description, timeLimitSeconds, passMark, maxAttempts } = parsed.data

    // Verify course ownership
    const [course] = await db
      .select({ tutorId: courses.tutorId })
      .from(courses)
      .where(eq(courses.id, courseId))
      .limit(1)

    if (!course) throw Errors.notFound('Course')
    requireOwnerOrAdmin(identity, course.tutorId)

    const [quiz] = await db
      .insert(quizzes)
      .values({
        courseId,
        title,
        description: description ?? null,
        timeLimitSeconds: timeLimitSeconds ?? null,
        passMark,
        maxAttempts,
        isPublished: false,
      })
      .returning()

    await writeAuditLog({
      actorId: identity.userId,
      action: 'quiz.created',
      targetType: 'quiz',
      targetId: quiz!.id,
      ...auditMeta(request),
      metadata: { courseId, title },
    })

    return NextResponse.json({ success: true, data: { quiz } }, { status: 201 })
  } catch (err) {
    return handleRouteError(err)
  }
}