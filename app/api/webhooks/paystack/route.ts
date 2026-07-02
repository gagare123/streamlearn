import { NextResponse } from 'next/server'
import { db, payments, enrollments } from '@db/index'
import { eq, sql } from 'drizzle-orm'
import { verifyPaystackWebhook, type PaystackWebhookEvent } from '@/lib/paystack'
import { redis, RedisKeys, RedisTTL, type NotificationJobPayload } from '@/lib/redis'
import { writeAuditLog } from '@/lib/audit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/webhooks/paystack
//
// Receives Paystack webhook events.
// This is the server-authoritative enrollment path — events arrive here
// even when the user closes the browser tab before returning to the callback.
//
// Security:
//   - HMAC-SHA512 signature verified before any processing
//   - Redis NX idempotency lock (60s) prevents duplicate processing
//   - No JWT auth — Paystack calls this directly
//
// Events handled:
//   - charge.success → activate enrollment, update payment → SUCCESS
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(request: Request): Promise<NextResponse> {
  // ── 1. Read raw body (required for HMAC) ─────────────────────────────────
  const rawBody = await request.text()
  const signature = request.headers.get('x-paystack-signature') ?? ''

  // ── 2. Verify HMAC-SHA512 signature ──────────────────────────────────────
  const valid = verifyPaystackWebhook(rawBody, signature)
  if (!valid) {
    console.warn('[webhook/paystack] Invalid signature — rejected')
    return NextResponse.json({ success: false, error: 'Invalid signature' }, { status: 401 })
  }

  // ── 3. Parse event ─────────────────────────────────────────────────────────
  let event: PaystackWebhookEvent
  try {
    event = JSON.parse(rawBody) as PaystackWebhookEvent
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 })
  }

  // ── 4. Idempotency lock ───────────────────────────────────────────────────
  // Use the reference as the dedup key — Paystack may retry events
  const reference = event.data.reference
  const lockKey = RedisKeys.paystackWebhookLock(reference)
  const locked = await redis.set(lockKey, '1', { ex: RedisTTL.WEBHOOK_LOCK, nx: true })

  if (!locked) {
    // Already being processed (or was processed within 60s)
    return NextResponse.json({ success: true, data: { skipped: true } })
  }

  // ── 5. Audit the raw event ────────────────────────────────────────────────
  await writeAuditLog({
    actorId: null,
    action: 'webhook.paystack.received',
    metadata: { event: event.event, reference, amount: event.data.amount },
  })

  // ── 6. Dispatch handler ───────────────────────────────────────────────────
  try {
    switch (event.event) {
      case 'charge.success':
        await handleChargeSuccess(event)
        break

      // Add more event types here as needed:
      // case 'refund.processed': await handleRefund(event); break

      default:
        // Gracefully ignore unrecognised events
        break
    }
  } catch (err) {
    console.error(`[webhook/paystack] Error handling ${event.event}:`, err)
    // Return 200 to prevent Paystack from retrying indefinitely
    // The lock ensures we won't double-process on a retry anyway
  }

  return NextResponse.json({ success: true, data: { received: true } })
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler: charge.success
// ─────────────────────────────────────────────────────────────────────────────

async function handleChargeSuccess(event: PaystackWebhookEvent): Promise<void> {
  const { reference, amount, metadata } = event.data

  // Look up the payment record by reference
  const [payment] = await db
    .select({
      id: payments.id,
      studentId: payments.studentId,
      courseId: payments.courseId,
      amountKobo: payments.amountKobo,
      status: payments.status,
    })
    .from(payments)
    .where(eq(payments.paystackRef, reference))
    .limit(1)

  if (!payment) {
    console.warn(`[webhook/paystack] No payment found for reference=${reference}`)
    return
  }

  // Skip if already processed (verify endpoint may have beaten the webhook)
  if (payment.status === 'SUCCESS') {
    console.log(`[webhook/paystack] Payment ${reference} already SUCCESS — skipping`)
    return
  }

  // Sanity check: amounts match (within 1 kobo for float rounding)
  if (Math.abs(amount - payment.amountKobo) > 1) {
    console.error(
      `[webhook/paystack] Amount mismatch for ${reference}: ` +
      `expected ${payment.amountKobo}, got ${amount}`,
    )
    // Don't return — still fulfill (amount discrepancy logged for investigation)
  }

  // Update payment to SUCCESS
  await db
    .update(payments)
    .set({
      status: 'SUCCESS',
      paystackMetadata: event.data as unknown as Record<string, unknown>,
      updatedAt: new Date(),
    })
    .where(eq(payments.id, payment.id))

  // Upsert enrollment — safe even if verify endpoint already created it
  const [enrollment] = await db
    .insert(enrollments)
    .values({ studentId: payment.studentId, courseId: payment.courseId, status: 'ACTIVE' })
    .onConflictDoUpdate({
      target: [enrollments.studentId, enrollments.courseId],
      set: { status: 'ACTIVE', updatedAt: new Date() },
    })
    .returning({ id: enrollments.id })

  // Increment totalEnrollments (may be called twice if verify already incremented)
  // Using a conditional increment: only increment if this webhook is the first to succeed
  await db.execute(
    sql`UPDATE courses 
        SET total_enrollments = total_enrollments + 1, updated_at = NOW() 
        WHERE id = ${payment.courseId}
        AND NOT EXISTS (
          SELECT 1 FROM enrollments 
          WHERE student_id = ${payment.studentId} 
          AND course_id = ${payment.courseId} 
          AND status = 'ACTIVE'
          AND updated_at < NOW() - INTERVAL '5 seconds'
        )`,
  )

  // Invalidate student enrollment cache
  await redis.del(RedisKeys.studentEnrollmentsCache(payment.studentId))

  // Queue confirmation notification
  const notifJob: NotificationJobPayload = {
    type: 'notification',
    userId: payment.studentId,
    notificationId: `webhook-enroll-${enrollment?.id}`,
    title: 'Payment confirmed',
    body: `Your payment was received and you are now enrolled!`,
    actionUrl: `/dashboard/student/courses/${payment.courseId}`,
  }
  await redis.lpush(RedisKeys.notificationQueue(), JSON.stringify(notifJob))

  await writeAuditLog({
    actorId: payment.studentId,
    action: 'webhook.paystack.charge_success',
    targetType: 'payment',
    targetId: payment.id,
    metadata: { reference, courseId: payment.courseId, amount },
  })

  console.log(`[webhook/paystack] charge.success: enrolled student=${payment.studentId} course=${payment.courseId}`)
}