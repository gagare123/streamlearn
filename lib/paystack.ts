import { createHmac } from 'crypto'
import { env } from './env'

// ─────────────────────────────────────────────────────────────────────────────
// Paystack HTTP client
//
// All Paystack API calls go through this module.
// Every outgoing request includes the Authorization header with the secret key.
// Webhook verification uses HMAC-SHA512 (Paystack requirement).
// ─────────────────────────────────────────────────────────────────────────────

const PAYSTACK_BASE = 'https://api.paystack.co'

function headers(): Record<string, string> {
  if (!env.PAYSTACK_SECRET_KEY) {
    throw new Error('PAYSTACK_SECRET_KEY is not set')
  }
  return {
    Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`,
    'Content-Type': 'application/json',
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type PaystackInitResponse = {
  status: boolean
  message: string
  data: {
    authorization_url: string
    access_code: string
    reference: string
  }
}

export type PaystackVerifyResponse = {
  status: boolean
  message: string
  data: {
    id: number
    status: 'success' | 'failed' | 'abandoned'
    reference: string
    amount: number          // kobo
    currency: string
    channel: string
    paid_at: string | null
    customer: {
      email: string
      customer_code: string
    }
    metadata: Record<string, unknown> | null
  }
}

export type PaystackWebhookEvent = {
  event: string             // e.g. 'charge.success'
  data: {
    id: number
    status: string
    reference: string
    amount: number          // kobo
    currency: string
    paid_at: string
    customer: { email: string }
    metadata: Record<string, unknown> | null
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Initialize transaction
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Start a Paystack transaction.
 * Returns the authorization_url to redirect the user to.
 *
 * @param email         Payer email
 * @param amountKobo    Amount in kobo (e.g. 500000 = ₦5,000)
 * @param reference     Unique transaction reference (your idempotency key)
 * @param metadata      Arbitrary data stored on the transaction (courseId, userId, etc.)
 * @param callbackUrl   URL Paystack redirects to after payment
 */
export async function initializePaystackTransaction(params: {
  email: string
  amountKobo: number
  reference: string
  metadata: Record<string, unknown>
  callbackUrl: string
}): Promise<PaystackInitResponse> {
  const { email, amountKobo, reference, metadata, callbackUrl } = params

  const res = await fetch(`${PAYSTACK_BASE}/transaction/initialize`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      email,
      amount: amountKobo,
      reference,
      metadata,
      callback_url: callbackUrl,
      currency: 'NGN',
      channels: ['card', 'bank', 'ussd', 'qr', 'mobile_money', 'bank_transfer'],
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Paystack initialize failed: ${res.status} ${text}`)
  }

  return res.json() as Promise<PaystackInitResponse>
}

// ─────────────────────────────────────────────────────────────────────────────
// Verify transaction
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Verify a Paystack transaction by its reference.
 * Always verify server-side — never trust client-reported payment status.
 */
export async function verifyPaystackTransaction(
  reference: string,
): Promise<PaystackVerifyResponse> {
  const res = await fetch(
    `${PAYSTACK_BASE}/transaction/verify/${encodeURIComponent(reference)}`,
    { method: 'GET', headers: headers() },
  )

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Paystack verify failed: ${res.status} ${text}`)
  }

  return res.json() as Promise<PaystackVerifyResponse>
}

// ─────────────────────────────────────────────────────────────────────────────
// Webhook signature verification
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Verify the HMAC-SHA512 signature on a Paystack webhook request.
 *
 * Paystack sends the signature in the `x-paystack-signature` header.
 * The signature is: HMAC-SHA512(rawBody, PAYSTACK_WEBHOOK_SECRET)
 *
 * IMPORTANT: Use the raw request body, not the parsed JSON.
 */
export function verifyPaystackWebhook(
  rawBody: string,
  signature: string,
): boolean {
  if (!env.PAYSTACK_WEBHOOK_SECRET) {
    console.error('[paystack] PAYSTACK_WEBHOOK_SECRET is not set')
    return false
  }

  const expected = createHmac('sha512', env.PAYSTACK_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex')

  // Constant-time comparison to prevent timing attacks
  if (expected.length !== signature.length) return false

  let diff = 0
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i)
  }

  return diff === 0
}

// ─────────────────────────────────────────────────────────────────────────────
// Reference + idempotency key generation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a unique Paystack transaction reference.
 * Format: SL-{userId-prefix}-{courseId-prefix}-{timestamp}
 */
export function generatePaystackReference(
  userId: string,
  courseId: string,
): string {
  const ts = Date.now().toString(36).toUpperCase()
  const uid = userId.replace(/-/g, '').slice(0, 8).toUpperCase()
  const cid = courseId.replace(/-/g, '').slice(0, 8).toUpperCase()
  return `SL-${uid}-${cid}-${ts}`
}

/**
 * Generate a stable idempotency key for a student + course payment.
 * This key is stored in Redis (24h TTL) to prevent double charges.
 *
 * Using a deterministic key means re-submitting the same payment
 * form returns the same result instead of creating a duplicate charge.
 */
export function generateIdempotencyKey(
  userId: string,
  courseId: string,
): string {
  // Stable key — same user + course always produces the same key
  // (within the same 24h window, handled by Redis TTL)
  const date = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
  return `${userId}:${courseId}:${date}`
}