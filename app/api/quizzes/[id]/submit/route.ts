import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db, quizzes, quizQuestions, quizSubmissions } from '@db/index'
import { eq, and, desc } from 'drizzle-orm'
import { requireIdentity } from '@lib/rbac'
import { writeAuditLog, auditMeta } from '@lib/audit'
import { redis, RedisKeys, type NotificationJobPayload } from '@lib/redis'
import { handleRouteError, Errors } from '@lib/errors'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/quizzes/[id]/submit
//
// Grades a quiz submission.
//
// Security:
//   - Server verifies the deadline has not passed before accepting answers
//   - correctIndex values are NEVER sent to the client during the quiz
//   - Grading happens entirely server-side
//   - The most recent un-submitted attempt for this student is used
//
// Body: { submissionId: uuid, answers: { [questionId]: chosenIndex } }
//
// Returns: score (%), passed, per-question results with explanations
// ─────────────────────────────────────────────────────────────────────────────

const schema = z.object({
  submissionId: z.string().uuid('Invalid submission ID'),
  answers: z.record(z.string().uuid(), z.number().int().min(0)),
})

export async function POST(request: Request, { params }: Params): Promise<NextResponse> {
  try {
    const identity = requireIdentity(request)

    if (identity.role !== 'STUDENT') {
      throw Errors.forbidden('Only students can submit quizzes')
    }

    const { id: quizId } = await params

    let body: unknown
    try { body = await request.json() } catch { throw Errors.badRequest('Invalid JSON') }

    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', code: 'VALIDATION_ERROR', fields: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }

    const { submissionId, answers } = parsed.data

    // ── Fetch submission ───────────────────────────────────────────────────
    const [submission] = await db
      .select()
      .from(quizSubmissions)
      .where(
        and(
          eq(quizSubmissions.id, submissionId),
          eq(quizSubmissions.studentId, identity.userId),
          eq(quizSubmissions.quizId, quizId),
        ),
      )
      .limit(1)

    if (!submission) throw Errors.notFound('Quiz submission')

    if (submission.submittedAt) {
      throw Errors.badRequest('This attempt has already been submitted')
    }

    // ── Server-side deadline enforcement ─────────────────────────────────
    // This is the critical security check — even if the client sends answers
    // after the time limit, we reject them here.
    const now = new Date()
    if (submission.deadlineAt && now > submission.deadlineAt) {
      // Mark as submitted with whatever answers were provided (treat as timed-out)
      await db
        .update(quizSubmissions)
        .set({
          answers,
          submittedAt: now,
          score: 0,
          passed: false,
          updatedAt: now,
        })
        .where(eq(quizSubmissions.id, submissionId))

      await writeAuditLog({
        actorId: identity.userId,
        action: 'quiz.submission_rejected',
        targetType: 'quiz_submission',
        targetId: submissionId,
        ...auditMeta(request),
        metadata: { quizId, reason: 'deadline_passed', deadlineAt: submission.deadlineAt },
      })

      return NextResponse.json(
        {
          success: false,
          error: 'Time limit exceeded. Your submission has been recorded with 0 marks.',
          code: 'DEADLINE_PASSED',
          data: { score: 0, passed: false, timedOut: true },
        },
        { status: 422 },
      )
    }

    // ── Fetch quiz + questions ─────────────────────────────────────────────
    const [quiz] = await db
      .select({ passMark: quizzes.passMark, title: quizzes.title })
      .from(quizzes)
      .where(eq(quizzes.id, quizId))
      .limit(1)

    if (!quiz) throw Errors.notFound('Quiz')

    const questions = await db
      .select()
      .from(quizQuestions)
      .where(eq(quizQuestions.quizId, quizId))

    if (questions.length === 0) throw Errors.badRequest('Quiz has no questions')

    // ── Grade server-side ──────────────────────────────────────────────────
    let correct = 0
    const results = questions.map((q) => {
      const chosen = answers[q.id] ?? -1
      const isCorrect = chosen === q.correctIndex
      if (isCorrect) correct++

      return {
        questionId: q.id,
        question: q.question,
        options: q.options,
        chosenIndex: chosen,
        correctIndex: q.correctIndex, // revealed after submission
        isCorrect,
        explanation: q.explanation,
      }
    })

    const score = Math.round((correct / questions.length) * 100)
    const passed = score >= quiz.passMark

    // ── Persist result ─────────────────────────────────────────────────────
    await db
      .update(quizSubmissions)
      .set({
        answers,
        score,
        passed,
        submittedAt: now,
        updatedAt: now,
      })
      .where(eq(quizSubmissions.id, submissionId))

    // ── Queue notification ────────────────────────────────────────────────
    const notif: NotificationJobPayload = {
      type: 'notification',
      userId: identity.userId,
      notificationId: `quiz-result-${submissionId}`,
      title: passed ? `You passed: ${quiz.title}` : `Quiz result: ${quiz.title}`,
      body: `Score: ${score}% — ${passed ? 'Passed ✓' : `Minimum ${quiz.passMark}% required`}`,
      actionUrl: `/dashboard/student/quizzes/${quizId}`,
    }
    await redis.lpush(RedisKeys.notificationQueue(), JSON.stringify(notif))

    await writeAuditLog({
      actorId: identity.userId,
      action: 'quiz.submission_completed',
      targetType: 'quiz_submission',
      targetId: submissionId,
      ...auditMeta(request),
      metadata: { quizId, score, passed, correct, total: questions.length },
    })

    return NextResponse.json({
      success: true,
      data: {
        score,
        passed,
        correct,
        total: questions.length,
        passMark: quiz.passMark,
        results,
        submittedAt: now,
      },
    })
  } catch (err) {
    return handleRouteError(err)
  }
}