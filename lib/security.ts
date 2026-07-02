import { createHmac, timingSafeEqual } from 'crypto'

// ─────────────────────────────────────────────────────────────────────────────
// Security Utilities — Phase 12
//
// Centralises all security-sensitive operations:
//   - Input sanitisation (prevents XSS, SQL injection surface reduction)
//   - HMAC generation and constant-time comparison
//   - Content Security Policy header builder
//   - Request origin validation (CSRF protection for non-idempotent routes)
//   - Suspicious payload detection
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Input sanitisation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Strip HTML tags and dangerous characters from user-supplied strings.
 * Used on all text fields before DB writes.
 */
export function sanitiseText(input: string, maxLength = 2000): string {
  return input
    .slice(0, maxLength)
    .replace(/<[^>]*>/g, '')          // strip HTML tags
    .replace(/javascript:/gi, '')     // strip JS protocol
    .replace(/on\w+\s*=/gi, '')       // strip event handlers
    .trim()
}

/**
 * Sanitise a URL — only allow http(s) URLs.
 * Returns null if the URL is suspicious.
 */
export function sanitiseUrl(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (!['http:', 'https:'].includes(parsed.protocol)) return null
    return parsed.toString()
  } catch {
    return null
  }
}

/**
 * Strip all non-alphanumeric characters except spaces and hyphens.
 * Useful for search queries to prevent injection attempts.
 */
export function sanitiseSearch(input: string, maxLength = 100): string {
  return input
    .slice(0, maxLength)
    .replace(/[^\w\s\-@.]/g, '')
    .trim()
}

/**
 * Validate an email address format.
 */
export function isValidEmail(email: string): boolean {
  // RFC 5322 simplified — good enough for validation before DB write
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) && email.length <= 254
}

// ─────────────────────────────────────────────────────────────────────────────
// Timing-safe string comparison
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Constant-time string comparison to prevent timing attacks.
 * Use for comparing secrets, tokens, and signatures.
 */
export function safeCompare(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a.padEnd(64))
    const bufB = Buffer.from(b.padEnd(64))
    // timingSafeEqual requires equal-length buffers
    const lenA = Buffer.allocUnsafe(4)
    const lenB = Buffer.allocUnsafe(4)
    lenA.writeUInt32BE(a.length, 0)
    lenB.writeUInt32BE(b.length, 0)
    const lenMatch = timingSafeEqual(lenA, lenB)
    const valMatch = timingSafeEqual(bufA, bufB)
    return lenMatch && valMatch
  } catch {
    return false
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HMAC helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate an HMAC-SHA256 signature.
 * Used internally for signing sensitive data (not exposed in API).
 */
export function hmacSha256(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex')
}

/**
 * Verify an HMAC-SHA256 signature using constant-time comparison.
 */
export function verifyHmacSha256(
  secret: string,
  payload: string,
  signature: string,
): boolean {
  const expected = hmacSha256(secret, payload)
  return safeCompare(expected, signature)
}

// ─────────────────────────────────────────────────────────────────────────────
// Content Security Policy
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a Content-Security-Policy header value.
 * Tailored for StreamLearn:
 *   - Mux video player scripts/iframes
 *   - Cloudflare R2 images
 *   - Google Fonts
 *   - Paystack payment iframe
 */
export function buildCSP(nonce?: string): string {
  const nonceStr = nonce ? `'nonce-${nonce}'` : ''

  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': [
      "'self'",
      nonceStr,
      "'strict-dynamic'",
      'https://cdn.mux.com',                    // Mux player scripts
      'https://js.paystack.co',                  // Paystack checkout
    ].filter(Boolean),
    'style-src': [
      "'self'",
      "'unsafe-inline'",                         // Tailwind inline styles (necessary)
      'https://fonts.googleapis.com',
    ],
    'font-src': [
      "'self'",
      'https://fonts.gstatic.com',
    ],
    'img-src': [
      "'self'",
      'data:',
      'blob:',
      'https://*.r2.dev',                        // R2 public CDN
      'https://image.mux.com',                   // Mux thumbnails
      'https://*.cloudflare.com',
    ],
    'media-src': [
      "'self'",
      'blob:',
      'https://stream.mux.com',                  // Mux HLS
      'https://*.r2.dev',
    ],
    'frame-src': [
      "'self'",
      'https://js.paystack.co',                  // Paystack iframe
    ],
    'connect-src': [
      "'self'",
      'https://api.mux.com',
      'https://stream.mux.com',
      'https://upload.mux.com',
      'https://*.r2.dev',
      'https://*.upstash.io',                    // Upstash Redis
    ],
    'object-src': ["'none'"],
    'base-uri':   ["'self'"],
    'form-action':["'self'"],
    'frame-ancestors': ["'none'"],               // Prevents clickjacking
    'upgrade-insecure-requests': [],
  }

  return Object.entries(directives)
    .map(([key, values]) =>
      values.length > 0 ? `${key} ${values.join(' ')}` : key,
    )
    .join('; ')
}

