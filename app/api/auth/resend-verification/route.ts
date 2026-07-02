import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db, users } from '@db/index'
import { eq } from 'drizzle-orm'
import { redis, RedisKeys, RedisTTL, type EmailJobPayload } from '@/lib/redis'
import { generateToken, getClientIp } from '@/lib/utils'
import { rateLimitByIp, RateLimits, rateLimitHeaders } from '@/lib/rate-limit'
import { handleRouteError, Errors } from '@/lib/errors'
import { env } from '@/lib/env'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  email: z.string().trim().toLowerCase().email('Please enter a valid email address'),
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/resend-verification
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(request: Request): Promise<NextResponse> {
  const ip = getClientIp(request)

  try {
    const rl = await rateLimitByIp(ip, 'auth:resend-verify', RateLimits.EMAIL)
    if (!rl.allowed) {
      return NextResponse.json(
        { success: false, error: 'Too many requests. Please wait before trying again.', code: 'RATE_LIMITED' },
        { status: 429, headers: rateLimitHeaders(rl) },
      )
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      throw Errors.badRequest('Request body must be valid JSON')
    }

    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', fields: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }

    const { email } = parsed.data

    const [user] = await db
      .select({ id: users.id, name: users.name, emailVerified: users.emailVerified })
      .from(users)
      .where(eq(users.email, email))
      .limit(1)

    // Generic response to prevent enumeration
    if (!user || user.emailVerified) {
      return NextResponse.json(
        { success: true, data: { message: 'If your email is registered and unverified, a new verification link will be sent.' } },
        { status: 200 },
      )
    }

    const verificationToken = generateToken(32)

    await Promise.all([
      redis.set(RedisKeys.emailVerification(verificationToken), user.id, {
        ex: RedisTTL.EMAIL_VERIFY,
      }),
      db.update(users).set({
        verificationToken,
        verificationTokenExpiresAt: new Date(Date.now() + RedisTTL.EMAIL_VERIFY * 1000),
      }).where(eq(users.id, user.id)),
    ])

    const verifyUrl = `${env.NEXT_PUBLIC_APP_URL}/auth/verify-email?token=${verificationToken}`
    const emailJob: EmailJobPayload = {
      type: 'email',
      to: email,
      subject: 'Verify your StreamLearn account',
      html: `<p>Hi ${user.name}, <a href="${verifyUrl}">click here to verify your email</a>. Expires in 24 hours.</p>`,
      text: `Hi ${user.name}, verify your email: ${verifyUrl}`,
    }

    await redis.lpush(RedisKeys.emailQueue(), JSON.stringify(emailJob))

    return NextResponse.json(
      { success: true, data: { message: 'Verification email sent. Please check your inbox.' } },
      { status: 200 },
    )
  } catch (err) {
    return handleRouteError(err)
  }
}