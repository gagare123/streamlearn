import { NextResponse } from 'next/server'
import { db, courses, enrollments, payments } from '@db/index'
import { eq, and } from 'drizzle-orm'
import { requireRole } from '@/lib/auth'
import { writeAuditLog, auditMeta } from '@/lib/audit'
import { handleRouteError, Errors } from '@/lib/errors'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export async function POST(request: Request, { params }: Params) {
  try {
    const identity = await requireRole(request, 'STUDENT')
    const { id: courseId } = await params

    const [course] = await db
      .select({ id: courses.id, priceKobo: courses.priceKobo, status: courses.status })
      .from(courses)
      .where(eq(courses.id, courseId))
      .limit(1)

    if (!course) throw Errors.notFound('Course')

    if (course.status !== 'PUBLISHED') {
      throw Errors.badRequest('Course is not available for enrollment')
    }

    // Check if already enrolled
    const [existingEnrollment] = await db
      .select({ id: enrollments.id })
      .from(enrollments)
      .where(
        and(
          eq(enrollments.studentId, identity.sub),
          eq(enrollments.courseId, courseId)
        )
      )
      .limit(1)

    if (existingEnrollment) {
      return NextResponse.json(
        { success: false, error: 'Already enrolled', code: 'ALREADY_ENROLLED' },
        { status: 409 }
      )
    }

    // Check for existing pending payment (idempotency)
    const [existingPayment] = await db
      .select({ id: payments.id, paystackRef: payments.paystackRef })
      .from(payments)
      .where(
        and(
          eq(payments.studentId, identity.sub),
          eq(payments.courseId, courseId),
          eq(payments.status, 'PENDING')
        )
      )
      .limit(1)

    // ── Free course ──────────────────────────────────────────────
    if (course.priceKobo === 0) {
      const inserted = await db
        .insert(enrollments)
        .values({
          studentId: identity.sub,
          courseId,
          status: 'ACTIVE',
        })
        .returning()

      const enrollment = inserted[0]
      if (!enrollment) throw new Error('Failed to create enrollment')

      await writeAuditLog({
        actorId: identity.sub,
        action: 'enrollment.created',
        targetType: 'enrollment',
        targetId: enrollment.id,
        ...auditMeta(request),
        metadata: { courseId, type: 'free' },
      })

      return NextResponse.json(
        { success: true, data: { enrollment } },
        { status: 201 }
      )
    }

    // ── Paid course – check idempotency ──────────────────────────
    if (existingPayment) {
      // A pending payment already exists — don't create a new one
      return NextResponse.json({
        success: true,
        data: {
          reference: existingPayment.paystackRef,
          message: 'A pending payment already exists for this course',
        },
      })
    }

    // ── Paid course – initialize Paystack ────────────────────────
    const paystackSecret = process.env.PAYSTACK_SECRET_KEY!
    if (!paystackSecret) throw new Error('Paystack secret key not set')

    const reference = `enroll-${identity.sub}-${courseId}-${Date.now()}`
    const amountInKobo = course.priceKobo

    const paystackRes = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${paystackSecret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: identity.email,
        amount: amountInKobo,
        reference,
        callback_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/student`,
        metadata: {
          userId: identity.sub,
          courseId,
        },
      }),
    })

    if (!paystackRes.ok) {
      const errorBody = await paystackRes.text()
      console.error('Paystack initialization failed:', errorBody)
      throw new Error('Could not initialize payment')
    }

    const paystackData = (await paystackRes.json()) as {
      status: boolean
      data: { authorization_url: string; reference: string }
    }

    if (!paystackData.status) {
      throw new Error('Paystack returned failure status')
    }

    // Record payment as PENDING
    const insertedPayments = await db
      .insert(payments)
      .values({
        studentId: identity.sub,
        courseId,
        amountKobo: amountInKobo,
        paystackRef: reference,
        idempotencyKey: `${identity.sub}-${courseId}-${Date.now()}`,   // ✅ unique per attempt
        status: 'PENDING',
        currency: 'NGN',
      })
      .returning()

    const payment = insertedPayments[0]
    if (!payment) throw new Error('Failed to record payment')

    await writeAuditLog({
      actorId: identity.sub,
      action: 'payment.initiated',
      targetType: 'payment',
      targetId: payment.id,
      ...auditMeta(request),
      metadata: { reference, courseId, amountKobo: amountInKobo },   // ✅ fixed variable name
    })

    return NextResponse.json({
      success: true,
      data: {
        authorization_url: paystackData.data.authorization_url,
        reference,
      },
    })
  } catch (err) {
    return handleRouteError(err)
  }
}