import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { db, users } from '@db/index'
import { eq } from 'drizzle-orm'
import { handleRouteError, Errors } from '@/lib/errors'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/auth/me
//
// Returns the current authenticated user's profile.
// Used by the client-side auth hook to initialise auth state.
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const tokenPayload = await getAuthUser(request)
    if (!tokenPayload) {
      throw Errors.unauthorized('Not authenticated')
    }

    // Fetch fresh data from DB (not just token payload) so we always
    // return up-to-date name, avatar, etc.
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
      })
      .from(users)
      .where(eq(users.id, tokenPayload.sub))
      .limit(1)

    if (!user) {
      throw Errors.unauthorized('User account not found')
    }

    if (!user.isActive) {
      throw Errors.forbidden('Account has been suspended')
    }

    return NextResponse.json(
      { success: true, data: { user } },
      { status: 200 },
    )
  } catch (err) {
    return handleRouteError(err)
  }
}