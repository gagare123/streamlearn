import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/health
//
// Used by Render.com to check if the web service is healthy.
// Also useful for monitoring tools (UptimeRobot, Better Uptime, etc.)
//
// Checks:
//   - DB reachability (simple SELECT 1)
//   - Redis reachability (PING)
//
// Returns 200 if all healthy, 503 if any check fails.
// ─────────────────────────────────────────────────────────────────────────────

type CheckResult = {
  ok: boolean
  latencyMs: number
  error?: string
}

async function checkDatabase(): Promise<CheckResult> {
  const start = Date.now()
  try {
    // Dynamic import to avoid loading DB at module level (edge-safe)
    const { db } = await import('@db/index')
    await db.execute('SELECT 1' as any)
    return { ok: true, latencyMs: Date.now() - start }
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : 'Unknown DB error',
    }
  }
}

async function checkRedis(): Promise<CheckResult> {
  const start = Date.now()
  try {
    const { redis } = await import('@lib/redis')
    const pong = await redis.ping()
    if (pong !== 'PONG') throw new Error(`Unexpected PING response: ${pong}`)
    return { ok: true, latencyMs: Date.now() - start }
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : 'Unknown Redis error',
    }
  }
}

export async function GET(): Promise<NextResponse> {
  const start = Date.now()

  // Run checks in parallel
  const [db, redis] = await Promise.all([checkDatabase(), checkRedis()])

  const allHealthy = db.ok && redis.ok
  const status = allHealthy ? 200 : 503

  return NextResponse.json(
    {
      status: allHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env['npm_package_version'] ?? '0.1.0',
      checks: {
        database: {
          status:    db.ok ? 'up' : 'down',
          latencyMs: db.latencyMs,
          ...(db.error ? { error: db.error } : {}),
        },
        redis: {
          status:    redis.ok ? 'up' : 'down',
          latencyMs: redis.latencyMs,
          ...(redis.error ? { error: redis.error } : {}),
        },
      },
      totalMs: Date.now() - start,
    },
    {
      status,
      headers: {
        'Cache-Control': 'no-store, no-cache',
        'Content-Type': 'application/json',
      },
    },
  )
}