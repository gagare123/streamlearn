import { NextResponse } from 'next/server'
import { db, notifications } from '@db/index'
import { eq, and } from 'drizzle-orm'
import { requireIdentity } from '@lib/rbac'
import { handleRouteError, Errors } from '@lib/errors'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

// PATCH /api/notifications/[id] — mark single notification as read
export async function PATCH(request: Request, { params }: Params): Promise<NextResponse> {
  try {
    const identity = requireIdentity(request)
    const { id } = await params

    const [notification] = await db
      .select({ id: notifications.id, userId: notifications.userId })
      .from(notifications)
      .where(eq(notifications.id, id))
      .limit(1)

    if (!notification) throw Errors.notFound('Notification')
    if (notification.userId !== identity.userId) throw Errors.forbidden('Not your notification')

    await db
      .update(notifications)
      .set({ isRead: true, readAt: new Date(), updatedAt: new Date() })
      .where(and(eq(notifications.id, id), eq(notifications.userId, identity.userId)))

    return NextResponse.json({ success: true, data: { message: 'Marked as read' } })
  } catch (err) {
    return handleRouteError(err)
  }
}