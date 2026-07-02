import { NextResponse } from 'next/server'
import { db, payments, courses } from '@db/index'
import { eq, desc } from 'drizzle-orm'
import { requireIdentity } from '@/lib/rbac'
import { handleRouteError } from '@/lib/errors'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/payments
//
// Returns the authenticated user's payment history.
// Students see their own payments.
// ADMINs see all payments (pass ?userId=... to filter).
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const identity = requireIdentity(request)
    const url = new URL(request.url)

    let targetUserId = identity.userId

    // Admins can view any user's payments
    if (identity.role === 'ADMIN') {
      const qUserId = url.searchParams.get('userId')
      if (qUserId) targetUserId = qUserId
    } else {
      // Non-admins can only see their own payments
      targetUserId = identity.userId
    }

    const rows = await db
      .select({
        id: payments.id,
        amountKobo: payments.amountKobo,
        currency: payments.currency,
        paystackRef: payments.paystackRef,
        status: payments.status,
        createdAt: payments.createdAt,
        course: {
          id: courses.id,
          title: courses.title,
          slug: courses.slug,
        },
      })
      .from(payments)
      .innerJoin(courses, eq(payments.courseId, courses.id))
      .where(eq(payments.studentId, targetUserId))
      .orderBy(desc(payments.createdAt))
      .limit(50)

    return NextResponse.json({ success: true, data: { payments: rows } })
  } catch (err) {
    return handleRouteError(err)
  }
}