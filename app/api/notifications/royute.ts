import { NextResponse } from 'next/server'
import { db, notifications } from '@db/index'
import { eq, and, desc } from 'drizzle-orm'
import { requireIdentity } from '@lib/rbac'
import { handleRouteError } from '@lib/errors'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/notifications — list for the authenticated user
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const identity = requireIdentity(request)

    const rows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, identity.userId))
      .orderBy(desc(notifications.createdAt))
      .limit(50)

    return NextResponse.json({ success: true, data: { notifications: rows } })
  } catch (err) {
    return handleRouteError(err)
  }
}

// PATCH /api/notifications — mark all as read
export async function PATCH(request: Request): Promise<NextResponse> {
  try {
    const identity = requireIdentity(request)

    await db
      .update(notifications)
      .set({ isRead: true, readAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(notifications.userId, identity.userId),
          eq(notifications.isRead, false),
        ),
      )

    return NextResponse.json({ success: true, data: { message: 'All notifications marked as read' } })
  } catch (err) {
    return handleRouteError(err)
  }
}