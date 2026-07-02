import { SignJWT, jwtVerify, type JWTPayload } from 'jose'
import { NextResponse } from 'next/server'
import { env } from './env'

// ─────────────────────────────────────────────────────────────────────────────
// JWT Configuration
//
// Access tokens:  15 minutes (short window — reduces stolen token impact)
// Refresh tokens: 7 days (stored HttpOnly, SameSite=Strict)
//
// Both use HS256 (HMAC-SHA256) — symmetric — sufficient for single-server.
// Upgrade to RS256 (asymmetric) if multiple services need to verify tokens.
// ─────────────────────────────────────────────────────────────────────────────

const ISSUER   = 'streamlearn'
const AUDIENCE = 'streamlearn-client'

const ACCESS_TTL  = 15 * 60          // 15 minutes in seconds
const REFRESH_TTL = 7 * 24 * 60 * 60 // 7 days in seconds

// ─────────────────────────────────────────────────────────────────────────────
// Token payload types
// ─────────────────────────────────────────────────────────────────────────────

export type AccessTokenPayload = JWTPayload & {
  sub:     string   // userId
  role:    string   // UserRole
  email:   string
  tokenId: string   // session token ID (for revocation)
}

export type RefreshTokenPayload = JWTPayload & {
  sub:     string   // userId
  tokenId: string   // links to session record
}

// ─────────────────────────────────────────────────────────────────────────────
// Token signing
// ─────────────────────────────────────────────────────────────────────────────

function getAccessSecret(): Uint8Array {
  return new TextEncoder().encode(env.JWT_ACCESS_SECRET)
}

function getRefreshSecret(): Uint8Array {
  return new TextEncoder().encode(env.JWT_REFRESH_SECRET)
}

export async function signAccessToken(payload: {
  userId: string
  role: string
  email: string
  tokenId: string
}): Promise<string> {
  return new SignJWT({
    role:    payload.role,
    email:   payload.email,
    tokenId: payload.tokenId,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.userId)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TTL}s`)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .sign(getAccessSecret())
}

export async function signRefreshToken(payload: {
  userId: string
  tokenId: string
}): Promise<string> {
  return new SignJWT({ tokenId: payload.tokenId })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.userId)
    .setIssuedAt()
    .setExpirationTime(`${REFRESH_TTL}s`)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .sign(getRefreshSecret())
}

// ─────────────────────────────────────────────────────────────────────────────
// Token verification
// ─────────────────────────────────────────────────────────────────────────────

export async function verifyAccessToken(token: string): Promise<AccessTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getAccessSecret(), {
      issuer:   ISSUER,
      audience: AUDIENCE,
    })
    return payload as AccessTokenPayload
  } catch {
    return null
  }
}

export async function verifyRefreshToken(token: string): Promise<RefreshTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getRefreshSecret(), {
      issuer:   ISSUER,
      audience: AUDIENCE,
    })
    return payload as RefreshTokenPayload
  } catch {
    return null
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Cookie builders
//
// Security properties:
//   - HttpOnly: prevents JS access (XSS mitigation)
//   - Secure: HTTPS-only in production
//   - SameSite=Strict: prevents CSRF
//   - Path scoping: refresh token only sent to /api/auth routes
// ─────────────────────────────────────────────────────────────────────────────

const IS_PROD = env.NODE_ENV === 'production'

export function buildAccessCookie(token: string): string {
  const parts = [
    `access_token=${token}`,
    `Path=/`,
    `Max-Age=${ACCESS_TTL}`,
    `HttpOnly`,
    `SameSite=Strict`,
  ]
  if (IS_PROD) parts.push('Secure')
  if (IS_PROD && env.COOKIE_DOMAIN) parts.push(`Domain=${env.COOKIE_DOMAIN}`)
  return parts.join('; ')
}

export function buildRefreshCookie(token: string): string {
  const parts = [
    `refresh_token=${token}`,
    `Path=/api/auth`,             // scoped — only sent to auth routes
    `Max-Age=${REFRESH_TTL}`,
    `HttpOnly`,
    `SameSite=Strict`,
  ]
  if (IS_PROD) parts.push('Secure')
  if (IS_PROD && env.COOKIE_DOMAIN) parts.push(`Domain=${env.COOKIE_DOMAIN}`)
  return parts.join('; ')
}

export function buildClearAccessCookie(): string {
  return `access_token=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict${IS_PROD ? '; Secure' : ''}`
}

export function buildClearRefreshCookie(): string {
  return `refresh_token=; Path=/api/auth; Max-Age=0; HttpOnly; SameSite=Strict${IS_PROD ? '; Secure' : ''}`
}

/**
 * Set both auth cookies on a NextResponse.
 */
export function setAuthCookies(
  response: NextResponse,
  accessToken: string,
  refreshToken: string,
): void {
  response.headers.append('Set-Cookie', buildAccessCookie(accessToken))
  response.headers.append('Set-Cookie', buildRefreshCookie(refreshToken))
}

/**
 * Clear both auth cookies (logout).
 */
export function clearAuthCookies(response: NextResponse): void {
  response.headers.append('Set-Cookie', buildClearAccessCookie())
  response.headers.append('Set-Cookie', buildClearRefreshCookie())
}

// ─────────────────────────────────────────────────────────────────────────────
// Cookie reader
// ─────────────────────────────────────────────────────────────────────────────

export function getCookieValue(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null
  const match = cookieHeader.split(';').find((c) => c.trim().startsWith(`${name}=`))
  return match ? match.trim().slice(name.length + 1) : null
}

/**
 * Get the authenticated user payload from the request's access token.
 * Returns null if not authenticated or token is invalid/expired.
 */
export async function getAuthUser(request: Request): Promise<AccessTokenPayload | null> {
  const cookieHeader = request.headers.get('cookie')
  const token = getCookieValue(cookieHeader, 'access_token')
  if (!token) return null
  return verifyAccessToken(token)
}

/**
 * Require authentication — throws 401 if not authenticated.
 */
export async function requireAuth(request: Request): Promise<AccessTokenPayload> {
  const user = await getAuthUser(request)
  if (!user) {
    throw Object.assign(new Error('Authentication required'), {
      statusCode: 401,
      code: 'UNAUTHORIZED',
    })
  }
  return user
}

/**
 * Require a specific role — throws 403 if role doesn't match.
 */
export async function requireRole(
  request: Request,
  ...roles: string[]
): Promise<AccessTokenPayload> {
  const user = await requireAuth(request)
  if (!roles.includes(user.role)) {
    throw Object.assign(new Error('Access denied'), {
      statusCode: 403,
      code: 'FORBIDDEN',
    })
  }
  return user
}