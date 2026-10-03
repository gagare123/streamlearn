import { NextResponse } from 'next/server'
import { db, enrollments, users, courses, certificates } from '@db/index'
import { eq, and, desc, isNotNull } from 'drizzle-orm'
import { requireAdmin } from '@/lib/rbac'
import { handleRouteError } from '@/lib/errors'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request): Promise<NextResponse> {
  try {
    requireAdmin(request)

    // All completed enrollments
    const completedRows = await db
      .select({
        enrollmentId: enrollments.id,
        studentId: users.id,
        studentName: users.name,
        studentEmail: users.email,
        courseId: courses.id,
        courseTitle: courses.title,
        completedAt: enrollments.completedAt,
      })
      .from(enrollments)
      .innerJoin(users, eq(enrollments.studentId, users.id))
      .innerJoin(courses, eq(enrollments.courseId, courses.id))
      .where(eq(enrollments.status, 'COMPLETED'))
      .orderBy(desc(enrollments.completedAt))
      .limit(200)

    // All issued certificates
    const certRows = await db
      .select({
        id: certificates.id,
        studentId: certificates.studentId,
        courseId: certificates.courseId,
        issuedAt: certificates.issuedAt,
        studentName: users.name,
        courseTitle: courses.title,
      })
      .from(certificates)
      .innerJoin(users, eq(certificates.studentId, users.id))
      .innerJoin(courses, eq(certificates.courseId, courses.id))
      .orderBy(desc(certificates.issuedAt))
      .limit(200)

    // Mark which completed enrollments already have certificates
    const certKeys = new Set(certRows.map(c => `${c.studentId}:${c.courseId}`))
    const completed = completedRows.map(r => ({
      ...r,
      hasCertificate: certKeys.has(`${r.studentId}:${r.courseId}`),
    }))

    return NextResponse.json({
      success: true,
      data: {
        completed,
        certificates: certRows,
      },
    })
  } catch (err) {
    return handleRouteError(err)
  }
}