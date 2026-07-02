import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db, quizzes, quizQuestions, courses } from '@db/index'
import { eq, asc, count } from 'drizzle-orm'
import { requireTutor, requireOwnerOrAdmin, getIdentityFromHeaders } from '@lib/rbac'
import { writeAuditLog, auditMeta } from '@lib/audit'
import { handleRouteError, Errors } from '@lib/errors'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/quizzes/[id]
//
// For students: returns quiz metadata + questions (but NOT correctIndex).
// For tutors/admins: returns full quiz with correctIndex for editing.
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(request: Request, { params }: Params): Promise<NextResponse> {
  try {
    const identity = getIdentityFromHeaders(request)
    const { id } = await params

    const [quiz] = await db
      .select()
      .from(quizzes)
      .where(eq(quizzes.id, id))
      .limit(1)

    if (!quiz) throw Errors.notFound('Quiz')

    // Get course to check ownership
    const [course] = await db
      .select({ tutorId: courses.tutorId })
      .from(courses)
      .where(eq(courses.id, quiz.courseId))
      .limit(1)

    const isTutorOwner = identity && identity.role !== 'STUDENT' && course?.tutorId === identity.userId
    const isAdmin = identity?.role === 'ADMIN'
    const canSeeAnswers = isTutorOwner || isAdmin

    // Students can only see published quizzes
    if (!canSeeAnswers && !quiz.isPublished) {
      throw Errors.notFound('Quiz')
    }

    // Fetch questions
    const questionsRaw = await db
      .select()
      .from(quizQuestions)
      .where(eq(quizQuestions.quizId, id))
      .orderBy(asc(quizQuestions.position))

    // Strip correctIndex for students
    const questions = questionsRaw.map((q) => ({
      id: q.id,
      question: q.question,
      options: q.options,
      position: q.position,
      explanation: canSeeAnswers ? q.explanation : null,
      // NEVER expose correctIndex to students during an active quiz
      ...(canSeeAnswers ? { correctIndex: q.correctIndex } : {}),
    }))

    return NextResponse.json({
      success: true,
      data: { quiz: { ...quiz, questions } },
    })
  } catch (err) {
    return handleRouteError(err)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/quizzes/[id] — update quiz (publish / settings)
// ─────────────────────────────────────────────────────────────────────────────

const patchSchema = z.object({
  title: z.string().trim().min(3).max(255).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  timeLimitSeconds: z.number().int().min(60).max(10800).nullable().optional(),
  passMark: z.number().int().min(0).max(100).optional(),
  maxAttempts: z.number().int().min(1).max(10).optional(),
  isPublished: z.boolean().optional(),
})

export async function PATCH(request: Request, { params }: Params): Promise<NextResponse> {
  try {
    const identity = requireTutor(request)
    const { id } = await params

    const [quiz] = await db.select().from(quizzes).where(eq(quizzes.id, id)).limit(1)
    if (!quiz) throw Errors.notFound('Quiz')

    const [course] = await db
      .select({ tutorId: courses.tutorId })
      .from(courses)
      .where(eq(courses.id, quiz.courseId))
      .limit(1)

    if (!course) throw Errors.notFound('Course')
    requireOwnerOrAdmin(identity, course.tutorId)

    let body: unknown
    try { body = await request.json() } catch { throw Errors.badRequest('Invalid JSON') }

    const parsed = patchSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', fields: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }

        // Publishing guard: must have at least 1 question
    if (parsed.data.isPublished === true) {
      const [result] = await db
        .select({ total: count() })
        .from(quizQuestions)
        .where(eq(quizQuestions.quizId, id))

      const total = result?.total ?? 0

      if (total < 1) {
        throw Errors.badRequest('A quiz must have at least one question before it can be published')
      }
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() }
    const d = parsed.data
    if (d.title !== undefined) updates['title'] = d.title
    if (d.description !== undefined) updates['description'] = d.description
    if (d.timeLimitSeconds !== undefined) updates['timeLimitSeconds'] = d.timeLimitSeconds
    if (d.passMark !== undefined) updates['passMark'] = d.passMark
    if (d.maxAttempts !== undefined) updates['maxAttempts'] = d.maxAttempts
    if (d.isPublished !== undefined) updates['isPublished'] = d.isPublished

    const [updated] = await db
      .update(quizzes)
      .set(updates)
      .where(eq(quizzes.id, id))
      .returning()

    const action = d.isPublished === true ? 'quiz.published' : 'quiz.updated'
    await writeAuditLog({
      actorId: identity.userId,
      action,
      targetType: 'quiz',
      targetId: id,
      ...auditMeta(request),
      metadata: { changes: Object.keys(d) },
    })

    return NextResponse.json({ success: true, data: { quiz: updated } })
  } catch (err) {
    return handleRouteError(err)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/quizzes/[id]
// ─────────────────────────────────────────────────────────────────────────────

export async function DELETE(request: Request, { params }: Params): Promise<NextResponse> {
  try {
    const identity = requireTutor(request)
    const { id } = await params

    const [quiz] = await db.select().from(quizzes).where(eq(quizzes.id, id)).limit(1)
    if (!quiz) throw Errors.notFound('Quiz')

    const [course] = await db
      .select({ tutorId: courses.tutorId })
      .from(courses)
      .where(eq(courses.id, quiz.courseId))
      .limit(1)

    if (!course) throw Errors.notFound('Course')
    requireOwnerOrAdmin(identity, course.tutorId)

    if (quiz.isPublished) {
      throw Errors.badRequest('Unpublish the quiz before deleting it')
    }

    await db.delete(quizzes).where(eq(quizzes.id, id))

    await writeAuditLog({
      actorId: identity.userId,
      action: 'quiz.deleted',
      targetType: 'quiz',
      targetId: id,
      ...auditMeta(request),
    })

    return NextResponse.json({ success: true, data: { message: 'Quiz deleted' } })
  } catch (err) {
    return handleRouteError(err)
  }
}