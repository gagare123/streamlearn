import { NextResponse } from 'next/server'
import { db, enrollments, users, courses } from '@db/index'
import { eq } from 'drizzle-orm'
import { requireRole } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const identity = await requireRole(request, 'TUTOR', 'ADMIN')

    const rows = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        courseTitle: courses.title,
        enrolledAt: enrollments.createdAt,
        progress: enrollments.status,
      })
      .from(enrollments)
      .innerJoin(users, eq(enrollments.studentId, users.id))
      .innerJoin(courses, eq(enrollments.courseId, courses.id))
      .where(eq(courses.tutorId, identity.sub!))
      .limit(100)

    const students = rows.map((r) => ({
      ...r,
      progress: r.progress === 'COMPLETED' ? 100 : r.progress === 'ACTIVE' ? 50 : 0,
    }))

    return NextResponse.json({ success: true, data: { students } })
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Internal error' },
      { status: err.statusCode || 500 }
    )
  }
}