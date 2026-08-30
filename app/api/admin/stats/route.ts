import { NextResponse } from 'next/server'
import { db } from '@db/index'
import { sql } from 'drizzle-orm'
import { requireAdmin } from '@lib/rbac'
import { handleRouteError } from '@lib/errors'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request): Promise<NextResponse> {
  try {
    requireAdmin(request)

    const now = new Date()
    const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const d7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

    const [
      userStats,
      courseStats,
      enrollmentStats,
      revenueRow,
      newThisMonth,
      newThisWeek,
      recentActivity,
      dailySignups,
      topCourses,
    ] = await Promise.all([
      db.execute(sql`SELECT role, COUNT(*)::int AS cnt FROM users GROUP BY role`),
      db.execute(sql`SELECT status, COUNT(*)::int AS cnt FROM courses GROUP BY status`),
      db.execute(sql`SELECT status, COUNT(*)::int AS cnt FROM enrollments GROUP BY status`),
      db.execute(sql`SELECT COALESCE(SUM(amount_kobo), 0)::bigint AS total FROM payments WHERE status = 'SUCCESS'`),
      db.execute(sql`SELECT COUNT(*)::int AS cnt FROM users WHERE created_at >= ${d30.toISOString()}`),
      db.execute(sql`SELECT COUNT(*)::int AS cnt FROM users WHERE created_at >= ${d7.toISOString()}`),
      db.execute(sql`
        SELECT al.id, al.action, al.created_at,
               u.name AS actor_name, u.email AS actor_email
        FROM audit_logs al
        LEFT JOIN users u ON al.actor_id = u.id
        ORDER BY al.created_at DESC
        LIMIT 15
      `),
      db.execute(sql`
        SELECT DATE(created_at) AS day, COUNT(*)::int AS cnt
        FROM users
        WHERE created_at >= NOW() - INTERVAL '14 days'
        GROUP BY DATE(created_at)
        ORDER BY day ASC
      `),
      db.execute(sql`
        SELECT c.id, c.title, c.total_enrollments,
               c.price_kobo, u.name AS tutor_name
        FROM courses c
        JOIN users u ON c.tutor_id = u.id
        WHERE c.status = 'PUBLISHED'
        ORDER BY c.total_enrollments DESC
        LIMIT 5
      `),
    ])

    // postgres-js returns rows directly (not .rows)
    const userRows = userStats as unknown as Array<{ role: string; cnt: number }>
    const userByRole: Record<string, number> = {}
    for (const row of userRows) if (row.role) userByRole[row.role] = Number(row.cnt)
    const totalUsers = Object.values(userByRole).reduce((a, b) => a + b, 0)

    const courseRows = courseStats as unknown as Array<{ status: string; cnt: number }>
    const courseByStatus: Record<string, number> = {}
    for (const row of courseRows) if (row.status) courseByStatus[row.status] = Number(row.cnt)
    const totalCourses = Object.values(courseByStatus).reduce((a, b) => a + b, 0)

    const enrollRows = enrollmentStats as unknown as Array<{ status: string; cnt: number }>
    const enrollByStatus: Record<string, number> = {}
    for (const row of enrollRows) if (row.status) enrollByStatus[row.status] = Number(row.cnt)
    const totalEnrollments = Object.values(enrollByStatus).reduce((a, b) => a + b, 0)

    const revenueTotal = Number((revenueRow as unknown as Array<{ total: number }>)[0]?.total ?? 0)

    return NextResponse.json({
      success: true,
      data: {
        users: {
          total: totalUsers,
          byRole: userByRole,
          newThisMonth: Number((newThisMonth as unknown as Array<{ cnt: number }>)[0]?.cnt ?? 0),
          newThisWeek: Number((newThisWeek as unknown as Array<{ cnt: number }>)[0]?.cnt ?? 0),
        },
        courses: { total: totalCourses, byStatus: courseByStatus },
        enrollments: { total: totalEnrollments, byStatus: enrollByStatus },
        revenue: {
          totalKobo: revenueTotal,
          totalNaira: (revenueTotal / 100).toFixed(2),
        },
        recentActivity: recentActivity as unknown as Array<Record<string, unknown>>,
        dailySignups: dailySignups as unknown as Array<Record<string, unknown>>,
        topCourses: topCourses as unknown as Array<Record<string, unknown>>,
      },
    })
  } catch (err) {
    return handleRouteError(err)
  }
}