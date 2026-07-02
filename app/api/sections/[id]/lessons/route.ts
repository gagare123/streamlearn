import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db, courseSections, lessons } from '@db/index'
import { eq, sql } from 'drizzle-orm'
import { requireTutor, requireOwnerOrAdmin } from '@/lib/rbac'
import { writeAuditLog, auditMeta } from '@/lib/audit'
import { handleRouteError, Errors } from '@/lib/errors'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

const schema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().optional(),
})

export async function POST(request: Request, { params }: Params): Promise<NextResponse> {
  try {
    const identity = requireTutor(request)
    const { id: sectionId } = await params

    // Verify the section exists and the tutor owns the parent course
    const sectionData = await db.query.courseSections.findFirst({
      where: eq(courseSections.id, sectionId),
      with: {
        course: {
          columns: { tutorId: true },
        },
      },
    })

    if (!sectionData) throw Errors.notFound('Section')
    requireOwnerOrAdmin(identity, sectionData.course.tutorId)

    let body: unknown
    try { body = await request.json() } catch { throw Errors.badRequest('Invalid JSON') }

    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          fields: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      )
    }

    // Compute next position
    const [maxPos] = await db
      .select({ max: sql<number>`coalesce(max(${lessons.position}), 0)` })
      .from(lessons)
      .where(eq(lessons.sectionId, sectionId))

    const inserted = await db
      .insert(lessons)
      .values({
        sectionId,
        title: parsed.data.title,
        description: parsed.data.description ?? null,
        position: (maxPos?.max ?? 0) + 1,
      })
      .returning()

    const lesson = inserted[0]
    if (!lesson) throw new Error('Failed to create lesson')

    await writeAuditLog({
      actorId: identity.userId,
      action: 'lesson.created',
      targetType: 'lesson',
      targetId: lesson.id,
      ...auditMeta(request),
      metadata: { sectionId, title: parsed.data.title },
    })

    return NextResponse.json(
      { success: true, data: lesson },
      { status: 201 },
    )
  } catch (err) {
    return handleRouteError(err)
  }
}