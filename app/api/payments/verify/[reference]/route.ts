import { NextResponse } from 'next/server'
import { db, payments, enrollments, courses } from '@db/index'
import { eq, and, sql } from 'drizzle-orm'
import { requireIdentity } from '@/lib/rbac'
import { verifyPaystackTransaction } from '@/lib/paystack'
import { redis, RedisKeys, RedisTTL, type NotificationJobPayload } from '@/lib/redis'
import { writeAuditLog, auditMeta } from '@/lib/audit'
import { handleRouteError, Errors } from '@/lib/errors'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ reference: string }> }

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/payments/verify/[reference]
//
// Verifies a Paystack payment server-side after the user returns
// from the Paystack payment page.
//
// Security:
//   - Always calls Paystack's API directly — never trusts client-reported status
//   - Uses a Redis lock to prevent concurrent double-processing of the same ref
//   - Checks payment belongs to the authenticated user
//
// On success:
//   - Updates payment status → SUCCESS
//   - Creates enrollment record (or activates existing)
//   - Increments course totalEnrollments
//   - Queues enrollment notification
//   - Invalidates student enrollment cache
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(request: Request, { params }: Params): Promise<NextResponse> {
  try {
    const identity = requireIdentity(request)
    const { reference } = await params

    if (!reference) throw Errors.badRequest('Payment reference is required')

    // ── Find payment record ────────────────────────────────────────────────
    const [payment] = await db
      .select({
        id: payments.id,
        studentId: payments.studentId,
        courseId: payments.courseId,
        amountKobo: payments.amountKobo,
        status: payments.status,
        idempotencyKey: payments.idempotencyKey,
      })
      .from(payments)
      .where(eq(payments.paystackRef, reference))
      .limit(1)

    if (!payment) throw Errors.notFound('Payment record')

    // Verify this payment belongs to the authenticated user
    if (payment.studentId !== identity.userId) {
      throw Errors.forbidden('This payment does not belong to your account')
    }

    // Already processed — return current status
    if (payment.status === 'SUCCESS') {
      return NextResponse.json({
        success: true,
        data: { status: 'success', alreadyEnrolled: true, courseId: payment.courseId },
      })
    }

    if (payment.status === 'FAILED') {
      return NextResponse.json({
        success: false,
        error: 'Payment failed',
        data: { status: 'failed', courseId: payment.courseId },
      }, { status: 402 })
    }

    // ── Redis lock to prevent concurrent processing ────────────────────────
    const lockKey = RedisKeys.paystackWebhookLock(reference)
    const locked = await redis.set(lockKey, '1', { ex: RedisTTL.WEBHOOK_LOCK, nx: true })

    if (!locked) {
      // Another request is currently processing this payment
      return NextResponse.json({
        success: false,
        error: 'Payment is being processed. Please wait a moment.',
        code: 'PROCESSING',
      }, { status: 409 })
    }

    // ── Verify with Paystack API ───────────────────────────────────────────
    let verifyResult
    try {
      verifyResult = await verifyPaystackTransaction(reference)
    } catch (err) {
      await redis.del(lockKey)
      throw Errors.serviceUnavailable('Paystack')
    }

    const txStatus = verifyResult.data.status

    if (txStatus === 'failed' || txStatus === 'abandoned') {
      await db
        .update(payments)
        .set({ status: 'FAILED', paystackMetadata: verifyResult.data as unknown as Record<string, unknown>, updatedAt: new Date() })
        .where(eq(payments.id, payment.id))

      await redis.del(lockKey)

      await writeAuditLog({
        actorId: identity.userId,
        action: 'payment.failed',
        targetType: 'payment',
        targetId: payment.id,
        ...auditMeta(request),
        metadata: { reference, status: txStatus },
      })

      return NextResponse.json({
        success: false,
        error: `Payment ${txStatus}. Please try again.`,
        data: { status: txStatus, courseId: payment.courseId },
      }, { status: 402 })
    }

    if (txStatus !== 'success') {
      await redis.del(lockKey)
      return NextResponse.json({
        success: false,
        error: 'Payment is still pending',
        data: { status: txStatus },
      }, { status: 202 })
    }

    // ── Payment succeeded — fulfill enrollment ────────────────────────────

    // Update payment to SUCCESS
    await db
      .update(payments)
      .set({
        status: 'SUCCESS',
        paystackMetadata: verifyResult.data as unknown as Record<string, unknown>,
        updatedAt: new Date(),
      })
      .where(eq(payments.id, payment.id))

    // Upsert enrollment
    const [enrollment] = await db
      .insert(enrollments)
      .values({ studentId: identity.userId, courseId: payment.courseId, status: 'ACTIVE' })
      .onConflictDoUpdate({
        target: [enrollments.studentId, enrollments.courseId],
        set: { status: 'ACTIVE', updatedAt: new Date() },
      })
      .returning({ id: enrollments.id })

    // Increment totalEnrollments
    await db.execute(
      sql`UPDATE courses SET total_enrollments = total_enrollments + 1, updated_at = NOW() WHERE id = ${payment.courseId}`,
    )

    // Invalidate enrollment cache
    await redis.del(RedisKeys.studentEnrollmentsCache(identity.userId))

    // Queue enrollment notification
    const notifJob: NotificationJobPayload = {
      type: 'notification',
      userId: identity.userId,
      notificationId: `enroll-${enrollment?.id}`,
      title: 'Enrollment confirmed',
      body: `You are now enrolled. Start learning!`,
      actionUrl: `/dashboard/student/courses/${payment.courseId}`,
    }
    await redis.lpush(RedisKeys.notificationQueue(), JSON.stringify(notifJob))

    await redis.del(lockKey)

    await writeAuditLog({
      actorId: identity.userId,
      action: 'payment.success',
      targetType: 'payment',
      targetId: payment.id,
      ...auditMeta(request),
      metadata: { reference, courseId: payment.courseId, amountKobo: payment.amountKobo },
    })

    return NextResponse.json({
      success: true,
      data: {
        status: 'success',
        enrollmentId: enrollment?.id,
        courseId: payment.courseId,
      },
    })
  } catch (err) {
    return handleRouteError(err)
  }
}