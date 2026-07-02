import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { NextResponse } from 'next/server'

// ─────────────────────────────────────────────────────────────────────────────
// Tailwind class merging
// ─────────────────────────────────────────────────────────────────────────────

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

// ─────────────────────────────────────────────────────────────────────────────
// Slug
// ─────────────────────────────────────────────────────────────────────────────

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')  // strip diacritics
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-{2,}/g, '-')
    .slice(0, 80)
}

// ─────────────────────────────────────────────────────────────────────────────
// Currency
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format kobo as Naira display string.
 * e.g. 500000 → "₦5,000"
 */
export function formatNaira(kobo: number): string {
  return '₦' + (kobo / 100).toLocaleString('en-NG', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
}

/**
 * Convert Naira to kobo.
 * e.g. 5000 → 500000
 */
export function nairaToKobo(naira: number): number {
  return Math.round(naira * 100)
}

// ─────────────────────────────────────────────────────────────────────────────
// Duration / time
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format seconds to a human-readable duration.
 * e.g. 9000 → "2h 30m"
 */
export function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '0m'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0 && m > 0) return `${h}h ${m}m`
  if (h > 0) return `${h}h`
  return `${m}m`
}

/**
 * Format seconds as MM:SS for video players.
 * e.g. 305 → "5:05"
 */
export function formatVideoTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

// ─────────────────────────────────────────────────────────────────────────────
// Date formatting
// ─────────────────────────────────────────────────────────────────────────────

const DATE_FORMATTER = new Intl.DateTimeFormat('en-NG', {
  year: 'numeric', month: 'short', day: 'numeric',
})

const DATETIME_FORMATTER = new Intl.DateTimeFormat('en-NG', {
  year: 'numeric', month: 'short', day: 'numeric',
  hour: '2-digit', minute: '2-digit',
})

export function formatDate(date: string | Date): string {
  return DATE_FORMATTER.format(new Date(date))
}

export function formatDateTime(date: string | Date): string {
  return DATETIME_FORMATTER.format(new Date(date))
}

export function timeAgo(date: string | Date): string {
  const now  = Date.now()
  const then = new Date(date).getTime()
  const diff = Math.floor((now - then) / 1000)

  if (diff < 60)    return `${diff}s ago`
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604800)return `${Math.floor(diff / 86400)}d ago`
  return formatDate(date)
}

// ─────────────────────────────────────────────────────────────────────────────
// String helpers
// ─────────────────────────────────────────────────────────────────────────────

export function truncate(str: string, maxLen: number, ellipsis = '…'): string {
  if (str.length <= maxLen) return str
  return str.slice(0, maxLen - ellipsis.length) + ellipsis
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
}

// ─────────────────────────────────────────────────────────────────────────────
// API response helpers
// ─────────────────────────────────────────────────────────────────────────────

export function apiSuccess<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ success: true, data }, { status })
}

export function apiError(error: string, code: string, status: number): NextResponse {
  return NextResponse.json({ success: false, error, code }, { status })
}

// ─────────────────────────────────────────────────────────────────────────────
// Pagination
// ─────────────────────────────────────────────────────────────────────────────

export function parsePagination(
  pageStr: string | null,
  limitStr: string | null,
  defaultLimit = 20,
): { page: number; limit: number; offset: number } {
  const page  = Math.max(1, parseInt(pageStr ?? '1', 10))
  const limit = Math.min(100, Math.max(1, parseInt(limitStr ?? String(defaultLimit), 10)))
  return { page, limit, offset: (page - 1) * limit }
}

// ─────────────────────────────────────────────────────────────────────────────
// Security
// ─────────────────────────────────────────────────────────────────────────────

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]?.trim() ?? 'unknown'
  return request.headers.get('x-real-ip') ?? 'unknown'
}

export async function sha256(input: string): Promise<string> {
  const encoder  = new TextEncoder()
  const data     = encoder.encode(input)
  const hashBuf  = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export function generateToken(length = 32): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
}