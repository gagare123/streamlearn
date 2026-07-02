import { NextResponse } from 'next/server'
import { z } from 'zod'
import { redis, RedisKeys } from '@/lib/redis'
import { db, users } from '@db/index'
import { eq } from 'drizzle-orm'
import { writeAuditLog, auditMeta } from '@/lib/audit'
import { handleRouteError, Errors } from '@/lib/errors'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const querySchema = z.object({
  token: z.string().min(1, 'Verification token is required'),
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/auth/verify-email?token=...
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const url = new URL(request.url)
    const parsed = querySchema.safeParse({ token: url.searchParams.get('token') })

    if (!parsed.success) {
      throw Errors.badRequest('Invalid or missing verification token')
    }

    const { token } = parsed.data

    // ── Look up token in Redis ─────────────────────────────────────────────
    const redisKey = RedisKeys.emailVerification(token)
    const userId = await redis.get<string>(redisKey)

    if (!userId) {
      throw Errors.badRequest(
        'This verification link has expired or already been used. Please request a new one.',
      )
    }

    // ── Mark email as verified ─────────────────────────────────────────────
    const [updatedUser] = await db
      .update(users)
      .set({
        emailVerified: true,
        verificationToken: null,
        verificationTokenExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning({ id: users.id, email: users.email, name: users.name })

    if (!updatedUser) {
      throw Errors.notFound('User')
    }

    // ── Delete token from Redis ────────────────────────────────────────────
    await redis.del(redisKey)

    // ── Audit log ──────────────────────────────────────────────────────────
    const meta = auditMeta(request)
    await writeAuditLog({
      actorId: updatedUser.id,
      action: 'user.verify_email',
      targetType: 'user',
      targetId: updatedUser.id,
      ...meta,
    })

    return NextResponse.json(
      {
        success: true,
        data: { message: 'Email verified successfully. You can now sign in.' },
      },
      { status: 200 },
    )
  } catch (err) {
    return handleRouteError(err)
  }
}