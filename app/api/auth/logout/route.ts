import { NextResponse } from 'next/server'
import { verifyRefreshToken, clearAuthCookies, getCookieValue } from '@/lib/auth'
import { revokeSession } from '@/lib/session'
import { writeAuditLog, auditMeta } from '@/lib/audit'


export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const cookieHeader = request.headers.get('cookie')
    const refreshToken = getCookieValue(cookieHeader, 'refresh_token')

    if (refreshToken) {
      const verified = await verifyRefreshToken(refreshToken)
      if (verified) {
        const userId = verified.sub!
        const tokenId = verified.tokenId!
        await revokeSession(userId, tokenId)

        const meta = auditMeta(request)
        await writeAuditLog({
          actorId: userId,
          action: 'user.logout',
          targetType: 'session',
          ...meta,
          metadata: { tokenId },
        })
      }
    }

    const response = NextResponse.json(
      { success: true, data: { message: 'Signed out successfully' } },
      { status: 200 },
    )

    clearAuthCookies(response)
    return response
  } catch {
    const response = NextResponse.json(
      { success: true, data: { message: 'Signed out successfully' } },
      { status: 200 },
    )
    clearAuthCookies(response)
    return response
  }
}