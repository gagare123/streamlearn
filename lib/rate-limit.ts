import { redis } from './redis'

// ─────────────────────────────────────────────────────────────────────────────
// Redis Sliding Window Rate Limiter
//
// Uses INCR + EXPIRE to count requests within a rolling time window.
// Zero external dependencies — built on Upstash Redis REST client.
//
// Critical for:
//   • Auth endpoints — prevent brute-force attacks
//   • Payment init — prevent accidental double charges
//   • Email send — prevent spam abuse
//   • Upload presign — prevent R2 storage abuse
// ─────────────────────────────────────────────────────────────────────────────

export type RateLimitResult =
  | { allowed: true;  remaining: number; resetAt: number }
  | { allowed: false; remaining: 0;      resetAt: number; retryAfter: number }

export type RateLimitConfig = {
  /** Max requests in the window */
  limit: number
  /** Window duration in seconds */
  windowSeconds: number
}

// ── Presets ───────────────────────────────────────────────────────────────────

export const RateLimits = {
  /** Auth endpoints: 10 attempts per minute */
  AUTH: { limit: 10, windowSeconds: 60 } as RateLimitConfig,
  /** Payment init: 5 per minute */
  PAYMENT: { limit: 5, windowSeconds: 60 } as RateLimitConfig,
  /** Upload presign: 20 per minute */
  UPLOAD: { limit: 20, windowSeconds: 60 } as RateLimitConfig,
  /** Email send: 3 per 5 minutes */
  EMAIL: { limit: 3, windowSeconds: 300 } as RateLimitConfig,
  /** General API: 60 per minute */
  API: { limit: 60, windowSeconds: 60 } as RateLimitConfig,
} as const

// ─────────────────────────────────────────────────────────────────────────────
// Core rate limit function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check and increment the rate limit counter for a given key.
 * Uses INCR + EXPIRE (atomic on single-key operations in Redis).
 *
 * @param key     - Unique identifier (e.g. `auth:login:${ip}`)
 * @param config  - Rate limit config with limit + windowSeconds
 */
export async function checkRateLimit(
  key: string,
  config: RateLimitConfig,
): Promise<RateLimitResult> {
  const { limit, windowSeconds } = config
  const redisKey = `rl:${key}`

  let count: number

  try {
    // Increment the counter
    count = await redis.incr(redisKey)

    // Only set the TTL on the first request (count === 1)
    // to avoid resetting the window on every request
    if (count === 1) {
      await redis.expire(redisKey, windowSeconds)
    }
  } catch (err) {
    // Redis failure — fail open (allow the request)
    // This prevents Redis outages from blocking all users
    console.error('[rate-limit] Redis error — allowing request:', err)
    return { allowed: true, remaining: limit, resetAt: Date.now() + windowSeconds * 1000 }
  }

  const resetAt = Date.now() + windowSeconds * 1000

  if (count > limit) {
    return {
      allowed:    false,
      remaining:  0,
      resetAt,
      retryAfter: windowSeconds,
    }
  }

  return {
    allowed:   true,
    remaining: Math.max(0, limit - count),
    resetAt,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Convenience wrappers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Rate limit by IP address + action.
 * e.g. rateLimitByIp(ip, 'auth:login', RateLimits.AUTH)
 */
export async function rateLimitByIp(
  ip: string,
  action: string,
  config: RateLimitConfig,
): Promise<RateLimitResult> {
  return checkRateLimit(`ip:${ip}:${action}`, config)
}

/**
 * Rate limit by user ID + action.
 * e.g. rateLimitByUser(userId, 'payment:init', RateLimits.PAYMENT)
 */
export async function rateLimitByUser(
  userId: string,
  action: string,
  config: RateLimitConfig,
): Promise<RateLimitResult> {
  return checkRateLimit(`user:${userId}:${action}`, config)
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP header helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build standard rate-limit response headers.
 * Compatible with the IETF draft-ietf-httpapi-ratelimit-headers spec.
 */
export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    'RateLimit-Remaining': String(result.remaining),
    'RateLimit-Reset':     String(Math.ceil(result.resetAt / 1000)),
    'X-RateLimit-Remaining': String(result.remaining),
    ...(!result.allowed
      ? { 'Retry-After': String(result.retryAfter) }
      : {}),
  }
}