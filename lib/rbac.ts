import { NextResponse } from 'next/server'

export type UserRole = 'ADMIN' | 'TUTOR' | 'STUDENT'

export const ROLE_LEVELS: Record<UserRole, number> = {
  STUDENT: 1, TUTOR: 2, ADMIN: 3,
}

export type RequestIdentity = {
  userId: string; role: UserRole; email: string; tokenId: string
}

export function getIdentityFromHeaders(request: Request): RequestIdentity | null {
  const userId = request.headers.get('x-user-id')
  const role   = request.headers.get('x-user-role') as UserRole | null
  const email  = request.headers.get('x-user-email') ?? ''
  const tokenId= request.headers.get('x-token-id') ?? ''
  if (!userId || !role || !ROLE_LEVELS[role]) return null
  return { userId, role, email, tokenId }
}

export function requireIdentity(request: Request): RequestIdentity {
  const id = getIdentityFromHeaders(request)
  if (!id) throw Object.assign(new Error('Authentication required'), { statusCode: 401, code: 'UNAUTHORIZED' })
  return id
}

export function requireAdmin(request: Request): RequestIdentity {
  const id = requireIdentity(request)
  if (id.role !== 'ADMIN') throw Object.assign(new Error('Admin access required'), { statusCode: 403, code: 'FORBIDDEN' })
  return id
}

export function requireTutor(request: Request): RequestIdentity {
  const id = requireIdentity(request)
  if (id.role !== 'TUTOR' && id.role !== 'ADMIN') throw Object.assign(new Error('Tutor access required'), { statusCode: 403, code: 'FORBIDDEN' })
  return id
}

export function requireOwnerOrAdmin(identity: RequestIdentity, ownerId: string): void {
  if (identity.role !== 'ADMIN' && identity.userId !== ownerId) {
    throw Object.assign(new Error('Access denied'), { statusCode: 403, code: 'FORBIDDEN' })
  }
}

export function hasMinRole(actorRole: UserRole, required: UserRole): boolean {
  return ROLE_LEVELS[actorRole] >= ROLE_LEVELS[required]
}

















// import { NextResponse } from 'next/server'
// import type { UserRole } from '@db/index'

// // ─────────────────────────────────────────────────────────────────────────────
// // Role Hierarchy & Permissions
// //
// // ADMIN > TUTOR > STUDENT
// // Each role inherits no permissions by default — everything is opt-in.
// // ─────────────────────────────────────────────────────────────────────────────

// export type { UserRole }

// // Ordered by privilege level — used for "at least" comparisons
// export const ROLE_LEVELS: Record<UserRole, number> = {
//   STUDENT: 1,
//   TUTOR: 2,
//   ADMIN: 3,
// } as const

// /**
//  * True if the actor's role has at least the required privilege level.
//  * e.g. hasMinRole('TUTOR', 'STUDENT') === true
//  */
// export function hasMinRole(actorRole: UserRole, required: UserRole): boolean {
//   return ROLE_LEVELS[actorRole] >= ROLE_LEVELS[required]
// }

// /**
//  * True if actorRole is one of the allowed roles.
//  */
// export function hasRole(actorRole: UserRole, ...allowed: UserRole[]): boolean {
//   return allowed.includes(actorRole)
// }

// // ─────────────────────────────────────────────────────────────────────────────
// // Permission definitions
// // Centralised here so they're easy to audit.
// // ─────────────────────────────────────────────────────────────────────────────

// export const Permissions = {
//   // User management
//   USER_READ_OWN: (role: UserRole) => hasMinRole(role, 'STUDENT'),
//   USER_UPDATE_OWN: (role: UserRole) => hasMinRole(role, 'STUDENT'),
//   USER_READ_ANY: (role: UserRole) => hasRole(role, 'ADMIN'),
//   USER_UPDATE_ANY: (role: UserRole) => hasRole(role, 'ADMIN'),
//   USER_DEACTIVATE: (role: UserRole) => hasRole(role, 'ADMIN'),
//   USER_CHANGE_ROLE: (role: UserRole) => hasRole(role, 'ADMIN'),

