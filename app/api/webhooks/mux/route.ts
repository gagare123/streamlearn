import { NextResponse } from 'next/server'
import { db, lessons } from '@db/index'
import { eq } from 'drizzle-orm'
import { verifyMuxWebhook } from '@/lib/mux'
import { writeAuditLog } from '@/lib/audit'
import { redis, RedisKeys, RedisTTL } from '@/lib/redis'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/webhooks/mux
//
// Mux sends webhook events when:
//   • video.upload.asset_created  — upload linked to an asset
//   • video.asset.ready           — transcoding complete, playback available
//   • video.asset.errored         — transcoding failed
//   • video.asset.deleted         — asset removed
//
// Security: HMAC-SHA256 signature verified before any processing.
// Idempotency: Redis lock (60s TTL) prevents duplicate processing.
//
// Note: This endpoint is PUBLIC (no JWT) — Mux calls it directly.
// Authentication is via HMAC signature only.
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(request: Request): Promise<NextResponse> {
  // ── 1. Read raw body (must be raw for HMAC verification) ──────────────
  const rawBody = await request.text()
  const signature = request.headers.get('mux-signature') ?? ''

  // ── 2. Verify HMAC signature ──────────────────────────────────────────
  const valid = await verifyMuxWebhook(rawBody, signature)
  if (!valid) {
    console.warn('[webhook/mux] Invalid signature — rejected')
    return NextResponse.json(
      { success: false, error: 'Invalid signature' },
      { status: 401 },
    )
  }

  // ── 3. Parse event ─────────────────────────────────────────────────────
  let event: MuxEvent
  try {
    event = JSON.parse(rawBody) as MuxEvent
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON payload' },
      { status: 400 },
    )
  }

  // ── 4. Idempotency — skip if already processed ─────────────────────────
  const lockKey = RedisKeys.muxWebhookLock(event.id)
  const alreadyProcessed = await redis.set(lockKey, '1', {
    ex: RedisTTL.WEBHOOK_LOCK,
    nx: true,
  })

  if (!alreadyProcessed) {
    console.log(`[webhook/mux] Duplicate event ${event.id} — skipping`)
    return NextResponse.json({ success: true, data: { skipped: true } })
  }

  // ── 5. Dispatch to handler ─────────────────────────────────────────────
  try {
    await handleMuxEvent(event)
  } catch (err) {
    console.error(`[webhook/mux] Error handling event ${event.type}:`, err)
    // Return 200 to Mux — we don't want Mux to retry on our own errors
    // (we have the lock in Redis anyway so retries would be skipped)
    return NextResponse.json({ success: true, data: { error: 'processing_error' } })
  }

  return NextResponse.json({ success: true, data: { received: true } })
}

// ─────────────────────────────────────────────────────────────────────────────
// Event type definitions (subset we care about)
// ─────────────────────────────────────────────────────────────────────────────

type MuxEvent = {
  id: string
  type: string
  data: {
    id: string                     // asset ID
    upload_id?: string             // upload ID (present on upload events)
    playback_ids?: Array<{ id: string; policy: string }>
    duration?: number              // seconds
    status?: string
    errors?: { type: string; messages: string[] }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Event handlers
// ─────────────────────────────────────────────────────────────────────────────

async function handleMuxEvent(event: MuxEvent): Promise<void> {
  const { type, data } = event

  await writeAuditLog({
    actorId: null,
    action: 'webhook.mux.received',
    metadata: { eventId: event.id, type, assetId: data.id, uploadId: data.upload_id },
  })

  switch (type) {
    case 'video.upload.asset_created':
      await handleUploadAssetCreated(data)
      break

    case 'video.asset.ready':
      await handleAssetReady(data)
      break

    case 'video.asset.errored':
      await handleAssetErrored(data)
      break

    // video.asset.deleted — no action needed (we track in DB separately)
    default:
      // Ignore other event types gracefully
      break
  }
}

/**
 * video.upload.asset_created
 * Mux has received the uploaded video and created an asset.
 * We store the assetId and move status to PREPARING.
 */
async function handleUploadAssetCreated(data: MuxEvent['data']): Promise<void> {
  if (!data.upload_id) return

  const [lesson] = await db
    .select({ id: lessons.id })
    .from(lessons)
    .where(eq(lessons.muxUploadId, data.upload_id))
    .limit(1)

  if (!lesson) {
    console.warn(`[webhook/mux] No lesson found for uploadId=${data.upload_id}`)
    return
  }

  await db.update(lessons).set({
    muxAssetId: data.id,
    muxAssetStatus: 'PREPARING',
    updatedAt: new Date(),
  }).where(eq(lessons.id, lesson.id))

  console.log(`[webhook/mux] asset_created: lesson=${lesson.id} asset=${data.id}`)
}

/**
 * video.asset.ready
 * Transcoding complete. Store the playback ID and duration.
 */
async function handleAssetReady(data: MuxEvent['data']): Promise<void> {
  const publicPlayback = data.playback_ids?.find((p) => p.policy === 'public')

  const [lesson] = await db
    .select({ id: lessons.id, sectionId: lessons.sectionId })
    .from(lessons)
    .where(eq(lessons.muxAssetId, data.id))
    .limit(1)

  if (!lesson) {
    console.warn(`[webhook/mux] No lesson found for assetId=${data.id}`)
    return
  }

  await db.update(lessons).set({
    muxPlaybackId: publicPlayback?.id ?? null,
    muxAssetStatus: 'READY',
    durationSeconds: data.duration ? Math.round(data.duration) : 0,
    updatedAt: new Date(),
  }).where(eq(lessons.id, lesson.id))

  // Update the course's total duration
  await db.execute(
    `UPDATE courses
     SET total_duration_seconds = (
       SELECT COALESCE(SUM(l.duration_seconds), 0)
       FROM lessons l
       INNER JOIN course_sections cs ON l.section_id = cs.id
       WHERE cs.course_id = (
         SELECT cs2.course_id FROM course_sections cs2 WHERE cs2.id = '${lesson.sectionId}'
       )
     ),
     updated_at = NOW()
     WHERE id = (
       SELECT cs.course_id FROM course_sections cs WHERE cs.id = '${lesson.sectionId}'
     )` as unknown as Parameters<typeof db.execute>[0],
  )

  await writeAuditLog({
    actorId: null,
    action: 'webhook.mux.asset_ready',
    targetType: 'lesson',
    targetId: lesson.id,
    metadata: { assetId: data.id, playbackId: publicPlayback?.id, duration: data.duration },
  })

  console.log(`[webhook/mux] asset_ready: lesson=${lesson.id} playback=${publicPlayback?.id}`)
}

/**
 * video.asset.errored
 * Transcoding failed. Mark the lesson as errored.
 */
async function handleAssetErrored(data: MuxEvent['data']): Promise<void> {
  const [lesson] = await db
    .select({ id: lessons.id })
    .from(lessons)
    .where(eq(lessons.muxAssetId, data.id))
    .limit(1)

  if (!lesson) return

  await db.update(lessons).set({
    muxAssetStatus: 'ERRORED',
    updatedAt: new Date(),
  }).where(eq(lessons.id, lesson.id))

  await writeAuditLog({
    actorId: null,
    action: 'webhook.mux.asset_errored',
    targetType: 'lesson',
    targetId: lesson.id,
    metadata: { assetId: data.id, errors: data.errors },
  })

  console.error(`[webhook/mux] asset_errored: lesson=${lesson.id}`, data.errors)
}