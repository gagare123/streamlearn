'use client'

import { useCallback } from 'react'

type FetchOptions = RequestInit & {
  /** Skip the automatic 401→refresh→retry cycle */
  skipRefresh?: boolean
}

export type FetchResult<T> =
  | { ok: true; data: T; status: number }
  | { ok: false; error: string; code?: string; status: number; fields?: Record<string, string[]> }

/**
 * Typed fetch wrapper that:
 *   1. Always sends `credentials: 'include'` for HttpOnly cookies
 *   2. On 401 responses, attempts a silent token refresh then retries once
 *   3. Returns a typed result — never throws
 *
 * Usage:
 * ```ts
 * const { apiFetch } = useApiFetch()
 * const result = await apiFetch<{ course: Course }>('/api/courses/123')
 * if (result.ok) console.log(result.data.course)
 * ```
 */
export function useApiFetch() {
  const apiFetch = useCallback(async <T>(
    url: string,
    options: FetchOptions = {},
  ): Promise<FetchResult<T>> => {
    const { skipRefresh = false, ...fetchOptions } = options

    const doFetch = async (): Promise<Response> =>
      fetch(url, {
        ...fetchOptions,
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(fetchOptions.headers ?? {}),
        },
      })

    let res = await doFetch()

    // ── 401 → silent refresh → retry once ──────────────────────────────
    if (res.status === 401 && !skipRefresh) {
      const refreshRes = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include',
      })

      if (refreshRes.ok) {
        // Retry the original request with the new access token
        res = await doFetch()
      }
    }

    // ── Parse response ─────────────────────────────────────────────────
    let body: unknown
    try {
      body = await res.json()
    } catch {
      return {
        ok: false,
        error: 'Server returned an invalid response',
        status: res.status,
      }
    }

    const parsed = body as {
      success?: boolean
      data?: T
      error?: string
      code?: string
      fields?: Record<string, string[]>
    }

    if (res.ok && parsed.success !== false) {
      return {
        ok: true,
        data: (parsed.data ?? parsed) as T,
        status: res.status,
      }
    }

    // ✅ Build error return without explicit undefined properties
    return {
      ok: false,
      error: parsed.error ?? 'An unexpected error occurred',
      status: res.status,
      ...(parsed.code ? { code: parsed.code } : {}),
      ...(parsed.fields ? { fields: parsed.fields } : {}),
    }
  }, [])

  return { apiFetch }
}