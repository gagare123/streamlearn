import { NextResponse } from 'next/server'
import { db, enrollments, quizSubmissions } from '@db/index'
import { eq, and, count } from 'drizzle-orm'
import { requireRole } from '@/lib/auth'
import { handleRouteError } from '@/lib/errors'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const identity = await requireRole(request, 'STUDENT', 'TUTOR', 'ADMIN')

    const [enrolledResult, inProgressResult, completedResult, quizzesResult] = await Promise.all([
      db
        .select({ total: count() })
        .from(enrollments)
        .where(eq(enrollments.studentId, identity.sub!)),

      db
        .select({ total: count() })
        .from(enrollments)
        .where(and(
          eq(enrollments.studentId, identity.sub!),
          eq(enrollments.status, 'ACTIVE'),
        )),

      db
        .select({ total: count() })
        .from(enrollments)
        .where(and(
          eq(enrollments.studentId, identity.sub!),
          eq(enrollments.status, 'COMPLETED'),
        )),

      db
        .select({ total: count() })
        .from(quizSubmissions)
        .where(eq(quizSubmissions.studentId, identity.sub!)),
    ])

    return NextResponse.json({
      success: true,
      data: {
        enrolled: Number(enrolledResult[0]?.total ?? 0),
        inProgress: Number(inProgressResult[0]?.total ?? 0),
        completed: Number(completedResult[0]?.total ?? 0),
        quizzesDone: Number(quizzesResult[0]?.total ?? 0),
      },
    })
  } catch (err) {
    return handleRouteError(err)
  }
}