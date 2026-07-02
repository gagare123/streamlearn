import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db, users } from '@db/index'
import { eq } from 'drizzle-orm'
import { redis, RedisKeys, RedisTTL, type EmailJobPayload } from '@/lib/redis'
import { generateToken, getClientIp } from '@/lib/utils'
import { rateLimitByIp, RateLimits, rateLimitHeaders } from '@/lib/rate-limit'
import { writeAuditLog, auditMeta } from '@/lib/audit'
import { handleRouteError, Errors } from '@/lib/errors'
import { env } from '@/lib/env'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  email: z.string().trim().toLowerCase().email('Please enter a valid email address'),
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/forgot-password
//
// Always returns 200 with a generic message to prevent user enumeration.
// The email is only sent if the account exists.
// ─────────────────────────────────────────────────────────────────────────────

const GENERIC_SUCCESS = {
  success: true,
  data: {
    message:
      'If an account exists with that email, you will receive a password reset link shortly.',
  },
}

export async function POST(request: Request): Promise<NextResponse> {
  const ip = getClientIp(request)

  try {
    // ── Rate limit: 3 forgot-password requests per 5 min per IP ───────────
    const rl = await rateLimitByIp(ip, 'auth:forgot-password', RateLimits.EMAIL)
    if (!rl.allowed) {
      // Return generic success to avoid revealing rate limit info
      return NextResponse.json(GENERIC_SUCCESS, {
        status: 200,
        headers: rateLimitHeaders(rl),
      })
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
        {
          success: false,
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          fields: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      )
    }

    const { email } = parsed.data

    // ── Look up user ───────────────────────────────────────────────────────
    const [user] = await db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(eq(users.email, email))
      .limit(1)

    // Always return generic success — don't leak whether the email exists
    if (!user) {
      return NextResponse.json(GENERIC_SUCCESS, { status: 200 })
    }

    // ── Generate reset token ───────────────────────────────────────────────
    const resetToken = generateToken(32)
    const redisKey = RedisKeys.passwordResetToken(resetToken)

    await redis.set(redisKey, user.id, { ex: RedisTTL.PASSWORD_RESET })

    // ── Enqueue reset email ────────────────────────────────────────────────
    const resetUrl = `${env.NEXT_PUBLIC_APP_URL}/reset-password?token=${resetToken}`

    const emailJob: EmailJobPayload = {
      type: 'email',
      to: user.email,
      subject: 'Reset your StreamLearn password',
      html: buildPasswordResetEmailHtml(user.name, resetUrl),
      text: `Hi ${user.name},\n\nReset your password: ${resetUrl}\n\nThis link expires in 1 hour.`,
    }

    await redis.lpush(RedisKeys.emailQueue(), JSON.stringify(emailJob))

    // ── Audit log ──────────────────────────────────────────────────────────
    const meta = auditMeta(request)
    await writeAuditLog({
      actorId: user.id,
      action: 'user.password_reset_request',
      targetType: 'user',
      targetId: user.id,
      ...meta,
    })

    return NextResponse.json(GENERIC_SUCCESS, { status: 200 })
  } catch (err) {
    return handleRouteError(err)
  }
}

function buildPasswordResetEmailHtml(name: string, resetUrl: string): string {
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
          <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827">Reset your password</h1>
          <p style="margin:0 0 24px;color:#6b7280;font-size:15px;line-height:1.6">
            Hi ${name}, we received a request to reset your StreamLearn password. Click below to choose a new one.
          </p>
          <a href="${resetUrl}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:600">
            Reset Password
          </a>
          <p style="margin:24px 0 0;color:#9ca3af;font-size:13px">
            This link expires in 1 hour. If you didn't request a password reset, you can safely ignore this email.
          </p>
          <hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb" />
          <p style="margin:0;color:#9ca3af;font-size:12px">
            Or copy this link: <a href="${resetUrl}" style="color:#4f46e5;word-break:break-all">${resetUrl}</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}