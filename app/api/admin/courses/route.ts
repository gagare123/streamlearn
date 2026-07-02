import { NextResponse } from 'next/server'
import { db, courses, users } from '@db/index'
import { eq, desc } from 'drizzle-orm'
import { requireAdmin } from '@lib/rbac'
import { handleRouteError } from '@lib/errors'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    requireAdmin(request)

    const rows = await db
      .select({
        id: courses.id,
        title: courses.title,
        status: courses.status,
        totalEnrollments: courses.totalEnrollments,
        priceKobo: courses.priceKobo,
        createdAt: courses.createdAt,
        tutorName: users.name,
      })
      .from(courses)
      .leftJoin(users, eq(courses.tutorId, users.id))
      .orderBy(desc(courses.createdAt))
      .limit(100)

    return NextResponse.json({ success: true, data: { courses: rows } })
  } catch (err) {
    return handleRouteError(err)
  }
}