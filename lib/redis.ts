import { Redis } from '@upstash/redis'

// ─────────────────────────────────────────────────────────────────────────────
// Upstash Redis REST client (singleton)
//
// Uses the REST API — no TCP connection, no persistent socket.
// Safe to use inside both Next.js Route Handlers (serverless) and
// the Background Worker (long-running Node.js process).
// ─────────────────────────────────────────────────────────────────────────────

export const redis = new Redis({
  url:   process.env['UPSTASH_REDIS_REST_URL']   ?? '',
  token: process.env['UPSTASH_REDIS_REST_TOKEN'] ?? '',
})

// ─────────────────────────────────────────────────────────────────────────────
// Key namespace
//
// All Redis keys follow the pattern:
//   {namespace}:{discriminant}
//
// Centralised here to prevent typos and make invalidation auditable.
// ─────────────────────────────────────────────────────────────────────────────

export const RedisKeys = {
  // ── Session management ────────────────────────────────────────────────
  session:              (userId: string, tokenId: string) => `session:${userId}:${tokenId}`,

  // ── Email verification / password reset tokens ─────────────────────
  emailVerifyToken:     (token: string) => `email:verify:${token}`,
  passwordResetToken:   (token: string) => `password:reset:${token}`,

  // ── Course cache ──────────────────────────────────────────────────────
  courseListCache:      () => 'cache:courses:list',
  courseDetailCache:    (courseId: string) => `cache:courses:${courseId}`,

  // ── Student enrollment cache ──────────────────────────────────────────
  studentEnrollmentsCache: (userId: string) => `cache:enrollments:${userId}`,

  // ── Payment idempotency ────────────────────────────────────────────────
  paymentIdempotency:   (key: string) => `payment:idem:${key}`,

  // ── Webhook deduplication locks ────────────────────────────────────────
  muxWebhookLock:       (eventId: string)    => `lock:webhook:mux:${eventId}`,
  paystackWebhookLock:  (reference: string)  => `lock:webhook:paystack:${reference}`,

  // ── Background job queues ─────────────────────────────────────────────
  // LPUSHed by Route Handlers, RPOPed by the Worker
  emailQueue:           () => 'queue:email',
  notificationQueue:    () => 'queue:notifications',
  cleanupQueue:         () => 'queue:cleanup',

  // ── SSE notification bridge ────────────────────────────────────────────
  // LPUSHed by Worker, RPOPed by SSE route
  notificationChannel:  (userId: string) => `sse:notify:${userId}`,

  // ── Rate limit counters ────────────────────────────────────────────────
  // Managed by lib/rate-limit.ts with INCR + EXPIRE
  rateLimitIp:          (ip: string, action: string)     => `rl:ip:${ip}:${action}`,
  rateLimitUser:        (userId: string, action: string) => `rl:user:${userId}:${action}`,
} as const

// ─────────────────────────────────────────────────────────────────────────────
// TTL constants (seconds)
// ─────────────────────────────────────────────────────────────────────────────

export const RedisTTL = {
  SESSION:              7 * 24 * 60 * 60,   // 7 days (matches refresh token)
  EMAIL_VERIFY:         24 * 60 * 60,        // 24 hours
  PASSWORD_RESET:       60 * 60,             // 1 hour
  PAYMENT_IDEMPOTENCY:  24 * 60 * 60,        // 24 hours
  WEBHOOK_LOCK:         60,                  // 60 seconds (dedup window)
  ENROLLMENT_CACHE:     5 * 60,              // 5 minutes
  COURSE_CACHE:         5 * 60,              // 5 minutes
  SSE_CHANNEL:          5 * 60,              // 5 minutes (offline TTL)
} as const

// ─────────────────────────────────────────────────────────────────────────────
// Background Job Payload types
// ─────────────────────────────────────────────────────────────────────────────

export type EmailJobPayload = {
  type: 'email'
  to: string
  subject: string
  html: string
  text?: string
  replyTo?: string
}

export type NotificationJobPayload = {
  type: 'notification'
  userId: string
  notificationId: string
  title: string
  body: string
  actionUrl?: string
}

export type CleanupJobPayload = {
  type: 'cleanup'
  task: 'expire_sessions' | 'purge_old_notifications'
}

export type JobPayload = EmailJobPayload | NotificationJobPayload | CleanupJobPayload

// ─────────────────────────────────────────────────────────────────────────────
// Job queue helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Enqueue a job to the appropriate Redis queue.
 * LPUSHes to the queue — the Background Worker RPOPs.
 */
export async function enqueueJob(job: JobPayload): Promise<void> {
  let queue: string

  switch (job.type) {
    case 'email':        queue = RedisKeys.emailQueue();        break
    case 'notification': queue = RedisKeys.notificationQueue(); break
    case 'cleanup':      queue = RedisKeys.cleanupQueue();      break
  }

  await redis.lpush(queue, JSON.stringify(job))
}