import { NextResponse } from 'next/server'
import { db, users, sessions, enrollments, payments, auditLogs } from '@db/index'
import { eq, desc, count, sum } from 'drizzle-orm'
import { requireAdmin } from '@lib/rbac'
import { handleRouteError, Errors } from '@lib/errors'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export async function GET(request: Request, { params }: Params): Promise<NextResponse> {
  try {
    requireAdmin(request)
    const { id } = await params

    const [userResult, sessionResult, enrollResult, spendResult, auditResult] = await Promise.all([
      db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          role: users.role,
          emailVerified: users.emailVerified,
          isActive: users.isActive,
          bio: users.bio,
          avatarR2Key: users.avatarR2Key,
          createdAt: users.createdAt,
          updatedAt: users.updatedAt,
          lastLoginAt: users.lastLoginAt,
        })
        .from(users)
        .where(eq(users.id, id))
        .limit(1),

      db
        .select({
          id: sessions.id,
          ipAddress: sessions.ipAddress,
          userAgent: sessions.userAgent,
          createdAt: sessions.createdAt,
          expiresAt: sessions.expiresAt,
        })
        .from(sessions)
        .where(eq(sessions.userId, id))
        .orderBy(desc(sessions.createdAt))
        .limit(10),

      db
        .select({ cnt: count() })
        .from(enrollments)
        .where(eq(enrollments.studentId, id)),

      db
        .select({ total: sum(payments.amountKobo) })
        .from(payments)
        .where(eq(payments.studentId, id)),

      db
        .select({
          action: auditLogs.action,
          ipAddress: auditLogs.ipAddress,
          createdAt: auditLogs.createdAt,
        })
        .from(auditLogs)
        .where(eq(auditLogs.actorId, id))
        .orderBy(desc(auditLogs.createdAt))
        .limit(10),
    ])

    const user = userResult[0]
    if (!user) throw Errors.notFound('User')

    return NextResponse.json({
      success: true,
      data: {
        user,
        stats: {
          enrollments: enrollResult[0]?.cnt ?? 0,
          totalSpendKobo: Number(spendResult[0]?.total ?? 0),
        },
        activeSessions: sessionResult,
        recentActivity: auditResult,
      },
    })
  } catch (err) {
    return handleRouteError(err)
  }
}