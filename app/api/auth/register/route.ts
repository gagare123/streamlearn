
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db, users } from '@db/index'
import { eq } from 'drizzle-orm'
import { hashPassword } from '@/lib/password'
import { generateToken, getClientIp } from '@/lib/utils'
import { redis, RedisKeys, RedisTTL, type EmailJobPayload } from '@/lib/redis'
import { rateLimitByIp, RateLimits, rateLimitHeaders } from '@/lib/rate-limit'
import { writeAuditLog, auditMeta } from '@/lib/audit'
import { handleRouteError, Errors } from '@/lib/errors'
import { env } from '@/lib/env'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ─── Zod schema ───────────────────────────────────────────────────────────────

const registerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Name must be at least 2 characters')
    .max(255, 'Name must be under 255 characters'),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('Please enter a valid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be under 128 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  role: z.enum(['STUDENT', 'TUTOR']).default('STUDENT'),
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/register
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(request: Request): Promise<NextResponse> {
  const ip = getClientIp(request)

  try {
    // ── Rate limit: 10 registrations per minute per IP ─────────────────────
    const rl = await rateLimitByIp(ip, 'auth:register', RateLimits.AUTH)
    if (!rl.allowed) {
      return NextResponse.json(
        { success: false, error: 'Too many requests. Please try again later.', code: 'RATE_LIMITED' },
        { status: 429, headers: rateLimitHeaders(rl) },
      )
    }

    // ── Parse + validate body ──────────────────────────────────────────────
    let body: unknown
    try {
      body = await request.json()
    } catch {
      throw Errors.badRequest('Request body must be valid JSON')
    }

    const parsed = registerSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          fields: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      )
    }

    const { name, email, password, role } = parsed.data

    // ── Check email uniqueness ─────────────────────────────────────────────
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1)

    if (existing.length > 0) {
      // Use a generic message to avoid user enumeration
      throw Errors.conflict(
        'An account with this email already exists. Please sign in.',
      )
    }

    // ── Hash password ──────────────────────────────────────────────────────
    const passwordHash = await hashPassword(password)

    // ── Generate email verification token ─────────────────────────────────
    const verificationToken = generateToken(32) // 64 hex chars

    // ── Create user ────────────────────────────────────────────────────────
    const [newUser] = await db
      .insert(users)
      .values({
        name,
        email,
        passwordHash,
        role,
        emailVerified: false,
        verificationToken,
        verificationTokenExpiresAt: new Date(Date.now() + RedisTTL.EMAIL_VERIFY * 1000),
      })
      .returning({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
      })

    if (!newUser) {
      throw Errors.internalError('Failed to create user account')
    }

    // ── Store verification token in Redis ──────────────────────────────────
    await redis.set(
      RedisKeys.emailVerifyToken(verificationToken),
      newUser.id,
      { ex: RedisTTL.EMAIL_VERIFY },
    )

    // ── Enqueue verification email ─────────────────────────────────────────
    const verifyUrl = `${env.NEXT_PUBLIC_APP_URL}/verify-email?token=${verificationToken}`

    const emailJob: EmailJobPayload = {
      type: 'email',
      to: email,
      subject: 'Verify your StreamLearn account',
      html: buildVerificationEmailHtml(name, verifyUrl),
      text: `Hi ${name},\n\nVerify your email: ${verifyUrl}\n\nThis link expires in 24 hours.`,
    }

    await redis.lpush(RedisKeys.emailQueue(), JSON.stringify(emailJob))

    // ── Audit log ──────────────────────────────────────────────────────────
    const meta = auditMeta(request)
    await writeAuditLog({
      actorId: newUser.id,
      action: 'user.register',
      targetType: 'user',
      targetId: newUser.id,
      ...meta,
      metadata: { role, email },
    })

    return NextResponse.json(
      {
        success: true,
        data: {
          message:
            'Account created successfully. Please check your email to verify your account.',
          userId: newUser.id,
        },
      },
      { status: 201 },
    )
  } catch (err) {
    return handleRouteError(err)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Email template
// ─────────────────────────────────────────────────────────────────────────────

function buildVerificationEmailHtml(name: string, verifyUrl: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:system-ui,-apple-system,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px">
    <tr><td align="center">
      <table width="100%" style="max-width:520px;background:#ffffff;border-radius:12px;border:1px solid #e5e7eb;padding:40px">
        <tr><td>
          <div style="margin-bottom:24px">
            <span style="display:inline-flex;align-items:center;gap:8px;background:#eef2ff;color:#4f46e5;padding:6px 14px;border-radius:999px;font-size:13px;font-weight:600">
              ▶ StreamLearn
            </span>
          </div>
          <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827">Verify your email</h1>
          <p style="margin:0 0 24px;color:#6b7280;font-size:15px;line-height:1.6">
            Hi ${name}, thanks for joining StreamLearn! Click below to verify your email address and activate your account.
          </p>
          <a href="${verifyUrl}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:600">
            Verify Email Address
          </a>
          <p style="margin:24px 0 0;color:#9ca3af;font-size:13px">
            This link expires in 24 hours. If you didn't create an account, ignore this email.
          </p>
          <hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb" />
          <p style="margin:0;color:#9ca3af;font-size:12px">
            Or copy this link: <a href="${verifyUrl}" style="color:#4f46e5;word-break:break-all">${verifyUrl}</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}