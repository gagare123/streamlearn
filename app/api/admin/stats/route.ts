import { NextResponse } from 'next/server'
import { db } from '@db/index'
import { requireAdmin } from '@lib/rbac'
import { handleRouteError } from '@lib/errors'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/stats
// Returns platform-wide aggregates. ADMIN only.
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(request: Request): Promise<NextResponse> {
  try {
    requireAdmin(request)

    const now = new Date()
    const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const d7  = new Date(now.getTime() -  7 * 24 * 60 * 60 * 1000)

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

      // Users by role
      db.execute(`
        SELECT role, COUNT(*)::int AS cnt
        FROM users GROUP BY role
      ` as any),

      // Courses by status
      db.execute(`
        SELECT status, COUNT(*)::int AS cnt
        FROM courses GROUP BY status
      ` as any),

      // Enrollments by status
      db.execute(`
        SELECT status, COUNT(*)::int AS cnt
        FROM enrollments GROUP BY status
      ` as any),

      // Total revenue
      db.execute(`
        SELECT COALESCE(SUM(amount_kobo), 0)::bigint AS total
        FROM payments WHERE status = 'SUCCESS'
      ` as any),

    // New users last 30 days
      db.execute(`
        SELECT COUNT(*)::int AS cnt FROM users WHERE created_at >= '${d30.toISOString()}'
      ` as any),

      // New users last 7 days
      db.execute(`
        SELECT COUNT(*)::int AS cnt FROM users WHERE created_at >= '${d7.toISOString()}'
      ` as any),

      // Recent audit activity (last 15 events)
      db.execute(`
        SELECT al.id, al.action, al.created_at,
               u.name AS actor_name, u.email AS actor_email
        FROM audit_logs al
        LEFT JOIN users u ON al.actor_id = u.id
        ORDER BY al.created_at DESC
        LIMIT 15
      ` as any),

      // Daily signups last 14 days
      db.execute(`
        SELECT DATE(created_at) AS day, COUNT(*)::int AS cnt
        FROM users
        WHERE created_at >= NOW() - INTERVAL '14 days'
        GROUP BY DATE(created_at)
        ORDER BY day ASC
      ` as any),

      // Top 5 courses by enrollment
      db.execute(`
        SELECT c.id, c.title, c.total_enrollments,
               c.price_kobo,
               u.name AS tutor_name
        FROM courses c
        JOIN users u ON c.tutor_id = u.id
        WHERE c.status = 'PUBLISHED'
        ORDER BY c.total_enrollments DESC
        LIMIT 5
      ` as any),
    ])

    // Shape user stats
    const userByRole: Record<string, number> = {}
    for (const row of (userStats as any).rows ?? []) {
      userByRole[row.role] = row.cnt
    }
    const totalUsers = Object.values(userByRole).reduce((a, b) => a + b, 0)

    // Shape course stats
    const courseByStatus: Record<string, number> = {}
    for (const row of (courseStats as any).rows ?? []) {
      courseByStatus[row.status] = row.cnt
    }
    const totalCourses = Object.values(courseByStatus).reduce((a, b) => a + b, 0)

    // Shape enrollment stats
    const enrollByStatus: Record<string, number> = {}
    for (const row of (enrollmentStats as any).rows ?? []) {
      enrollByStatus[row.status] = row.cnt
    }
    const totalEnrollments = Object.values(enrollByStatus).reduce((a, b) => a + b, 0)

    const totalRevenueKobo = Number((revenueRow as any).rows?.[0]?.total ?? 0)

    return NextResponse.json({
      success: true,
      data: {
        users: {
          total: totalUsers,
          byRole: userByRole,
          newThisMonth: (newThisMonth as any).rows?.[0]?.cnt ?? 0,
          newThisWeek:  (newThisWeek as any).rows?.[0]?.cnt ?? 0,
        },
        courses: { total: totalCourses, byStatus: courseByStatus },
        enrollments: { total: totalEnrollments, byStatus: enrollByStatus },
        revenue: {
          totalKobo: totalRevenueKobo,
          totalNaira: (totalRevenueKobo / 100).toFixed(2),
        },
        recentActivity: (recentActivity as any).rows ?? [],
        dailySignups: (dailySignups as any).rows ?? [],
        topCourses: (topCourses as any).rows ?? [],
      },
    })
  } catch (err) {
    return handleRouteError(err)
  }
}