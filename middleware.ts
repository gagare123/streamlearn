import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { jwtVerify, type JWTPayload } from 'jose'

// ─────────────────────────────────────────────────────────────────────────────
// Route classification
// ─────────────────────────────────────────────────────────────────────────────

const PUBLIC_PREFIXES = [
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/refresh',
  '/api/auth/verify-email',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/auth/resend-verification',
  '/api/webhooks',
  '/api/health',
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
  '/_next',
  '/favicon.ico',
  '/robots.txt',
  '/sitemap.xml',
  '/dashboard/student/payment-callback',
  '/payment/callback',  
]

const RBAC_RULES: Array<{ prefix: string; roles: string[] }> = [
  { prefix: '/api/admin',        roles: ['ADMIN'] },
  { prefix: '/dashboard/admin',  roles: ['ADMIN'] },
  { prefix: '/api/upload',       roles: ['TUTOR', 'ADMIN'] },
  { prefix: '/dashboard/tutor',  roles: ['TUTOR', 'ADMIN'] },
  { prefix: '/api/auth/me',      roles: ['STUDENT', 'TUTOR', 'ADMIN'] },
  { prefix: '/api/auth/logout',  roles: ['STUDENT', 'TUTOR', 'ADMIN'] },
  { prefix: '/api/courses',      roles: ['STUDENT', 'TUTOR', 'ADMIN'] },
  { prefix: '/api/lessons',      roles: ['STUDENT', 'TUTOR', 'ADMIN'] },
  { prefix: '/api/enrollments',  roles: ['STUDENT', 'TUTOR', 'ADMIN'] },
  { prefix: '/api/progress',     roles: ['STUDENT', 'TUTOR', 'ADMIN'] },
  { prefix: '/api/quizzes',      roles: ['STUDENT', 'TUTOR', 'ADMIN'] },
  { prefix: '/api/notifications',roles: ['STUDENT', 'TUTOR', 'ADMIN'] },
  { prefix: '/api/certificates', roles: ['STUDENT', 'TUTOR', 'ADMIN'] },
  { prefix: '/api/payments',     roles: ['STUDENT', 'TUTOR', 'ADMIN'] },
  { prefix: '/api/users',        roles: ['STUDENT', 'TUTOR', 'ADMIN'] },
  { prefix: '/api/sse',          roles: ['STUDENT', 'TUTOR', 'ADMIN'] },
  { prefix: '/dashboard',        roles: ['STUDENT', 'TUTOR', 'ADMIN'] },
]

// ─────────────────────────────────────────────────────────────────────────────
// Security headers
// ─────────────────────────────────────────────────────────────────────────────

function addSecurityHeaders(response: NextResponse, pathname: string): void {
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-XSS-Protection', '1; mode=block')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(self)')

  if (process.env['NODE_ENV'] === 'production') {
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload')
  }

  // Skip CSP in development to allow React Refresh (needs unsafe-eval)
  if (process.env.NODE_ENV !== 'development') {
    // Content-Security-Policy — skip for API routes (they return JSON, not HTML)
    if (!pathname.startsWith('/api/') && !pathname.startsWith('/_next/')) {
      const csp = buildCSP()
      response.headers.set('Content-Security-Policy', csp)
    }
  }

  if (pathname.startsWith('/api/sse/')) {
    response.headers.set('X-Accel-Buffering', 'no')
    response.headers.set('Cache-Control', 'no-cache, no-transform')
  }
}

