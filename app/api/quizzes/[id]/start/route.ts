import { NextResponse } from 'next/server'
import { db, quizzes, quizSubmissions, enrollments, courses } from '@db/index'
import { eq, and, count } from 'drizzle-orm'
import { requireIdentity } from '@lib/rbac'
import { handleRouteError, Errors } from '@lib/errors'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/quizzes/[id]/start
//
// Begins a quiz attempt for the authenticated student.
//
// Guards:
//   - STUDENT only
//   - Quiz must be published
//   - Student must be enrolled in the course
//   - Student must not have exceeded maxAttempts
//
// Creates a quiz_submission record with:
//   - startedAt: now
//   - deadlineAt: startedAt + timeLimitSeconds (if quiz has a time limit)
//   - answers: {} (empty — filled on submit)
//   - attemptNumber: next attempt
//
// Returns quiz questions WITHOUT correctIndex (security).
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(request: Request, { params }: Params): Promise<NextResponse> {
  try {
    const identity = requireIdentity(request)

    if (identity.role !== 'STUDENT') {
      throw Errors.forbidden('Only students can start quizzes')
    }

    const { id } = await params

    // ── Fetch quiz ────────────────────────────────────────────────────────
    const [quiz] = await db
      .select()
      .from(quizzes)
      .where(eq(quizzes.id, id))
      .limit(1)

    if (!quiz || !quiz.isPublished) throw Errors.notFound('Quiz')

    // ── Verify enrollment ─────────────────────────────────────────────────
    const [enrollment] = await db
      .select({ id: enrollments.id })
      .from(enrollments)
      .where(
        and(
          eq(enrollments.studentId, identity.userId),
          eq(enrollments.courseId, quiz.courseId),
        ),
      )
      .limit(1)

    if (!enrollment) {
      throw Errors.forbidden('You must be enrolled in this course to take this quiz')
    }

    // ── Check attempt count ───────────────────────────────────────────────
    const [attemptResult] = await db
      .select({ total: count() })
      .from(quizSubmissions)
      .where(
        and(
          eq(quizSubmissions.studentId, identity.userId),
          eq(quizSubmissions.quizId, id),
        ),
      )

    const attemptsMade = attemptResult?.total ?? 0

    if (attemptsMade >= quiz.maxAttempts) {
      throw Errors.badRequest(
        `You have used all ${quiz.maxAttempts} attempt${quiz.maxAttempts !== 1 ? 's' : ''} for this quiz`,
      )
    }
    // ── Create submission ─────────────────────────────────────────────────
    const now = new Date()
    const deadlineAt = quiz.timeLimitSeconds
      ? new Date(now.getTime() + quiz.timeLimitSeconds * 1000)
      : null

    const [submission] = await db
      .insert(quizSubmissions)
      .values({
        studentId: identity.userId,
        quizId: id,
        answers: {},
        score: 0,
        passed: false,
        startedAt: now,
        deadlineAt,
        attemptNumber: (attemptsMade ?? 0) + 1,
      })
      .returning({
        id: quizSubmissions.id,
        startedAt: quizSubmissions.startedAt,
        deadlineAt: quizSubmissions.deadlineAt,
        attemptNumber: quizSubmissions.attemptNumber,
      })

    return NextResponse.json({
      success: true,
      data: {
        submission,
        quiz: {
          id: quiz.id,
          title: quiz.title,
          timeLimitSeconds: quiz.timeLimitSeconds,
          passMark: quiz.passMark,
          totalQuestions: 0, // filled by client from /api/quizzes/[id]
        },
      },
    }, { status: 201 })
  } catch (err) {
    return handleRouteError(err)
  }
}