// ─────────────────────────────────────────────────────────────────────────────
// Origin validation (CSRF protection)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate that a request originates from an allowed domain.
 * Applied to all non-idempotent API routes (POST, PATCH, DELETE, PUT).
 *
 * Uses the Origin header (set automatically by browsers on cross-origin requests).
 * Webhook endpoints are excluded — they use HMAC signature auth instead.
 */
export function validateOrigin(
  request: Request,
  allowedOrigins: string[],
): boolean {
  const origin = request.headers.get('origin')

  // No Origin header — request is from the same origin or a server-to-server call
  // Allow: curl, Postman, server-side fetches
  if (!origin) return true

  // Check if the origin is in the allowed list
  return allowedOrigins.some((allowed) => {
    // Exact match or subdomain match
    return origin === allowed || origin.endsWith(`.${allowed.replace(/^https?:\/\//, '')}`)
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Suspicious payload detection
// ─────────────────────────────────────────────────────────────────────────────

const SQL_INJECTION_PATTERNS = [
  /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION|DECLARE)\b)/i,
  /(-{2}|\/\*|\*\/)/,         // SQL comments
  /;\s*(DROP|DELETE|UPDATE)/i, // stacked queries
]

const XSS_PATTERNS = [
  /<script[\s>]/i,
  /javascript\s*:/i,
  /on\w+\s*=\s*["']/i,
  /data\s*:\s*text\/html/i,
]

/**
 * Check if a string contains suspicious patterns.
 * Used as a defence-in-depth layer on top of parameterised queries.
 * Returns true if suspicious content is detected.
 */
export function isSuspicious(input: string): boolean {
  return (
    SQL_INJECTION_PATTERNS.some((p) => p.test(input)) ||
    XSS_PATTERNS.some((p) => p.test(input))
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Password strength
// ─────────────────────────────────────────────────────────────────────────────

export type PasswordStrength = {
  score: 0 | 1 | 2 | 3 | 4
  label: 'Too weak' | 'Weak' | 'Fair' | 'Good' | 'Strong'
  checks: {
    length: boolean
    uppercase: boolean
    number: boolean
    special: boolean
    notCommon: boolean
  }
}

const COMMON_PASSWORDS = new Set([
  'password', '12345678', 'password1', 'qwerty123',
  'iloveyou', 'admin123', 'letmein1', 'welcome1',
])

export function checkPasswordStrength(password: string): PasswordStrength {
  const checks = {
    length:    password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    number:    /[0-9]/.test(password),
    special:   /[^A-Za-z0-9]/.test(password),
    notCommon: !COMMON_PASSWORDS.has(password.toLowerCase()),
  }

  const score = Object.values(checks).filter(Boolean).length as 0 | 1 | 2 | 3 | 4
  const labels = ['Too weak', 'Weak', 'Fair', 'Good', 'Strong'] as const

  return { score, label: labels[score] ?? 'Too weak', checks }
}

// ─────────────────────────────────────────────────────────────────────────────
// File upload validation
// ─────────────────────────────────────────────────────────────────────────────

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
])

const DANGEROUS_EXTENSIONS = new Set([
  'exe', 'sh', 'bat', 'cmd', 'ps1', 'vbs', 'js', 'ts',
  'php', 'py', 'rb', 'jar', 'war', 'dll', 'so',
])

export function validateUpload(filename: string, mimeType: string, sizeBytes: number, maxBytes: number): {
  valid: boolean; reason?: string
} {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''

  if (DANGEROUS_EXTENSIONS.has(ext)) {
    return { valid: false, reason: `File type .${ext} is not allowed` }
  }

  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    return { valid: false, reason: `MIME type ${mimeType} is not allowed` }
  }

  if (sizeBytes > maxBytes) {
    return { valid: false, reason: `File exceeds ${Math.round(maxBytes / (1024 * 1024))} MB limit` }
  }

  return { valid: true }
}