'use client'

import { useAuth } from '@/context/auth-context'

type Role = 'ADMIN' | 'TUTOR' | 'STUDENT'

const ROLE_LEVEL: Record<Role, number> = { STUDENT: 1, TUTOR: 2, ADMIN: 3 }

/**
 * Client-side RBAC hook.
 *
 * Usage:
 * ```tsx
 * const { isAdmin, isTutor, hasRole, hasMinRole, can } = useRbac()
 *
 * if (!can('COURSE_CREATE')) return null
 * ```
 */
export function useRbac() {
  const { user } = useAuth()
  const role = user?.role ?? null

  /** True only while auth state is loading (role not yet known). */
  const isLoading = role === null && user === null

  /** True if the user is an ADMIN. */
  const isAdmin = role === 'ADMIN'

  /** True if the user is a TUTOR or ADMIN. */
  const isTutor = role === 'TUTOR' || role === 'ADMIN'

  /** True if the user is a STUDENT (any role can enroll, but STUDENT is the base). */
  const isStudent = role === 'STUDENT'

  /**
   * True if the current user has exactly one of the specified roles.
   */
  function hasRole(...roles: Role[]): boolean {
    if (!role) return false
    return roles.includes(role)
  }

  /**
   * True if the current user's role level is >= the required minimum.
   * e.g. hasMinRole('TUTOR') passes for TUTOR and ADMIN.
   */
  function hasMinRole(minimum: Role): boolean {
    if (!role) return false
    return ROLE_LEVEL[role] >= ROLE_LEVEL[minimum]
  }

  /**
   * Permission gate — maps named permissions to role requirements.
   * Keeps permission logic co-located with the RBAC system.
   */
  function can(permission: Permission): boolean {
    if (!role) return false
    return PERMISSIONS[permission]?.(role) ?? false
  }

  return { role, isAdmin, isTutor, isStudent, isLoading, hasRole, hasMinRole, can }
}

// ─────────────────────────────────────────────────────────────────────────────
// Permission map (mirrors lib/rbac.ts on the server)
// Keep these in sync with the server-side Permissions object.
// ─────────────────────────────────────────────────────────────────────────────

type Permission =
  | 'USER_READ_ANY'
  | 'USER_UPDATE_ANY'
  | 'USER_DEACTIVATE'
  | 'USER_CHANGE_ROLE'
  | 'COURSE_CREATE'
  | 'COURSE_UPDATE_ANY'
  | 'COURSE_DELETE_ANY'
  | 'COURSE_PUBLISH'
  | 'ENROLLMENT_CREATE'
  | 'ENROLLMENT_REFUND'
  | 'LESSON_CREATE'
  | 'LESSON_UPLOAD'
  | 'QUIZ_CREATE'
  | 'QUIZ_SUBMIT'
  | 'CERTIFICATE_ISSUE'
  | 'PAYMENT_INITIATE'
  | 'PAYMENT_READ_ANY'
  | 'AUDIT_LOG_READ'
  | 'SYSTEM_STATS'
  | 'ADMIN_PANEL'

const PERMISSIONS: Record<Permission, (role: Role) => boolean> = {
  USER_READ_ANY:       (r) => r === 'ADMIN',
  USER_UPDATE_ANY:     (r) => r === 'ADMIN',
  USER_DEACTIVATE:     (r) => r === 'ADMIN',
  USER_CHANGE_ROLE:    (r) => r === 'ADMIN',
  COURSE_CREATE:       (r) => r === 'TUTOR' || r === 'ADMIN',
  COURSE_UPDATE_ANY:   (r) => r === 'ADMIN',
  COURSE_DELETE_ANY:   (r) => r === 'ADMIN',
  COURSE_PUBLISH:      (r) => r === 'TUTOR' || r === 'ADMIN',
  ENROLLMENT_CREATE:   (r) => r === 'STUDENT',
  ENROLLMENT_REFUND:   (r) => r === 'ADMIN',
  LESSON_CREATE:       (r) => r === 'TUTOR' || r === 'ADMIN',
  LESSON_UPLOAD:       (r) => r === 'TUTOR' || r === 'ADMIN',
  QUIZ_CREATE:         (r) => r === 'TUTOR' || r === 'ADMIN',
  QUIZ_SUBMIT:         (r) => r === 'STUDENT',
  CERTIFICATE_ISSUE:   (r) => r === 'ADMIN',
  PAYMENT_INITIATE:    (r) => r === 'STUDENT',
  PAYMENT_READ_ANY:    (r) => r === 'ADMIN',
  AUDIT_LOG_READ:      (r) => r === 'ADMIN',
  SYSTEM_STATS:        (r) => r === 'ADMIN',
  ADMIN_PANEL:         (r) => r === 'ADMIN',
}