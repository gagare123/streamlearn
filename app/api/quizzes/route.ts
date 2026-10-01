import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db, quizzes, courses, enrollments } from '@db/index'
import { eq, and, inArray, desc } from 'drizzle-orm'
import { requireTutor, requireOwnerOrAdmin, getIdentityFromHeaders } from '@lib/rbac'
import { requireRole } from '@/lib/auth'
import { writeAuditLog, auditMeta } from '@lib/audit'
import { handleRouteError, Errors } from '@lib/errors'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/quizzes
//
// Case 1: No courseId + STUDENT
//   → Return all published quizzes from the student's enrolled courses.
//
// Case 2: courseId provided + STUDENT
//   → Return published quizzes for that course (must be enrolled).
//
// Case 3: courseId provided + TUTOR/ADMIN
//   → Return all quizzes for that course (must own it or be admin).
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const url = new URL(request.url)
    const courseId = url.searchParams.get('courseId')

    // ── Case 1: Student dashboard — list quizzes across enrollments ──────
    if (!courseId) {
      const identity = await requireRole(request, 'STUDENT', 'TUTOR', 'ADMIN')

      if (identity.role === 'STUDENT') {
        // Get enrolled course IDs
        const enrolledRows = await db
          .select({ courseId: enrollments.courseId })
          .from(enrollments)
          .where(eq(enrollments.studentId, identity.sub!))

        const enrolledIds = enrolledRows.map((r) => r.courseId)

        if (enrolledIds.length === 0) {
          return NextResponse.json({ success: true, data: { quizzes: [] } })
        }

        const rows = await db
          .select({
            id: quizzes.id,
            title: quizzes.title,
            description: quizzes.description,
            courseId: quizzes.courseId,
            timeLimitSeconds: quizzes.timeLimitSeconds,
            passMark: quizzes.passMark,
            maxAttempts: quizzes.maxAttempts,
            isPublished: quizzes.isPublished,
            courseTitle: courses.title,
          })
          .from(quizzes)
          .innerJoin(courses, eq(quizzes.courseId, courses.id))
          .where(and(
            inArray(quizzes.courseId, enrolledIds),
            eq(quizzes.isPublished, true),
          ))
          .orderBy(desc(quizzes.createdAt))

        return NextResponse.json({ success: true, data: { quizzes: rows } })
      }

      // Tutors/Admins without courseId — return quizzes from their courses
      if (identity.role === 'TUTOR') {
        const ownedCourseRows = await db
          .select({ id: courses.id })
          .from(courses)
          .where(eq(courses.tutorId, identity.sub!))

        const ownedIds = ownedCourseRows.map((r) => r.id)
        if (ownedIds.length === 0) {
          return NextResponse.json({ success: true, data: { quizzes: [] } })
        }

        const rows = await db
          .select({
            id: quizzes.id,
            title: quizzes.title,
            description: quizzes.description,
            courseId: quizzes.courseId,
            timeLimitSeconds: quizzes.timeLimitSeconds,
            passMark: quizzes.passMark,
            maxAttempts: quizzes.maxAttempts,
            isPublished: quizzes.isPublished,
            courseTitle: courses.title,
          })
          .from(quizzes)
          .innerJoin(courses, eq(quizzes.courseId, courses.id))
          .where(inArray(quizzes.courseId, ownedIds))
          .orderBy(desc(quizzes.createdAt))

        return NextResponse.json({ success: true, data: { quizzes: rows } })
      }

      // Admin — return all
      const rows = await db
        .select({
          id: quizzes.id,
          title: quizzes.title,
          description: quizzes.description,
          courseId: quizzes.courseId,
          timeLimitSeconds: quizzes.timeLimitSeconds,
          passMark: quizzes.passMark,
          maxAttempts: quizzes.maxAttempts,
          isPublished: quizzes.isPublished,
          courseTitle: courses.title,
        })
        .from(quizzes)
        .innerJoin(courses, eq(quizzes.courseId, courses.id))
        .orderBy(desc(quizzes.createdAt))
        .limit(100)

      return NextResponse.json({ success: true, data: { quizzes: rows } })
    }

    // ── Case 2/3: courseId provided ────────────────────────────────────────
    const identity = getIdentityFromHeaders(request)

    const [course] = await db
      .select({ tutorId: courses.tutorId, status: courses.status })
      .from(courses)
      .where(eq(courses.id, courseId))
      .limit(1)

    if (!course) throw Errors.notFound('Course')

    const conditions = [eq(quizzes.courseId, courseId)]

    if (!identity || identity.role === 'STUDENT') {
      conditions.push(eq(quizzes.isPublished, true))

      if (identity) {
        const [enrollment] = await db
          .select({ id: enrollments.id })
          .from(enrollments)
          .where(and(eq(enrollments.studentId, identity.userId), eq(enrollments.courseId, courseId)))
          .limit(1)

        if (!enrollment) throw Errors.forbidden('You must be enrolled to access quizzes')
      }
    } else if (identity.role === 'TUTOR' && identity.userId !== course.tutorId) {
      throw Errors.forbidden('You do not own this course')
    }

    const rows = await db
      .select({
        id: quizzes.id,
        title: quizzes.title,
        description: quizzes.description,
        courseId: quizzes.courseId,
        timeLimitSeconds: quizzes.timeLimitSeconds,
        passMark: quizzes.passMark,
        maxAttempts: quizzes.maxAttempts,
        isPublished: quizzes.isPublished,
        createdAt: quizzes.createdAt,
      })
      .from(quizzes)
      .where(and(...conditions))
      .orderBy(desc(quizzes.createdAt))

    return NextResponse.json({ success: true, data: { quizzes: rows } })
  } catch (err) {
    return handleRouteError(err)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/quizzes — create a new quiz (TUTOR/ADMIN only)
// ─────────────────────────────────────────────────────────────────────────────

const createSchema = z.object({
  courseId: z.string().uuid(),
  title: z.string().trim().min(3).max(255),
  description: z.string().trim().max(2000).optional(),
  timeLimitSeconds: z.number().int().min(60).max(10800).nullable().optional(),
  passMark: z.number().int().min(0).max(100).optional(),
  maxAttempts: z.number().int().min(1).max(10).optional(),
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
        passMark: passMark ?? 70,
        maxAttempts: maxAttempts ?? 3,
      })
      .returning()

    await writeAuditLog({
      actorId: identity.userId,
      action: 'quiz.created',
      targetType: 'quiz',
      targetId: quiz.id,
      ...auditMeta(request),
      metadata: { courseId, title },
    })

    return NextResponse.json({ success: true, data: { quiz } }, { status: 201 })
  } catch (err) {
    return handleRouteError(err)
  }
}