'use client'

import type { ReactNode } from 'react'
import { useAuth } from '@/context/auth-context'

type Role = 'ADMIN' | 'TUTOR' | 'STUDENT'
const ROLE_LEVEL: Record<Role, number> = { STUDENT: 1, TUTOR: 2, ADMIN: 3 }

// ─────────────────────────────────────────────────────────────────────────────
// <RoleGate> — renders children only when the user's role matches.
//
// Usage examples:
//
//   <RoleGate roles={['ADMIN']}>
//     <AdminPanel />
//   </RoleGate>
//
//   <RoleGate minRole="TUTOR" fallback={<p>Tutors only</p>}>
//     <CourseBuilder />
//   </RoleGate>
//
//   <RoleGate roles={['ADMIN', 'TUTOR']} loadingFallback={<Spinner />}>
//     <UploadButton />
//   </RoleGate>
//
// ─────────────────────────────────────────────────────────────────────────────

type RoleGateProps = {
  children: ReactNode
  /**
   * Explicit list of roles allowed. If provided, the user must have
   * exactly one of these roles.
   */
  roles?: Role[]
  /**
   * Minimum role level. Passes for this role AND any higher-level role.
   * e.g. minRole="TUTOR" passes for TUTOR and ADMIN.
   * Cannot be combined with `roles`.
   */
  minRole?: Role
  /**
   * Rendered instead of children when the user does not meet the role
   * requirement. Defaults to null (renders nothing).
   */
  fallback?: ReactNode
  /**
   * Rendered while auth state is loading. Defaults to null.
   */
  loadingFallback?: ReactNode
}

export function RoleGate({
  children,
  roles,
  minRole,
  fallback = null,
  loadingFallback = null,
}: RoleGateProps) {
  const { user, isLoading } = useAuth()

  if (isLoading) return <>{loadingFallback}</>
  if (!user) return <>{fallback}</>

  const userRole = user.role as Role

  let allowed = false

  if (roles && roles.length > 0) {
    allowed = roles.includes(userRole)
  } else if (minRole) {
    allowed = ROLE_LEVEL[userRole] >= ROLE_LEVEL[minRole]
  } else {
    // No restriction specified — any authenticated user passes
    allowed = true
  }

  return allowed ? <>{children}</> : <>{fallback}</>
}

// ─────────────────────────────────────────────────────────────────────────────
// Convenience wrappers
// ─────────────────────────────────────────────────────────────────────────────

/** Only renders for ADMINs. */
export function AdminOnly({ children, fallback }: { children: ReactNode; fallback?: ReactNode }) {
  return <RoleGate roles={['ADMIN']} fallback={fallback}>{children}</RoleGate>
}

/** Renders for TUTORs and ADMINs. */
export function TutorAndAbove({ children, fallback }: { children: ReactNode; fallback?: ReactNode }) {
  return <RoleGate minRole="TUTOR" fallback={fallback}>{children}</RoleGate>
}

/** Only renders for STUDENTs. */
export function StudentOnly({ children, fallback }: { children: ReactNode; fallback?: ReactNode }) {
  return <RoleGate roles={['STUDENT']} fallback={fallback}>{children}</RoleGate>
}