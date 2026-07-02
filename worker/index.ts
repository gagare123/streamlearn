/**
 * StreamLearn Background Worker — Phase 8 Complete
 *
 * Deployed as a Render Background Worker (separate process, same repo).
 * Start command: tsx worker/index.ts
 *
 * Responsibilities:
 *   - Email delivery via Nodemailer + Gmail SMTP
 *   - Notification persistence to DB + SSE bridge push
 *   - Cleanup jobs
 *
 * Architecture:
 *   - Polls Upstash Redis via REST API (no TCP / no ioredis)
 *   - LPUSHed by web service, RPOPed here — FIFO order
 *   - Dead-letter: failed jobs logged; retries via separate DLQ (future)
 */

import dotenv from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

// Load .env from the project root BEFORE anything else
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
dotenv.config({ path: resolve(__dirname, '..', '.env') })

import { redis, RedisKeys, type JobPayload } from '../lib/redis'
import { sendEmail, verifySMTP } from '../lib/email/sender'
import { db, notifications, users, type NewNotification } from '../db/index'
import { eq } from 'drizzle-orm'

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 1_000
const MAX_JOBS_PER_TICK = 10

const QUEUES = [
  RedisKeys.emailQueue(),
  RedisKeys.notificationQueue(),
  RedisKeys.cleanupQueue(),
] as const

// ─────────────────────────────────────────────────────────────────────────────
// Email job handler
// ─────────────────────────────────────────────────────────────────────────────

async function handleEmailJob(
  job: Extract<JobPayload, { type: 'email' }>,
): Promise<void> {
  console.log(`[worker:email] Sending to ${job.to} | "${job.subject}"`)

  await sendEmail({
    to: job.to,
    subject: job.subject,
    html: job.html,
    ...(job.text ? { text: job.text } : {}),
    ...(job.replyTo ? { replyTo: job.replyTo } : {}),
  })

  console.log(`[worker:email] Delivered to ${job.to}`)
}

// ─────────────────────────────────────────────────────────────────────────────
// Notification job handler
// ─────────────────────────────────────────────────────────────────────────────

async function handleNotificationJob(
  job: Extract<JobPayload, { type: 'notification' }>,
): Promise<void> {
  console.log(`[worker:notification] → user:${job.userId} | "${job.title}"`)

  const [user] = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(eq(users.id, job.userId))
    .limit(1)

  if (!user) {
    console.warn(`[worker:notification] User ${job.userId} not found — skipping`)
    return
  }

  const typeMap: Record<string, string> = {
    'enroll':    'ENROLLMENT',
    'payment':   'PAYMENT',
    'quiz':      'QUIZ_RESULT',
    'cert':      'CERTIFICATE',
    'course':    'COURSE_UPDATE',
  }

  let notifType = 'SYSTEM'
  const idLower = job.notificationId.toLowerCase()
  for (const [key, val] of Object.entries(typeMap)) {
    if (idLower.includes(key)) { notifType = val; break }
  }

  const entry: NewNotification = {
    userId: job.userId,
    type: notifType as NewNotification['type'],
    title: job.title,
    body: job.body,
    isRead: false,
    actionUrl: job.actionUrl ?? null,
  }

  const [inserted] = await db
    .insert(notifications)
    .values(entry)
    .returning({ id: notifications.id })
    .onConflictDoNothing()

  const ssePayload = JSON.stringify({
    id: inserted?.id ?? job.notificationId,
    type: notifType,
    title: job.title,
    body: job.body,
    actionUrl: job.actionUrl,
    createdAt: new Date().toISOString(),
  })

  await redis.lpush(RedisKeys.notificationChannel(job.userId), ssePayload)
  await redis.expire(RedisKeys.notificationChannel(job.userId), 300)

  console.log(`[worker:notification] Delivered: ${inserted?.id} → ${job.userId}`)
}

// ─────────────────────────────────────────────────────────────────────────────
// Cleanup job handler
// ─────────────────────────────────────────────────────────────────────────────

async function handleCleanupJob(
  job: Extract<JobPayload, { type: 'cleanup' }>,
): Promise<void> {
  console.log(`[worker:cleanup] task: ${job.task}`)

  switch (job.task) {
    case 'expire_sessions':
      break

    case 'purge_old_notifications':
      await db.execute(
        `DELETE FROM notifications
         WHERE is_read = true
           AND created_at < NOW() - INTERVAL '30 days'` as unknown as Parameters<typeof db.execute>[0],
      )
      console.log('[worker:cleanup] Purged old read notifications')
      break

    default:
      console.warn(`[worker:cleanup] Unknown task: ${job.task}`)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Job dispatcher
// ─────────────────────────────────────────────────────────────────────────────

async function processJob(raw: unknown): Promise<void> {
  let job: JobPayload

  try {
    // Handle both string and already-parsed object
    job = (typeof raw === 'string' ? JSON.parse(raw) : raw) as JobPayload
  } catch {
    console.error('[worker] Unparseable job payload — skipping:', String(raw).slice(0, 200))
    return
  }

  try {
    switch (job.type) {
      case 'email':
        await handleEmailJob(job)
        break
      case 'notification':
        await handleNotificationJob(job)
        break
      case 'cleanup':
        await handleCleanupJob(job)
        break
      default: {
        const _exhaustive: never = job
        console.warn('[worker] Unknown job type — skipping:', (_exhaustive as { type: string }).type)
      }
    }
  } catch (err) {
    console.error(`[worker] Job processing failed (type=${job.type}):`, err)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Poll tick
// ─────────────────────────────────────────────────────────────────────────────

async function tick(): Promise<void> {
  for (const queue of QUEUES) {
    let processed = 0
    while (processed < MAX_JOBS_PER_TICK) {
      let raw: unknown = null
      try {
        raw = await redis.rpop<string>(queue)
      } catch (err) {
        console.error(`[worker] Redis RPOP failed on "${queue}":`, err)
        break
      }
      if (raw === null) break
      await processJob(raw)
      processed++
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main loop
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<never> {
  console.log('═══════════════════════════════════════════════')
  console.log(' StreamLearn Background Worker — Phase 8')
  console.log(' Node.js', process.version)
  console.log(' Queues:', QUEUES.join(', '))
  console.log('═══════════════════════════════════════════════')

  process.on('SIGTERM', () => { console.log('[worker] SIGTERM — shutting down'); process.exit(0) })
  process.on('SIGINT',  () => { console.log('[worker] SIGINT — shutting down');  process.exit(0) })
  process.on('unhandledRejection', (reason) => {
    console.error('[worker] Unhandled rejection:', reason)
  })

  try {
    await redis.ping()
    console.log('[worker] Redis: connected ✓')
  } catch (err) {
    console.error('[worker] Redis: connection failed — exiting', err)
    process.exit(1)
  }

  try {
    await verifySMTP()
    console.log('[worker] SMTP: connected ✓')
  } catch (err) {
    console.warn('[worker] SMTP: connection failed — emails will fail:', err)
  }

  try {
    await db.execute('SELECT 1' as unknown as Parameters<typeof db.execute>[0])
    console.log('[worker] PostgreSQL: connected ✓')
  } catch (err) {
    console.error('[worker] PostgreSQL: connection failed — exiting', err)
    process.exit(1)
  }

  console.log('[worker] Started. Polling every', POLL_INTERVAL_MS, 'ms\n')

  while (true) {
    try {
      await tick()
    } catch (err) {
      console.error('[worker] Tick error:', err)
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
  }
}

main().catch((err) => {
  console.error('[worker] Fatal error:', err)
  process.exit(1)
})