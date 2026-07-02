import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db, certificates, enrollments, users, courses } from '@db/index'
import { eq, and, desc } from 'drizzle-orm'
import { requireIdentity, requireAdmin } from '@lib/rbac'
import { handleRouteError, Errors } from '@lib/errors'
import { generateCertificate } from '@lib/certificate'
import { formatDuration } from '@lib/utils'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/certificates
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const identity = requireIdentity(request)

    const where = identity.role === 'ADMIN'
      ? undefined
      : eq(certificates.studentId, identity.userId)

    const rows = await db
      .select({
        id: certificates.id,
        studentId: certificates.studentId,
        courseId: certificates.courseId,
        r2Key: certificates.pdfR2Key,
        issuedAt: certificates.issuedAt,
        createdAt: certificates.createdAt,
        studentName: users.name,
        courseTitle: courses.title,
        courseDuration: courses.totalDurationSeconds,
        tutorName: users.name,
      })
      .from(certificates)
      .innerJoin(users, eq(certificates.studentId, users.id))
      .innerJoin(courses, eq(certificates.courseId, courses.id))
      .where(where)
      .orderBy(desc(certificates.issuedAt))
      .limit(50)

    return NextResponse.json({ success: true, data: { certificates: rows } })
  } catch (err) {
    return handleRouteError(err)
  }
}

// POST /api/certificates
const schema = z.object({
  studentId: z.string().uuid(),
  courseId:  z.string().uuid(),
})

export async function POST(request: Request): Promise<NextResponse> {
  try {
    requireAdmin(request)

    let body: unknown
    try { body = await request.json() } catch { throw Errors.badRequest('Invalid JSON') }

    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', code: 'VALIDATION_ERROR', fields: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }

    const { studentId, courseId } = parsed.data

    // Verify enrollment exists and is completed
    const [enrollment] = await db
      .select({ id: enrollments.id, status: enrollments.status })
      .from(enrollments)
      .where(and(eq(enrollments.studentId, studentId), eq(enrollments.courseId, courseId)))
      .limit(1)

    if (!enrollment) throw Errors.badRequest('Student is not enrolled in this course')
    if (enrollment.status !== 'COMPLETED') {
      throw Errors.badRequest('Student has not completed this course yet')
    }

    // Check if certificate already exists
    const [existing] = await db
      .select({ id: certificates.id })
      .from(certificates)
      .where(and(eq(certificates.studentId, studentId), eq(certificates.courseId, courseId)))
      .limit(1)

    if (existing) {
      return NextResponse.json({ success: true, data: { certificate: existing, alreadyIssued: true } })
    }

    // Fetch student + course data
    const [student] = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, studentId))
      .limit(1)

    const [course] = await db
      .select({
        title: courses.title,
        totalDurationSeconds: courses.totalDurationSeconds,
        tutorName: users.name,
      })
      .from(courses)
      .innerJoin(users, eq(courses.tutorId, users.id))
      .where(eq(courses.id, courseId))
      .limit(1)

    if (!student || !course) throw Errors.notFound('Student or course')

    const certificateId = crypto.randomUUID()
    const completedAt = new Date()

    // Generate PDF + upload to R2
    const r2Key = await generateCertificate({
      certificateId,
      studentName: student.name,
      courseTitle: course.title,
      tutorName: course.tutorName,
      completedAt,
      courseDuration: course.totalDurationSeconds
        ? formatDuration(course.totalDurationSeconds)
        : '',
    })

   // Insert certificate record
    await db.insert(certificates).values({
      id: certificateId,
      studentId,
      courseId,
      pdfR2Key: r2Key,
      issuedAt: completedAt,
    })

    return NextResponse.json(
      { success: true, data: { certificate: { id: certificateId, r2Key, issuedAt: completedAt } } },
      { status: 201 },
    )
  } catch (err) {
    return handleRouteError(err)
  }
}