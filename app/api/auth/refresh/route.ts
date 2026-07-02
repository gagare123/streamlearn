import { NextResponse } from 'next/server'
import {
  verifyRefreshToken,
  signAccessToken,
  signRefreshToken,
  setAuthCookies,
  getCookieValue,
} from '@/lib/auth'
import { validateSession, rotateSession } from '@/lib/session'
import { db, users } from '@db/index'
import { eq } from 'drizzle-orm'
import { getClientIp } from '@/lib/utils'
import { writeAuditLog, auditMeta } from '@/lib/audit'
import { handleRouteError, Errors } from '@/lib/errors'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request): Promise<NextResponse> {
  const ip = getClientIp(request)

  try {
    // Read refresh token from cookie
    const cookieHeader = request.headers.get('cookie')
    const refreshToken = getCookieValue(cookieHeader, 'refresh_token')
    if (!refreshToken) {
      throw Errors.unauthorized('No refresh token provided')
    }

    const verified = await verifyRefreshToken(refreshToken)
    if (!verified) {
      throw Errors.unauthorized('Invalid or expired refresh token')
    }

    const userId = verified.sub!
    const tokenId = verified.tokenId!

    const sessionData = await validateSession(userId, tokenId, refreshToken)
    if (!sessionData) {
      const meta = auditMeta(request)
      await writeAuditLog({
        actorId: userId,
        action: 'user.refresh_token',
        targetType: 'session',
        ...meta,
        metadata: { result: 'invalid_session', tokenId },
      })
      throw Errors.unauthorized('Session is invalid or has expired. Please sign in again.')
    }

    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        isActive: users.isActive,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)

    if (!user) throw Errors.unauthorized('User account no longer exists')
    if (!user.isActive) throw Errors.forbidden('Account has been suspended')

    const newTokenId = crypto.randomUUID()
    const newRefreshTokenJwt = await signRefreshToken({ userId: user.id, tokenId: newTokenId })

    const rotateParams = {
      oldUserId: userId,
      oldTokenId: tokenId,
      role: user.role,
      email: user.email,
      name: user.name,
      newRefreshToken: newRefreshTokenJwt,
      newTokenId,
      ...(ip ? { ipAddress: ip } : {}),
      ...(request.headers.get('user-agent') ? { userAgent: request.headers.get('user-agent')! } : {}),
    }

    await rotateSession(rotateParams)

    const newAccessToken = await signAccessToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      tokenId: newTokenId,
    })

    const response = NextResponse.json(
      { success: true, data: { user: { id: user.id, email: user.email, name: user.name, role: user.role } } },
      { status: 200 },
    )

    setAuthCookies(response, newAccessToken, newRefreshTokenJwt)

    const meta = auditMeta(request)
    await writeAuditLog({
      actorId: user.id,
      action: 'user.refresh_token',
      targetType: 'session',
      ...meta,
      metadata: { result: 'success', oldTokenId: tokenId, newTokenId },
    })

    return response
  } catch (err) {
    return handleRouteError(err)
  }
}