import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db, courses, enrollments, payments } from '@db/index'
import { eq, and, sql } from 'drizzle-orm'
import { requireIdentity } from '@/lib/rbac'
import {
  initializePaystackTransaction,
  generatePaystackReference,
  generateIdempotencyKey,
} from '@/lib/paystack'
import { redis, RedisKeys, RedisTTL } from '@/lib/redis'
import { rateLimitByUser, RateLimits, rateLimitHeaders } from '@/lib/rate-limit'
import { writeAuditLog, auditMeta } from '@/lib/audit'
import { handleRouteError, Errors } from '@/lib/errors'
import { env } from '@/lib/env'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  courseId: z.string().uuid('Invalid course ID'),
})

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const identity = requireIdentity(request)

    if (identity.role !== 'STUDENT') {
      throw Errors.forbidden('Only students can enroll in courses')
    }

    const rl = await rateLimitByUser(identity.userId, 'payment:init', RateLimits.PAYMENT)
    if (!rl.allowed) {
      return NextResponse.json(
        { success: false, error: 'Too many payment requests. Please wait.', code: 'RATE_LIMITED' },
        { status: 429, headers: rateLimitHeaders(rl) },
      )
    }

    let body: unknown
    try { body = await request.json() } catch { throw Errors.badRequest('Invalid JSON') }

    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', code: 'VALIDATION_ERROR', fields: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }

    const { courseId } = parsed.data

    const [course] = await db
      .select({ id: courses.id, title: courses.title, priceKobo: courses.priceKobo, status: courses.status })
      .from(courses)
      .where(eq(courses.id, courseId))
      .limit(1)

    if (!course) throw Errors.notFound('Course')
    if (course.status !== 'PUBLISHED') {
      throw Errors.badRequest('This course is not available for enrollment')
    }

    const [existing] = await db
      .select({ id: enrollments.id, status: enrollments.status })
      .from(enrollments)
      .where(and(eq(enrollments.studentId, identity.userId), eq(enrollments.courseId, courseId)))
      .limit(1)

    if (existing) {
      if (existing.status === 'ACTIVE' || existing.status === 'COMPLETED') {
        throw Errors.conflict('You are already enrolled in this course')
      }
    }

    // ── Free course: enroll directly ──────────────────────────────────────
    if (course.priceKobo === 0) {
      const inserted = await db
        .insert(enrollments)
        .values({ studentId: identity.userId, courseId, status: 'ACTIVE' })
        .onConflictDoUpdate({
          target: [enrollments.studentId, enrollments.courseId],
          set: { status: 'ACTIVE', updatedAt: new Date() },
        })
        .returning({ id: enrollments.id })

      const enrollment = inserted[0]
      if (!enrollment) throw Errors.internalError('Failed to create enrollment')

      // Increment course totalEnrollments using Drizzle (safe)
      await db
        .update(courses)
        .set({ totalEnrollments: sql`${courses.totalEnrollments} + 1`, updatedAt: new Date() })
        .where(eq(courses.id, courseId))

      // ✅ Only include metadata if defined
      const meta = auditMeta(request)
      await writeAuditLog({
        actorId: identity.userId,
        action: 'enrollment.created',
        targetType: 'enrollment',
        targetId: enrollment.id,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        // ✅ Only include metadata if defined
        ...({ metadata: { courseId, courseTitle: course.title, price: 0 } }),
      })

      return NextResponse.json({
        success: true,
        data: { type: 'free', enrolled: true, enrollmentId: enrollment.id },
      }, { status: 201 })
    }

    // ── Paid course: initialize Paystack ──────────────────────────────────
    const idempotencyKey = generateIdempotencyKey(identity.userId, courseId)
    const redisIdempKey = RedisKeys.paymentIdempotency(idempotencyKey)
    const existing_idem = await redis.get<string>(redisIdempKey)

    if (existing_idem) {
      const existingPayment = await db
        .select({ id: payments.id, paystackRef: payments.paystackRef, status: payments.status })
        .from(payments)
        .where(eq(payments.idempotencyKey, idempotencyKey))
        .limit(1)

            if (existingPayment[0]?.status === 'PENDING') {
        return NextResponse.json({
          success: true,
          data: {
            type: 'paid',
            reference: existingPayment[0].paystackRef,
            message: 'A pending payment already exists for this course. Please complete it or wait for it to expire.',
            alreadyPending: true,
          },
        })
      }
    }

    // ── Create new payment record ─────────────────────────────────────────
    const reference = generatePaystackReference(identity.userId, courseId)

    const inserted = await db
      .insert(payments)
      .values({
        studentId: identity.userId,
        courseId,
        amountKobo: course.priceKobo,
        currency: 'NGN',
        paystackRef: reference,
        idempotencyKey,
        status: 'PENDING',
      })
      .returning({ id: payments.id })

    const payment = inserted[0]
    if (!payment) throw Errors.internalError('Failed to create payment record')

    await redis.set(redisIdempKey, payment.id, { ex: RedisTTL.PAYMENT_IDEMPOTENCY })

    const paystackRes = await initializePaystackTransaction({
      email: identity.email,
      amountKobo: course.priceKobo,
      reference,
      metadata: {
        userId: identity.userId,
        courseId,
        courseTitle: course.title,
        idempotencyKey,
        paymentId: payment.id,
      },
      callbackUrl: `${env.NEXT_PUBLIC_APP_URL}/dashboard/student/payment-callback?reference=${reference}`,
    })

    const meta = auditMeta(request)
    await writeAuditLog({
      actorId: identity.userId,
      action: 'payment.initiated',
      targetType: 'payment',
      targetId: payment.id,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      ...({ metadata: { courseId, courseTitle: course.title, amountKobo: course.priceKobo, reference } }),
    })

    return NextResponse.json({
      success: true,
      data: {
        type: 'paid',
        authorizationUrl: paystackRes.data.authorization_url,
        reference,
        amountKobo: course.priceKobo,
      },
    })
  } catch (err) {
    return handleRouteError(err)
  }
}