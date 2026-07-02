'use client'

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type AuthUser = {
  id: string
  email: string
  name: string
  role: 'ADMIN' | 'TUTOR' | 'STUDENT'
  emailVerified: boolean
  avatarR2Key: string | null
  bio: string | null
  isActive: boolean
  createdAt: string
}

type AuthState =
  | { status: 'loading' }
  | { status: 'authenticated'; user: AuthUser }
  | { status: 'unauthenticated' }

type AuthContextValue = {
  state: AuthState
  user: AuthUser | null
  isLoading: boolean
  isAuthenticated: boolean
  /** Reload the current user from /api/auth/me */
  refresh: () => Promise<void>
  /** Call after login — sets user from the response body */
  setUser: (user: AuthUser) => void
  /** Sign out — calls /api/auth/logout and clears state */
  logout: () => Promise<void>
}

// ─────────────────────────────────────────────────────────────────────────────
// Context
// ─────────────────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null)

// ─────────────────────────────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────────────────────────────

// How often to silently refresh the access token before it expires (14 min).
// Access token TTL is 15 min — refresh at 14 min to stay ahead.
const PROACTIVE_REFRESH_INTERVAL_MS = 14 * 60 * 1000

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' })
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Fetch current user ──────────────────────────────────────────────────
  const fetchUser = useCallback(async (): Promise<AuthUser | null> => {
    try {
      const res = await fetch('/api/auth/me', {
        credentials: 'include',
        // Cache-bust so we always get fresh data
        headers: { 'Cache-Control': 'no-cache' },
      })

      if (res.status === 401) return null

      if (!res.ok) return null

      const data = await res.json() as {
        success: boolean
        data?: { user: AuthUser }
      }

      return data.success ? (data.data?.user ?? null) : null
    } catch {
      return null
    }
  }, [])

  // ── Silently refresh the access token ─────────────────────────────────
  const silentRefresh = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include',
      })
      return res.ok
    } catch {
      return false
    }
  }, [])

  // ── Schedule next proactive refresh ────────────────────────────────────
  const scheduleRefresh = useCallback(() => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)

    refreshTimerRef.current = setTimeout(async () => {
      const ok = await silentRefresh()
      if (ok) {
        // Re-fetch user after successful refresh
        const user = await fetchUser()
        if (user) {
          setState({ status: 'authenticated', user })
          scheduleRefresh() // schedule next refresh
        } else {
          setState({ status: 'unauthenticated' })
        }
      } else {
        setState({ status: 'unauthenticated' })
      }
    }, PROACTIVE_REFRESH_INTERVAL_MS)
  }, [silentRefresh, fetchUser])

  // ── Initial auth check on mount ────────────────────────────────────────
  useEffect(() => {
    async function init() {
      // First try to get the current user with the existing access token
      let user = await fetchUser()

      if (!user) {
        // Access token may be expired — try refreshing
        const refreshed = await silentRefresh()
        if (refreshed) {
          user = await fetchUser()
        }
      }

      if (user) {
        setState({ status: 'authenticated', user })
        scheduleRefresh()
      } else {
        setState({ status: 'unauthenticated' })
      }
    }

    void init()

    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
    }
  }, [fetchUser, silentRefresh, scheduleRefresh])

  // ── Public API ─────────────────────────────────────────────────────────

  const refresh = useCallback(async () => {
    const user = await fetchUser()
    if (user) {
      setState({ status: 'authenticated', user })
    } else {
      setState({ status: 'unauthenticated' })
    }
  }, [fetchUser])

  const setUser = useCallback((user: AuthUser) => {
    setState({ status: 'authenticated', user })
    scheduleRefresh()
  }, [scheduleRefresh])

  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      })
    } finally {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
      setState({ status: 'unauthenticated' })
    }
  }, [])

  const value: AuthContextValue = {
    state,
    user: state.status === 'authenticated' ? state.user : null,
    isLoading: state.status === 'loading',
    isAuthenticated: state.status === 'authenticated',
    refresh,
    setUser,
    logout,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within an <AuthProvider>. ' +
      'Wrap your app root with <AuthProvider>.')
  }
  return ctx
}