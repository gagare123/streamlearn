'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth, type AuthUser } from '@/context/auth-context'

type Role = 'ADMIN' | 'TUTOR' | 'STUDENT'

type Options = {
  /** Allowed roles. If omitted, any authenticated user passes. */
  roles?: Role[]
  /** Where to redirect unauthenticated users. Default: /login */
  redirectTo?: string
  /** Where to redirect users with wrong role. Default: /dashboard/student */
  unauthorizedRedirect?: string
}

type GuardResult =
  | { ready: false; user: null }
  | { ready: true; user: AuthUser }

/**
 * Client-side route guard.
 *
 * Usage in a layout or page:
 * ```tsx
 * const { ready, user } = useAuthGuard({ roles: ['TUTOR', 'ADMIN'] })
 * if (!ready) return <FullPageSkeleton />
 * ```
 *
 * Redirects automatically — renders nothing (returns ready: false)
 * while the redirect is in progress.
 */
export function useAuthGuard({
  roles,
  redirectTo = '/login',
  unauthorizedRedirect,
}: Options = {}): GuardResult {
  const router = useRouter()
  const { state, user } = useAuth()

  useEffect(() => {
    if (state.status === 'loading') return

    if (state.status === 'unauthenticated') {
      // Preserve the intended destination for post-login redirect
      const current = typeof window !== 'undefined' ? window.location.pathname : ''
      const dest = current && current !== '/' ? `${redirectTo}?next=${encodeURIComponent(current)}` : redirectTo
      router.replace(dest)
      return
    }

    // Authenticated — check role if required
    if (roles && roles.length > 0 && !roles.includes(state.user.role)) {
      const fallback = unauthorizedRedirect ?? getRoleDashboard(state.user.role)
      router.replace(fallback)
    }
  }, [state, roles, redirectTo, unauthorizedRedirect, router])

  if (state.status !== 'authenticated') {
    return { ready: false, user: null }
  }

  if (roles && roles.length > 0 && !roles.includes(state.user.role)) {
    return { ready: false, user: null }
  }

  return { ready: true, user: state.user }
}

function getRoleDashboard(role: Role): string {
  switch (role) {
    case 'ADMIN': return '/dashboard/admin'
    case 'TUTOR': return '/dashboard/tutor'
    case 'STUDENT': return '/dashboard/student'
  }
}