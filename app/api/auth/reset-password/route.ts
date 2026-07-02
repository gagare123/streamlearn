import { NextResponse } from 'next/server'
import { z } from 'zod'
import { redis, RedisKeys } from '@/lib/redis'
import { db, users } from '@db/index'
import { eq } from 'drizzle-orm'
import { hashPassword } from '@/lib/password'
import { clearAuthCookies } from '@/lib/auth'
import { revokeAllSessions } from '@/lib/session'
import { writeAuditLog, auditMeta } from '@/lib/audit'
import { handleRouteError, Errors } from '@/lib/errors'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be under 128 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/reset-password
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(request: Request): Promise<NextResponse> {
  try {
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

    const { token, password } = parsed.data

    // ── Validate reset token ───────────────────────────────────────────────
    const redisKey = RedisKeys.passwordResetToken(token)
    const userId = await redis.get<string>(redisKey)

    if (!userId) {
      throw Errors.badRequest(
        'This reset link has expired or already been used. Please request a new one.',
      )
    }

    // ── Verify user exists ─────────────────────────────────────────────────
    const [user] = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)

    if (!user) {
      throw Errors.notFound('User')
    }

    // ── Hash new password ──────────────────────────────────────────────────
    const passwordHash = await hashPassword(password)

    // ── Update password + revoke all sessions ──────────────────────────────
    // Revoke all sessions first to ensure the old password can't be used
    await Promise.all([
      db
        .update(users)
        .set({ passwordHash, updatedAt: new Date() })
        .where(eq(users.id, userId)),
      revokeAllSessions(userId),
      // Consume the reset token immediately
      redis.del(redisKey),
    ])

    // ── Audit log ──────────────────────────────────────────────────────────
    const meta = auditMeta(request)
    await writeAuditLog({
      actorId: user.id,
      action: 'user.password_reset_complete',
      targetType: 'user',
      targetId: user.id,
      ...meta,
    })

    // ── Build response — clear any existing auth cookies ───────────────────
    const response = NextResponse.json(
      {
        success: true,
        data: {
          message:
            'Password reset successfully. Please sign in with your new password.',
        },
      },
      { status: 200 },
    )

    clearAuthCookies(response)

    return response
  } catch (err) {
    return handleRouteError(err)
  }
}