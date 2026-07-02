import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db, quizzes, quizQuestions, courses } from '@db/index'
import { eq, asc, max } from 'drizzle-orm'
import { requireTutor, requireOwnerOrAdmin } from '@lib/rbac'
import { handleRouteError, Errors } from '@lib/errors'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

// GET /api/quizzes/[id]/questions
export async function GET(_req: Request, { params }: Params): Promise<NextResponse> {
  try {
    const { id } = await params
    const rows = await db
      .select()
      .from(quizQuestions)
      .where(eq(quizQuestions.quizId, id))
      .orderBy(asc(quizQuestions.position))

    return NextResponse.json({ success: true, data: { questions: rows } })
  } catch (err) {
    return handleRouteError(err)
  }
}

// POST /api/quizzes/[id]/questions
const createSchema = z.object({
  question: z.string().trim().min(5, 'Question must be at least 5 characters').max(2000),
  options: z
    .array(z.string().trim().min(1))
    .min(2, 'At least 2 options required')
    .max(6, 'Maximum 6 options'),
  correctIndex: z.number().int().min(0),
  explanation: z.string().trim().max(1000).optional(),
})

export async function POST(request: Request, { params }: Params): Promise<NextResponse> {
  try {
    const identity = requireTutor(request)
    const { id } = await params

    const [quiz] = await db
      .select({ courseId: quizzes.courseId, isPublished: quizzes.isPublished })
      .from(quizzes)
      .where(eq(quizzes.id, id))
      .limit(1)

    if (!quiz) throw Errors.notFound('Quiz')

    if (quiz.isPublished) {
      throw Errors.badRequest('Unpublish the quiz before adding questions')
    }

    const [course] = await db
      .select({ tutorId: courses.tutorId })
      .from(courses)
      .where(eq(courses.id, quiz.courseId))
      .limit(1)

    if (!course) throw Errors.notFound('Course')
    requireOwnerOrAdmin(identity, course.tutorId)

    let body: unknown
    try { body = await request.json() } catch { throw Errors.badRequest('Invalid JSON') }

    const parsed = createSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', code: 'VALIDATION_ERROR', fields: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }

    const { question, options, correctIndex, explanation } = parsed.data

    if (correctIndex >= options.length) {
      return NextResponse.json(
        { success: false, error: 'correctIndex must be within options array bounds', code: 'VALIDATION_ERROR' },
        { status: 400 },
      )
    }

    const [maxRow] = await db
      .select({ maxPos: max(quizQuestions.position) })
      .from(quizQuestions)
      .where(eq(quizQuestions.quizId, id))

    const nextPosition = (maxRow?.maxPos ?? -1) + 1

    const [newQuestion] = await db
      .insert(quizQuestions)
      .values({
        quizId: id,
        question,
        options,
        correctIndex,
        explanation: explanation ?? null,
        position: nextPosition,
      })
      .returning()

    return NextResponse.json({ success: true, data: { question: newQuestion } }, { status: 201 })
  } catch (err) {
    return handleRouteError(err)
  }
}