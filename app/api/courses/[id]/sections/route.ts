import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db, courses, courseSections } from '@db/index'
import { eq, asc, max, sql } from 'drizzle-orm'
import { requireTutor, requireOwnerOrAdmin } from '@/lib/rbac'
import { handleRouteError, Errors } from '@/lib/errors'
import { redis, RedisKeys } from '@/lib/redis'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/courses/[id]/sections
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(_request: Request, { params }: Params): Promise<NextResponse> {
  try {
    const { id } = await params

    const sections = await db
      .select()
      .from(courseSections)
      .where(eq(courseSections.courseId, id))
      .orderBy(asc(courseSections.position))

    return NextResponse.json({ success: true, data: { sections } })
  } catch (err) {
    return handleRouteError(err)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/courses/[id]/sections — add a section
// ─────────────────────────────────────────────────────────────────────────────

const createSchema = z.object({
  title: z.string().trim().min(1, 'Section title is required').max(255),
})

export async function POST(request: Request, { params }: Params): Promise<NextResponse> {
  try {
    const identity = requireTutor(request)
    const { id } = await params

    const [course] = await db
      .select({ tutorId: courses.tutorId })
      .from(courses)
      .where(eq(courses.id, id))
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

    // Get the next position
    const [maxRow] = await db
      .select({ maxPos: max(courseSections.position) })
      .from(courseSections)
      .where(eq(courseSections.courseId, id))

    const nextPosition = (maxRow?.maxPos ?? -1) + 1

    const [section] = await db
      .insert(courseSections)
      .values({ courseId: id, title: parsed.data.title, position: nextPosition })
      .returning()

    await redis.del(RedisKeys.courseDetailCache(id))

    return NextResponse.json({ success: true, data: { section } }, { status: 201 })
  } catch (err) {
    return handleRouteError(err)
  }
}