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
//   • video.asset.created         — asset created
//   • video.asset.ready           — transcoding complete, playback available
//   • video.asset.errored         — transcoding failed
//
// Security: HMAC-SHA256 signature verified before any processing.
// Idempotency: Redis lock (60s TTL) prevents duplicate processing.
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(request: Request): Promise<NextResponse> {
  const rawBody = await request.text()
  const signature = request.headers.get('mux-signature') ?? ''

  const valid = await verifyMuxWebhook(rawBody, signature)
  if (!valid) {
    console.warn('[webhook/mux] Invalid signature — rejected')
    return NextResponse.json(
      { success: false, error: 'Invalid signature' },
      { status: 401 },
    )
  }

  let event: MuxEvent
  try {
    event = JSON.parse(rawBody) as MuxEvent
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON payload' },
      { status: 400 },
    )
  }

  const lockKey = RedisKeys.muxWebhookLock(event.id)
  const alreadyProcessed = await redis.set(lockKey, '1', {
    ex: RedisTTL.WEBHOOK_LOCK,
    nx: true,
  })

  if (!alreadyProcessed) {
    console.log(`[webhook/mux] Duplicate event ${event.id} — skipping`)
    return NextResponse.json({ success: true, data: { skipped: true } })
  }

  try {
    await handleMuxEvent(event)
  } catch (err) {
    console.error(`[webhook/mux] Error handling event ${event.type}:`, err)
    return NextResponse.json({ success: true, data: { error: 'processing_error' } })
  }

  return NextResponse.json({ success: true, data: { received: true } })
}

// ─────────────────────────────────────────────────────────────────────────────
// Event type definitions
// ─────────────────────────────────────────────────────────────────────────────

type MuxEvent = {
  id: string
  type: string
  data: {
    id: string                     // asset ID
    upload_id?: string             // upload ID (present on upload events)
    playback_ids?: Array<{ id: string; policy: string }>
    duration?: number
    status?: string
    errors?: { type: string; messages: string[] }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Event dispatch
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
    case 'video.asset.created':
      await handleUploadAssetCreated(data)
      break

    case 'video.asset.ready':
      await handleAssetReady(data)
      break

    case 'video.asset.errored':
      await handleAssetErrored(data)
      break

    default:
      // Ignore other event types gracefully
      break
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// video.upload.asset_created / video.asset.created
// Mux has received the video and created an asset. Move status to PREPARING.
// Look up lesson by uploadId — the assetId might not yet be stored.
// ─────────────────────────────────────────────────────────────────────────────

async function handleUploadAssetCreated(data: MuxEvent['data']): Promise<void> {
  if (!data.upload_id) return

  const [lesson] = await db
    .select({ id: lessons.id })
    .from(lessons)
    .where(eq(lessons.muxUploadId, data.upload_id))
    .limit(1)

  if (!lesson) {
    console.warn(`[webhook/mux] asset_created: no lesson for uploadId=${data.upload_id}`)
    return
  }

  await db.update(lessons).set({
    muxAssetId: data.id,
    muxAssetStatus: 'PREPARING',
    updatedAt: new Date(),
  }).where(eq(lessons.id, lesson.id))

  console.log(`[webhook/mux] asset_created: lesson=${lesson.id} asset=${data.id}`)
}

// ─────────────────────────────────────────────────────────────────────────────
// video.asset.ready
// Transcoding complete. Store playback ID and duration.
// Look up by assetId first, fall back to uploadId (in case assetId wasn't set).
// ─────────────────────────────────────────────────────────────────────────────

async function handleAssetReady(data: MuxEvent['data']): Promise<void> {
  const publicPlayback = data.playback_ids?.find((p) => p.policy === 'public')

  let lesson: { id: string; sectionId: string } | undefined

  // Attempt 1: look up by assetId
  const [byAsset] = await db
    .select({ id: lessons.id, sectionId: lessons.sectionId })
    .from(lessons)
    .where(eq(lessons.muxAssetId, data.id))
    .limit(1)
  lesson = byAsset

  // Attempt 2: look up by uploadId
  if (!lesson && data.upload_id) {
    const [byUpload] = await db
      .select({ id: lessons.id, sectionId: lessons.sectionId })
      .from(lessons)
      .where(eq(lessons.muxUploadId, data.upload_id))
      .limit(1)
    lesson = byUpload
  }

  if (!lesson) {
    console.warn(`[webhook/mux] asset_ready: no lesson for assetId=${data.id} uploadId=${data.upload_id}`)
    return
  }

  await db.update(lessons).set({
    muxAssetId: data.id,
    muxPlaybackId: publicPlayback?.id ?? null,
    muxAssetStatus: 'READY',
    durationSeconds: data.duration ? Math.round(data.duration) : 0,
    updatedAt: new Date(),
  }).where(eq(lessons.id, lesson.id))

  await writeAuditLog({
    actorId: null,
    action: 'webhook.mux.asset_ready',
    targetType: 'lesson',
    targetId: lesson.id,
    metadata: { assetId: data.id, playbackId: publicPlayback?.id, duration: data.duration },
  })

  console.log(`[webhook/mux] asset_ready: lesson=${lesson.id} playback=${publicPlayback?.id}`)
}

// ─────────────────────────────────────────────────────────────────────────────
// video.asset.errored
// Transcoding failed. Mark the lesson as ERRORED.
// ─────────────────────────────────────────────────────────────────────────────

async function handleAssetErrored(data: MuxEvent['data']): Promise<void> {
  let lesson: { id: string } | undefined

  const [byAsset] = await db
    .select({ id: lessons.id })
    .from(lessons)
    .where(eq(lessons.muxAssetId, data.id))
    .limit(1)
  lesson = byAsset

  if (!lesson && data.upload_id) {
    const [byUpload] = await db
      .select({ id: lessons.id })
      .from(lessons)
      .where(eq(lessons.muxUploadId, data.upload_id))
      .limit(1)
    lesson = byUpload
  }

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