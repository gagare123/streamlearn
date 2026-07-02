import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db, users } from '@db/index'
import { eq } from 'drizzle-orm'
import { requireIdentity } from '@/lib/rbac'
import { writeAuditLog, auditMeta } from '@/lib/audit'
import { handleRouteError, Errors } from '@/lib/errors'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/users/me — fetch own profile
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const identity = requireIdentity(request)

    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        emailVerified: users.emailVerified,
        avatarR2Key: users.avatarR2Key,
        bio: users.bio,
        isActive: users.isActive,
        createdAt: users.createdAt,
        lastLoginAt: users.lastLoginAt,
      })
      .from(users)
      .where(eq(users.id, identity.userId))
      .limit(1)

    if (!user) throw Errors.notFound('User')
    if (!user.isActive) throw Errors.forbidden('Account has been suspended')

    return NextResponse.json({ success: true, data: { user } })
  } catch (err) {
    return handleRouteError(err)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/users/me — update own profile (name + bio only)
// ─────────────────────────────────────────────────────────────────────────────

const patchSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Name must be at least 2 characters')
    .max(255, 'Name must be under 255 characters')
    .optional(),
  bio: z
    .string()
    .trim()
    .max(1000, 'Bio must be under 1000 characters')
    .nullable()
    .optional(),
})

export async function PATCH(request: Request): Promise<NextResponse> {
  try {
    const identity = requireIdentity(request)

    let body: unknown
    try { body = await request.json() } catch { throw Errors.badRequest('Request body must be valid JSON') }

    const parsed = patchSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', code: 'VALIDATION_ERROR', fields: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }

    const updates: Partial<{ name: string; bio: string | null; updatedAt: Date }> = {
      updatedAt: new Date(),
    }
    if (parsed.data.name !== undefined) updates.name = parsed.data.name
    if (parsed.data.bio !== undefined) updates.bio = parsed.data.bio

    const [updated] = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, identity.userId))
      .returning({
        id: users.id,
        name: users.name,
        bio: users.bio,
        updatedAt: users.updatedAt,
      })

    if (!updated) throw Errors.notFound('User')

    await writeAuditLog({
      actorId: identity.userId,
      action: 'user.profile_update',
      targetType: 'user',
      targetId: identity.userId,
      ...auditMeta(request),
      metadata: { fields: Object.keys(updates).filter((k) => k !== 'updatedAt') },
    })

    return NextResponse.json({ success: true, data: { user: updated } })
  } catch (err) {
    return handleRouteError(err)
  }
}