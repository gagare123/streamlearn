import { NextResponse } from 'next/server'
import { db, auditLogs, users } from '@db/index'
import { eq, ilike, and, gte, lte, desc, count, sql } from 'drizzle-orm'
import { requireAdmin } from '@lib/rbac'
import { handleRouteError } from '@lib/errors'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request): Promise<NextResponse> {
  try {
    requireAdmin(request)

    const url      = new URL(request.url)
    const page     = Math.max(1, parseInt(url.searchParams.get('page')   ?? '1', 10))
    const limit    = Math.min(100, parseInt(url.searchParams.get('limit') ?? '50', 10))
    const offset   = (page - 1) * limit
    const action   = url.searchParams.get('action') ?? ''
    const actorId  = url.searchParams.get('actorId') ?? ''
    const from     = url.searchParams.get('from') ?? ''
    const to       = url.searchParams.get('to') ?? ''

    const conditions = []

    if (action)  conditions.push(ilike(auditLogs.action, `%${action}%`))
    if (actorId) conditions.push(eq(auditLogs.actorId, actorId))
    if (from)    conditions.push(gte(auditLogs.createdAt, new Date(from)))
    if (to)      conditions.push(lte(auditLogs.createdAt, new Date(to)))

    const where = conditions.length ? and(...conditions) : undefined

    const [logs, totalResult] = await Promise.all([
      db
        .select({
          id: auditLogs.id,
          action: auditLogs.action,
          targetType: auditLogs.targetType,
          targetId: auditLogs.targetId,
          ipAddress: auditLogs.ipAddress,
          metadata: auditLogs.metadata,
          createdAt: sql<string>`${auditLogs.createdAt}::text`,
          actorId: users.id,
          actorName: users.name,
          actorEmail: users.email,
          actorRole: users.role,
        })
        .from(auditLogs)
        .leftJoin(users, eq(auditLogs.actorId, users.id))
        .where(where)
        .orderBy(desc(auditLogs.createdAt))
        .limit(limit)
        .offset(offset),

      db
        .select({ total: count() })
        .from(auditLogs)
        .where(where),
    ])

    const total = totalResult[0]?.total ?? 0

    return NextResponse.json({
      success: true,
      data: {
        logs,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      },
    })
  } catch (err) {
    return handleRouteError(err)
  }
}