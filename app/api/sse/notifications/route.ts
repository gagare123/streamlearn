import { requireIdentity } from '@/lib/rbac'
import { redis, RedisKeys } from '@/lib/redis'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/sse/notifications
//
// Server-Sent Events stream for real-time notifications.
//
// Architecture:
//   - This endpoint holds an open HTTP connection per connected client
//   - Every 2 seconds it RPOPs from the user's Redis notification channel
//   - The Background Worker LPUSHes notification payloads there
//   - Heartbeat comment every 30s prevents Render's 55s timeout
//
// Client usage:
//   const es = new EventSource('/api/sse/notifications')
//   es.addEventListener('notification', (e) => console.log(JSON.parse(e.data)))
//   es.addEventListener('heartbeat', () => {}) // keep-alive
//
// Security: JWT verified before the stream opens.
// ─────────────────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 2_000   // poll Redis every 2 seconds
const HEARTBEAT_INTERVAL_MS = 30_000  // send heartbeat every 30 seconds

export async function GET(request: Request): Promise<Response> {
  // ── Auth ───────────────────────────────────────────────────────────────────
  let identity: ReturnType<typeof requireIdentity>
  try {
    identity = requireIdentity(request)
  } catch {
    return new Response('Unauthorized', { status: 401 })
  }

  const userId = identity.userId
  const channelKey = RedisKeys.notificationChannel(userId)

  let closed = false
  let pollTimer: ReturnType<typeof setInterval> | null = null
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    start(controller) {
      // Send initial connection confirmation
      controller.enqueue(
        encoder.encode('event: connected\ndata: {"connected":true}\n\n'),
      )

      // ── Poll Redis for notification payloads ──────────────────────────
      pollTimer = setInterval(async () => {
        if (closed) return
        try {
          // RPOP up to 5 notifications per tick
          for (let i = 0; i < 5; i++) {
            const raw = await redis.rpop<string>(channelKey)
            if (!raw) break

            const payload = typeof raw === 'string' ? raw : JSON.stringify(raw)
            controller.enqueue(
              encoder.encode(`event: notification\ndata: ${payload}\n\n`),
            )
          }
        } catch {
          // Redis error — don't crash the stream, just skip this tick
        }
      }, POLL_INTERVAL_MS)

      // ── Heartbeat to keep the connection alive ────────────────────────
      // Render.com closes connections after 55 seconds of no data.
      // A heartbeat comment every 30 seconds keeps it alive.
      heartbeatTimer = setInterval(() => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'))
        } catch {
          // Stream may already be closed
        }
      }, HEARTBEAT_INTERVAL_MS)
    },

    cancel() {
      // Client disconnected — clean up timers
      closed = true
      if (pollTimer) clearInterval(pollTimer)
      if (heartbeatTimer) clearInterval(heartbeatTimer)
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // disable nginx buffering
    },
  })
}