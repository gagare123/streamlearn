import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db, users } from '@db/index'
import { eq } from 'drizzle-orm'
import { requireIdentity } from '@/lib/rbac'
import { verifyPassword, hashPassword } from '@/lib/password'
import { revokeAllSessions } from '@/lib/session'            // ✅ corrected import
import { clearAuthCookies } from '@/lib/auth'
import { writeAuditLog, auditMeta } from '@/lib/audit'
import { rateLimitByUser, RateLimits, rateLimitHeaders } from '@/lib/rate-limit'
import { handleRouteError, Errors } from '@/lib/errors'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be under 128 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/users/me/password
//
// Change the authenticated user's password.
// Verifies current password, hashes new one, revokes all existing sessions
// (forcing re-login on all devices), and clears cookies on the current device.
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const identity = requireIdentity(request)

    // Rate limit: 5 attempts per minute per user
    const rl = await rateLimitByUser(identity.userId, 'change-password', RateLimits.AUTH)
    if (!rl.allowed) {
      return NextResponse.json(
        { success: false, error: 'Too many requests. Please wait before trying again.', code: 'RATE_LIMITED' },
        { status: 429, headers: rateLimitHeaders(rl) },
      )
    }

    let body: unknown
    try { body = await request.json() } catch { throw Errors.badRequest('Request body must be valid JSON') }

    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', code: 'VALIDATION_ERROR', fields: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }

    const { currentPassword, newPassword } = parsed.data

    // ── Fetch user with password hash ──────────────────────────────────────
    const [user] = await db
      .select({ id: users.id, passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, identity.userId))
      .limit(1)

    if (!user) throw Errors.notFound('User')

    // ── Verify current password ────────────────────────────────────────────
    const valid = await verifyPassword(currentPassword, user.passwordHash)
    if (!valid) {
      throw Errors.unauthorized('Current password is incorrect')
    }

    // Prevent setting the same password
    const samePassword = await verifyPassword(newPassword, user.passwordHash)
    if (samePassword) {
      throw Errors.badRequest('New password must be different from your current password')
    }

    // ── Hash new password ──────────────────────────────────────────────────
    const newHash = await hashPassword(newPassword)

    // ── Update + revoke all sessions ───────────────────────────────────────
    await Promise.all([
      db.update(users).set({ passwordHash: newHash, updatedAt: new Date() }).where(eq(users.id, identity.userId)),
      revokeAllSessions(identity.userId),      // ✅ corrected function call
    ])

    // ── Audit log ──────────────────────────────────────────────────────────
    await writeAuditLog({
      actorId: identity.userId,
      action: 'user.password_reset_complete',
      targetType: 'user',
      targetId: identity.userId,
      ...auditMeta(request),
      metadata: { method: 'authenticated_change' },
    })

    // ── Clear cookies — user must re-login ─────────────────────────────────
    const response = NextResponse.json(
      {
        success: true,
        data: { message: 'Password changed successfully. Please sign in again on all your devices.' },
      },
      { status: 200 },
    )

    clearAuthCookies(response)

    return response
  } catch (err) {
    return handleRouteError(err)
  }
}