//   // Course management
//   COURSE_READ: (role: UserRole) => hasMinRole(role, 'STUDENT'),
//   COURSE_CREATE: (role: UserRole) => hasMinRole(role, 'TUTOR'),
//   COURSE_UPDATE_OWN: (role: UserRole) => hasMinRole(role, 'TUTOR'),
//   COURSE_UPDATE_ANY: (role: UserRole) => hasRole(role, 'ADMIN'),
//   COURSE_DELETE_OWN: (role: UserRole) => hasMinRole(role, 'TUTOR'),
//   COURSE_DELETE_ANY: (role: UserRole) => hasRole(role, 'ADMIN'),
//   COURSE_PUBLISH: (role: UserRole) => hasMinRole(role, 'TUTOR'),

//   // Enrollment
//   ENROLLMENT_CREATE: (role: UserRole) => hasRole(role, 'STUDENT'),
//   ENROLLMENT_READ_OWN: (role: UserRole) => hasMinRole(role, 'STUDENT'),
//   ENROLLMENT_READ_ANY: (role: UserRole) => hasMinRole(role, 'TUTOR'),
//   ENROLLMENT_REFUND: (role: UserRole) => hasRole(role, 'ADMIN'),

//   // Lessons & uploads
//   LESSON_READ: (role: UserRole) => hasMinRole(role, 'STUDENT'),
//   LESSON_CREATE: (role: UserRole) => hasMinRole(role, 'TUTOR'),
//   LESSON_UPDATE: (role: UserRole) => hasMinRole(role, 'TUTOR'),
//   LESSON_UPLOAD: (role: UserRole) => hasMinRole(role, 'TUTOR'),

//   // Video progress
//   PROGRESS_READ_OWN: (role: UserRole) => hasRole(role, 'STUDENT'),
//   PROGRESS_WRITE_OWN: (role: UserRole) => hasRole(role, 'STUDENT'),

//   // Quizzes
//   QUIZ_READ: (role: UserRole) => hasMinRole(role, 'STUDENT'),
//   QUIZ_CREATE: (role: UserRole) => hasMinRole(role, 'TUTOR'),
//   QUIZ_SUBMIT: (role: UserRole) => hasRole(role, 'STUDENT'),

//   // Certificates
//   CERTIFICATE_READ_OWN: (role: UserRole) => hasMinRole(role, 'STUDENT'),
//   CERTIFICATE_ISSUE: (role: UserRole) => hasRole(role, 'ADMIN'),

//   // Payments
//   PAYMENT_INITIATE: (role: UserRole) => hasRole(role, 'STUDENT'),
//   PAYMENT_READ_OWN: (role: UserRole) => hasMinRole(role, 'STUDENT'),
//   PAYMENT_READ_ANY: (role: UserRole) => hasRole(role, 'ADMIN'),

//   // Notifications
//   NOTIFICATION_READ_OWN: (role: UserRole) => hasMinRole(role, 'STUDENT'),
//   NOTIFICATION_SEND: (role: UserRole) => hasRole(role, 'ADMIN'),

//   // Admin — system
//   AUDIT_LOG_READ: (role: UserRole) => hasRole(role, 'ADMIN'),
//   SYSTEM_STATS: (role: UserRole) => hasRole(role, 'ADMIN'),
//   ADMIN_PANEL: (role: UserRole) => hasRole(role, 'ADMIN'),
// } as const

// // ─────────────────────────────────────────────────────────────────────────────
// // Request identity extraction
// //
// // Middleware (Phase 2) attaches x-user-* headers after JWT verification.
// // Route handlers use these helpers instead of re-verifying the token.
// // ─────────────────────────────────────────────────────────────────────────────

// export type RequestIdentity = {
//   userId: string
//   role: UserRole
//   email: string
//   tokenId: string
// }

// /**
//  * Extract identity from the request headers set by middleware.
//  * Returns null if the headers are absent (unauthenticated request).
//  */
// export function getIdentityFromHeaders(request: Request): RequestIdentity | null {
//   const userId = request.headers.get('x-user-id')
//   const role = request.headers.get('x-user-role') as UserRole | null
//   const email = request.headers.get('x-user-email') ?? ''
//   const tokenId = request.headers.get('x-token-id') ?? ''