function buildCSP(): string {
  const directives: Record<string, string[]> = {
    'default-src':      ["'self'"],
    'script-src':       ["'self'", "'unsafe-inline'", 'https://cdn.mux.com', 'https://js.paystack.co'],
    'style-src':        ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
    'font-src':         ["'self'", 'https://fonts.gstatic.com', 'data:'],
    'img-src':          ["'self'", 'data:', 'blob:', 'https://*.r2.dev', 'https://image.mux.com'],
    'media-src':        ["'self'", 'blob:', 'https://stream.mux.com', 'https://*.r2.dev'],
    'connect-src':      ["'self'", 'https://*.supabase.co', 'https://*.upstash.io', 'https://api.mux.com', 'https://stream.mux.com', 'https://upload.mux.com'],
    'frame-src':        ["'self'", 'https://js.paystack.co'],
    'object-src':       ["'none'"],
    'base-uri':         ["'self'"],
    'form-action':      ["'self'"],
    'frame-ancestors':  ["'none'"],
    'upgrade-insecure-requests': [],
  }

  return Object.entries(directives)
    .map(([k, v]) => v.length ? `${k} ${v.join(' ')}` : k)
    .join('; ')
}

// ─────────────────────────────────────────────────────────────────────────────
// Middleware
// ─────────────────────────────────────────────────────────────────────────────

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl

  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    const res = NextResponse.next()
    addSecurityHeaders(res, pathname)
    return res
  }

  const rule = RBAC_RULES.find((r) => pathname.startsWith(r.prefix))
  const requiresAuth = rule !== undefined
    || pathname.startsWith('/api/')
    || pathname.startsWith('/dashboard')

  if (!requiresAuth) {
    const res = NextResponse.next()
    addSecurityHeaders(res, pathname)
    return res
  }

  const accessToken = request.cookies.get('access_token')?.value
  if (!accessToken) {
    return handleUnauthorized(request, pathname)
  }

  const secret = process.env['JWT_ACCESS_SECRET']
  if (!secret) {
    console.error('[middleware] JWT_ACCESS_SECRET not set')
    return NextResponse.json(
      { success: false, error: 'Server configuration error', code: 'CONFIG_ERROR' },
      { status: 500 },
    )
  }

  let payload: JWTPayload & Record<string, unknown>
  try {
    const result = await jwtVerify(
      accessToken,
      new TextEncoder().encode(secret),
      { issuer: 'streamlearn', audience: 'streamlearn-client' },
    )
    payload = result.payload as typeof payload
  } catch {
    return handleUnauthorized(request, pathname)
  }

  const userId  = payload.sub ?? ''
  const role    = String(payload['role']    ?? '')
  const email   = String(payload['email']   ?? '')
  const tokenId = String(payload['tokenId'] ?? '')

  if (!userId || !role) {
    return handleUnauthorized(request, pathname)
  }

  if (rule && !rule.roles.includes(role)) {
    return handleForbidden(request, pathname, role)
  }

  const reqHeaders = new Headers(request.headers)
  reqHeaders.set('x-user-id',    userId)
  reqHeaders.set('x-user-role',  role)
  reqHeaders.set('x-user-email', email)
  reqHeaders.set('x-token-id',   tokenId)

  const res = NextResponse.next({ request: { headers: reqHeaders } })
  addSecurityHeaders(res, pathname)
  return res
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function handleUnauthorized(req: NextRequest, pathname: string): NextResponse {
  if (pathname.startsWith('/api/')) {
    return NextResponse.json(
      { success: false, error: 'Authentication required', code: 'UNAUTHORIZED' },
      { status: 401 },
    )
  }
  const url = new URL('/login', req.url)
  url.searchParams.set('next', pathname)
  return NextResponse.redirect(url)
}

function handleForbidden(req: NextRequest, pathname: string, role: string): NextResponse {
  if (pathname.startsWith('/api/')) {
    return NextResponse.json(
      { success: false, error: 'Access denied', code: 'FORBIDDEN', role },
      { status: 403 },
    )
  }
  const dashMap: Record<string, string> = {
    STUDENT: '/dashboard/student',
    TUTOR:   '/dashboard/tutor',
    ADMIN:   '/dashboard/admin',
  }
  return NextResponse.redirect(new URL(dashMap[role] ?? '/dashboard/student', req.url))
}

// ─────────────────────────────────────────────────────────────────────────────
// Matcher
// ─────────────────────────────────────────────────────────────────────────────

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|public/).*)'],
}