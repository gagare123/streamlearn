import { redis } from './redis'
import { NextResponse } from 'next/server'

// ─────────────────────────────────────────────────────────────────────────────
// Response Cache Helpers
//
// Wraps route handlers with Redis caching.
// Critical for 3G: a cached response is served in ~50ms instead of ~300ms
// (DB query + processing time).
//
// Cache invalidation is handled explicitly when data changes
// (see redis.ts RedisKeys for all cache key patterns).
// ─────────────────────────────────────────────────────────────────────────────

type CacheOptions = {
  /** Redis key for this cached response */
  key: string
  /** TTL in seconds */
  ttl: number
  /** Extra response headers to add (e.g. Content-Type for CSV) */
  headers?: Record<string, string>
}

/**
 * Wraps an async route handler with a Redis read-through cache.
 *
 * If the cache has a hit, returns the cached JSON immediately.
 * If not, runs the handler, stores the result, and returns it.
 *
 * Usage:
 * ```ts
 * return withCache({ key: 'courses:list', ttl: 300 }, async () => {
 *   const courses = await db.select()...
 *   return NextResponse.json({ success: true, data: { courses } })
 * })
 * ```
 */
export async function withCache(
  options: CacheOptions,
  handler: () => Promise<NextResponse>,
): Promise<NextResponse> {
  const { key, ttl, headers = {} } = options

  // ── Cache read ─────────────────────────────────────────────────────────
  try {
    const cached = await redis.get<string>(key)
    if (cached) {
      const body = typeof cached === 'string' ? cached : JSON.stringify(cached)
      return new NextResponse(body, {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'X-Cache': 'HIT',
          ...headers,
        },
      })
    }
  } catch (err) {
    // Redis failure — fall through to handler (graceful degradation)
    console.warn('[cache] Redis read failed, falling through to handler:', err)
  }

  // ── Run handler ────────────────────────────────────────────────────────
  const response = await handler()

  // ── Cache write (only 2xx responses) ──────────────────────────────────
  if (response.status >= 200 && response.status < 300) {
    try {
      const bodyText = await response.clone().text()
      await redis.set(key, bodyText, { ex: ttl })
    } catch (err) {
      console.warn('[cache] Redis write failed:', err)
    }
  }

  // Add cache MISS header
  response.headers.set('X-Cache', 'MISS')

  return response
}

/**
 * Invalidate one or more cache keys.
 * Call this whenever data changes (e.g. after INSERT, UPDATE, DELETE).
 */
export async function invalidateCache(...keys: string[]): Promise<void> {
  if (keys.length === 0) return
  try {
    await Promise.all(keys.map((k) => redis.del(k)))
  } catch (err) {
    console.warn('[cache] Invalidation failed:', err)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TTL presets (seconds)
// ─────────────────────────────────────────────────────────────────────────────

export const CacheTTL = {
  /** Course catalogue — changes when courses are published */
  COURSE_LIST: 300,          // 5 minutes
  /** Single course detail — changes on lesson add/publish */
  COURSE_DETAIL: 300,        // 5 minutes
  /** Student enrollments — changes on enroll/progress */
  ENROLLMENTS: 300,          // 5 minutes
  /** Admin stats — can be slightly stale */
  ADMIN_STATS: 120,          // 2 minutes
  /** Notifications — short TTL, user expects near-real-time */
  NOTIFICATIONS: 30,         // 30 seconds
} as const