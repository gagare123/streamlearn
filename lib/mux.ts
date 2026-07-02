import Mux from '@mux/mux-node'
import { env } from './env'

// ─────────────────────────────────────────────────────────────────────────────
// Mux client singleton
//
// Used by:
//   • Route handlers to create direct uploads
//   • Webhook handler to look up asset details
//   • Background worker for asset management (Phase 8)
// ─────────────────────────────────────────────────────────────────────────────

let _mux: Mux | null = null

export function getMuxClient(): Mux {
  if (_mux) return _mux

  if (!env.MUX_TOKEN_ID || !env.MUX_TOKEN_SECRET) {
    throw new Error(
      'MUX_TOKEN_ID and MUX_TOKEN_SECRET must be set. ' +
        'Get them from your Mux dashboard → Settings → API Access Tokens.',
    )
  }

  _mux = new Mux({
    tokenId: env.MUX_TOKEN_ID,
    tokenSecret: env.MUX_TOKEN_SECRET,
  })

  return _mux
}

// ─────────────────────────────────────────────────────────────────────────────
// Direct upload helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a Mux Direct Upload URL.
 * The tutor uploads the video file directly to this URL from the browser.
 * Mux handles transcoding and HLS packaging automatically.
 *
 * Optimised for Nigerian 3G networks:
 *   - mp4_support: 'standard' — provides MP4 fallback if HLS is unavailable
 *   - max_resolution_tier: '1080p' — cap bitrate (saves storage + egress cost)
 *   - encoding_tier: 'smart' — Mux auto-selects best encoding for the content
 */
export async function createMuxDirectUpload(corsOrigin: string): Promise<{
  uploadId: string
  uploadUrl: string
}> {
  const mux = getMuxClient()

  const upload = await mux.video.uploads.create({
    cors_origin: corsOrigin,
    new_asset_settings: {
      playback_policy: ['public'],
      mp4_support: 'standard',
      max_resolution_tier: '1080p',
      encoding_tier: 'smart',
    },
  })

  return {
    uploadId: upload.id,
    uploadUrl: upload.url,
  }
}

/**
 * Get the status of a Mux upload.
 */
export async function getMuxUpload(uploadId: string) {
  const mux = getMuxClient()
  return mux.video.uploads.retrieve(uploadId)
}

/**
 * Get asset details by asset ID.
 */
export async function getMuxAsset(assetId: string) {
  const mux = getMuxClient()
  return mux.video.assets.retrieve(assetId)
}

/**
 * Delete a Mux asset (called when a lesson is deleted).
 */
export async function deleteMuxAsset(assetId: string): Promise<void> {
  const mux = getMuxClient()
  await mux.video.assets.delete(assetId)
}

// ─────────────────────────────────────────────────────────────────────────────
// Webhook signature verification
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Verify a Mux webhook signature.
 * Returns true if the signature is valid.
 *
 * Mux signs webhooks with HMAC-SHA256.
 * The secret comes from: Mux Dashboard → Settings → Webhooks → Signing Secret
 */
export async function verifyMuxWebhook(
  rawBody: string,
  signature: string,
): Promise<boolean> {
  if (!env.MUX_WEBHOOK_SECRET) return false

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(env.MUX_WEBHOOK_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  )

  // Mux sends: mux-signature: t=<timestamp>,v1=<hex-signature>
  const parts = signature.split(',')
  const tPart = parts.find((p) => p.startsWith('t='))
  const vPart = parts.find((p) => p.startsWith('v1='))

  if (!tPart || !vPart) return false

  const timestamp = tPart.slice(2)
  const hexSig = vPart.slice(3)

  // Mux signed payload = timestamp + '.' + rawBody
  const signedPayload = `${timestamp}.${rawBody}`

  const sigBytes = hexToUint8Array(hexSig)
  const payloadBytes = new TextEncoder().encode(signedPayload)

  return crypto.subtle.verify('HMAC', key, sigBytes, payloadBytes)
}

function hexToUint8Array(hex: string): Uint8Array {
  const arr = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    arr[i / 2] = parseInt(hex.slice(i, i + 2), 16)
  }
  return arr
}

// ─────────────────────────────────────────────────────────────────────────────
// Playback URL builders
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the Mux HLS streaming URL for a given playback ID.
 * This is passed to the Mux Player component.
 */
export function getMuxPlaybackUrl(playbackId: string): string {
  return `https://stream.mux.com/${playbackId}.m3u8`
}

/**
 * Build the Mux thumbnail URL.
 * time = seconds into the video for the thumbnail frame (default: 0)
 */
export function getMuxThumbnailUrl(playbackId: string, time = 0): string {
  return `https://image.mux.com/${playbackId}/thumbnail.jpg?time=${time}&width=640`
}