'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import { useAuth } from '@/context/auth-context'

// ─────────────────────────────────────────────────────────────────────────────
// useSSE — Server-Sent Events hook for real-time notifications
//
// Connects to /api/sse/notifications when the user is authenticated.
// Automatically reconnects on error with exponential backoff.
// Tears down cleanly on logout or unmount.
// ─────────────────────────────────────────────────────────────────────────────

type SSENotification = {
  type: 'notification'
  userId: string
  notificationId: string
  title: string
  body: string
  actionUrl?: string
}

type UseSSEOptions = {
  onNotification?: (payload: SSENotification) => void
}

type SSEState = {
  connected: boolean
  error: string | null
}

const RECONNECT_BASE_MS   = 2_000   // initial reconnect delay
const RECONNECT_MAX_MS    = 30_000  // max reconnect delay
const RECONNECT_MULTIPLIER = 2

export function useSSE({ onNotification }: UseSSEOptions = {}): SSEState {
  const { isAuthenticated } = useAuth()
  const [state, setState] = useState<SSEState>({ connected: false, error: null })

  const esRef       = useRef<EventSource | null>(null)
  const retryDelay  = useRef(RECONNECT_BASE_MS)
  const retryTimer  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef  = useRef(true)

  const connect = useCallback(() => {
    if (!mountedRef.current || !isAuthenticated) return
    if (esRef.current) {
      esRef.current.close()
      esRef.current = null
    }

    const es = new EventSource('/api/sse/notifications', { withCredentials: true })
    esRef.current = es

    es.addEventListener('connected', () => {
      if (!mountedRef.current) return
      setState({ connected: true, error: null })
      retryDelay.current = RECONNECT_BASE_MS // reset backoff on success
    })

    es.addEventListener('notification', (event) => {
      if (!mountedRef.current) return
      try {
        const payload = JSON.parse(event.data) as SSENotification
        onNotification?.(payload)
      } catch {
        console.warn('[sse] Failed to parse notification payload')
      }
    })

    es.onerror = () => {
      if (!mountedRef.current) return
      es.close()
      esRef.current = null
      setState({ connected: false, error: 'Connection lost. Reconnecting…' })

      // Exponential backoff
      const delay = Math.min(retryDelay.current, RECONNECT_MAX_MS)
      retryDelay.current = Math.min(delay * RECONNECT_MULTIPLIER, RECONNECT_MAX_MS)

      retryTimer.current = setTimeout(connect, delay)
    }
  }, [isAuthenticated, onNotification])

  useEffect(() => {
    mountedRef.current = true

    if (isAuthenticated) {
      connect()
    }

    return () => {
      mountedRef.current = false
      if (retryTimer.current) clearTimeout(retryTimer.current)
      if (esRef.current) {
        esRef.current.close()
        esRef.current = null
      }
    }
  }, [isAuthenticated, connect])

  return state
}