import { NextResponse } from 'next/server'
import { loginSchema } from '@/lib/validators/auth'
import { verifyPassword } from '@/lib/password'
import { signAccessToken, signRefreshToken, setAuthCookies } from '@/lib/auth'
import { createSession } from '@/lib/session'
import { db, users } from '@db/index'
import { eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { writeAuditLog, auditMeta } from '@/lib/audit'
import { handleRouteError, Errors } from '@/lib/errors'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = await request.json()
    const parsed = loginSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, errors: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }

    const { email, password } = parsed.data

    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        passwordHash: users.passwordHash,
        emailVerified: users.emailVerified,
        isActive: users.isActive,
      })
      .from(users)
      .where(eq(users.email, email))
      .limit(1)

    if (!user) {
      throw Errors.unauthorized('Invalid email or password')
    }

    if (!user.isActive) {
      throw Errors.forbidden('Account is deactivated')
    }

    const passwordValid = await verifyPassword(password, user.passwordHash)
    if (!passwordValid) {
      throw Errors.unauthorized('Invalid email or password')
    }

    // Update last login (fire & forget)
    db.update(users)
      .set({ lastLoginAt: new Date() })
      .where(eq(users.id, user.id))
      .execute()
      .catch(console.error)

    // Generate token and create session
    const tokenId = crypto.randomUUID()
   const refreshTokenJwt = await signRefreshToken({ userId: user.id, tokenId })
    const headersList = await headers()
    const ip = headersList.get('x-forwarded-for')
    const userAgent = headersList.get('user-agent')

    await createSession({
      userId: user.id,
      role: user.role,
      email: user.email,
      name: user.name,
      refreshToken: refreshTokenJwt,
      tokenId,
      ...(ip ? { ipAddress: ip } : {}),
      ...(userAgent ? { userAgent } : {}),
    })

        const accessToken = await signAccessToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      tokenId,
    })
    const response = NextResponse.json(
      {
        success: true,
        data: {
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            emailVerified: user.emailVerified,
          },
        },
      },
      { status: 200 },
    )

    setAuthCookies(response, accessToken, refreshTokenJwt)

    const meta = auditMeta(request)
    await writeAuditLog({
      actorId: user.id,
      action: 'user.login',
      targetType: 'user',
      targetId: user.id,
      ...meta,
      metadata: { role: user.role },
    })

    return response
  } catch (err) {
    return handleRouteError(err)
  }
}