//   if (!userId || !role || !ROLE_LEVELS[role]) return null

//   return { userId, role, email, tokenId }
// }

// /**
//  * Get identity or throw a 401 AppError.
//  * Use in any route handler that requires authentication.
//  */
// export function requireIdentity(request: Request): RequestIdentity {
//   const identity = getIdentityFromHeaders(request)
//   if (!identity) {
//     throw Object.assign(new Error('Authentication required'), {
//       statusCode: 401,
//       code: 'UNAUTHORIZED',
//     })
//   }
//   return identity
// }

// /**
//  * Get identity and verify the role, or throw 403.
//  * Use in route handlers that are role-restricted.
//  *
//  * @example
//  * const identity = requireRoleIdentity(request, 'TUTOR', 'ADMIN')
//  */
// export function requireRoleIdentity(
//   request: Request,
//   ...allowed: UserRole[]
// ): RequestIdentity {
//   const identity = requireIdentity(request)
//   if (!allowed.includes(identity.role)) {
//     throw Object.assign(
//       new Error('You do not have permission to perform this action'),
//       { statusCode: 403, code: 'FORBIDDEN' },
//     )
//   }
//   return identity
// }

// /**
//  * Get identity and verify minimum role level.
//  *
//  * @example
//  * const identity = requireMinRole(request, 'TUTOR') // TUTOR or ADMIN passes
//  */
// export function requireMinRole(
//   request: Request,
//   minimum: UserRole,
// ): RequestIdentity {
//   const identity = requireIdentity(request)
//   if (!hasMinRole(identity.role, minimum)) {
//     throw Object.assign(
//       new Error('You do not have permission to perform this action'),
//       { statusCode: 403, code: 'FORBIDDEN' },
//     )
//   }
//   return identity
// }

// /**
//  * Verify the actor is an ADMIN. Shorthand for requireRoleIdentity(req, 'ADMIN').
//  */
// export function requireAdmin(request: Request): RequestIdentity {
//   return requireRoleIdentity(request, 'ADMIN')
// }

// /**
//  * Verify the actor is a TUTOR or ADMIN.
//  */
// export function requireTutor(request: Request): RequestIdentity {
//   return requireRoleIdentity(request, 'TUTOR', 'ADMIN')
// }

// // ─────────────────────────────────────────────────────────────────────────────
// // Resource ownership
// // ─────────────────────────────────────────────────────────────────────────────

// /**
//  * Verify the identity owns the resource, or is an ADMIN.
//  * Throws 403 otherwise.
//  */
// export function requireOwnerOrAdmin(
//   identity: RequestIdentity,
//   ownerId: string,
// ): void {
//   if (identity.role !== 'ADMIN' && identity.userId !== ownerId) {
//     throw Object.assign(
//       new Error('You do not have access to this resource'),
//       { statusCode: 403, code: 'FORBIDDEN' },
//     )
//   }
// }

// // ─────────────────────────────────────────────────────────────────────────────
// // Standard RBAC error response helpers
// // ─────────────────────────────────────────────────────────────────────────────

// export function unauthorizedResponse(message = 'Authentication required'): NextResponse {
//   return NextResponse.json(
//     { success: false, error: message, code: 'UNAUTHORIZED' },
//     { status: 401 },
//   )
// }

// export function forbiddenResponse(message = 'You do not have permission to perform this action'): NextResponse {
//   return NextResponse.json(
//     { success: false, error: message, code: 'FORBIDDEN' },
//     { status: 403 },
//   )
// }

// // ─────────────────────────────────────────────────────────────────────────────
// // Role display helpers
// // ─────────────────────────────────────────────────────────────────────────────

// export const ROLE_LABELS: Record<UserRole, string> = {
//   ADMIN: 'Administrator',
//   TUTOR: 'Tutor',
//   STUDENT: 'Student',
// } as const

// export const ROLE_BADGE_VARIANT: Record<UserRole, 'default' | 'secondary' | 'outline'> = {
//   ADMIN: 'default',
//   TUTOR: 'secondary',
//   STUDENT: 'outline',
// } as const

// export const ALL_ROLES: UserRole[] = ['STUDENT', 'TUTOR', 'ADMIN']