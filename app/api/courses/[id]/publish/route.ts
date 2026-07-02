import { NextResponse } from 'next/server'
import { db, courses } from '@db/index'
import { eq } from 'drizzle-orm'
import { requireTutor, requireOwnerOrAdmin } from '@/lib/rbac'
import { writeAuditLog, auditMeta } from '@/lib/audit'
import { handleRouteError, Errors } from '@/lib/errors'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export async function PATCH(request: Request, { params }: Params): Promise<NextResponse> {
  try {
    const identity = requireTutor(request)
    const { id } = await params

    const [course] = await db
      .select({ id: courses.id, tutorId: courses.tutorId, status: courses.status })
      .from(courses)
      .where(eq(courses.id, id))
      .limit(1)

    if (!course) throw Errors.notFound('Course')
    requireOwnerOrAdmin(identity, course.tutorId)

    if (course.status !== 'DRAFT') {
      throw Errors.badRequest('Only draft courses can be published')
    }

    await db
      .update(courses)
      .set({ status: 'PUBLISHED', updatedAt: new Date() })
      .where(eq(courses.id, id))

    await writeAuditLog({
      actorId: identity.userId,
      action: 'course.published',
      targetType: 'course',
      targetId: id,
      ...auditMeta(request),
    })

    return NextResponse.json({ success: true, data: { status: 'PUBLISHED' } })
  } catch (err) {
    return handleRouteError(err)
  }
}