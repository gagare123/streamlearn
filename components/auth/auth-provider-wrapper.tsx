'use client'

import { AuthProvider } from '@/context/auth-context'
import type { ReactNode } from 'react'

/**
 * Thin client component wrapper for AuthProvider.
 * Needed because the root layout is a Server Component —
 * we can't directly use context there, so we wrap in a
 * client boundary here and import from layout.tsx.
 */
export function AuthProviderWrapper({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>
}