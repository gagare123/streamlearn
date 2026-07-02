import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db, users } from '@db/index'
import { eq, ilike, or, and, count, desc } from 'drizzle-orm'
import { requireAdmin } from '@lib/rbac'
import { handleRouteError, Errors } from '@lib/errors'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request): Promise<NextResponse> {
  try {
    requireAdmin(request)

    const url    = new URL(request.url)
    const page   = Math.max(1, parseInt(url.searchParams.get('page')   ?? '1', 10))
    const limit  = Math.min(50, parseInt(url.searchParams.get('limit') ?? '20', 10))
    const offset = (page - 1) * limit
    const search = url.searchParams.get('search') ?? ''
    const role   = url.searchParams.get('role')   ?? ''
    const status = url.searchParams.get('status') ?? ''

    const conditions = []

    if (search) {
      conditions.push(or(
        ilike(users.email, `%${search}%`),
        ilike(users.name, `%${search}%`),
      ))
    }
    if (role && ['ADMIN', 'TUTOR', 'STUDENT'].includes(role)) {
      conditions.push(eq(users.role, role as 'ADMIN' | 'TUTOR' | 'STUDENT'))
    }
    if (status === 'active')   conditions.push(eq(users.isActive, true))
    if (status === 'inactive') conditions.push(eq(users.isActive, false))

    const where = conditions.length ? and(...conditions) : undefined

    const [rows, totalResult] = await Promise.all([
      db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          role: users.role,
          emailVerified: users.emailVerified,
          isActive: users.isActive,
          createdAt: users.createdAt,
          lastLoginAt: users.lastLoginAt,
        })
        .from(users)
        .where(where)
        .orderBy(desc(users.createdAt))
        .limit(limit)
        .offset(offset),

      db.select({ total: count() }).from(users).where(where),
    ])

    const total = totalResult[0]?.total ?? 0

    return NextResponse.json({
      success: true,
      data: {
        users: rows,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      },
    })
  } catch (err) {
    return handleRouteError(err)
  }
}

const patchSchema = z.object({
  userId: z.string().uuid(),
  action: z.enum(['activate', 'deactivate', 'change_role']),
  role: z.enum(['ADMIN', 'TUTOR', 'STUDENT']).optional(),
})

export async function PATCH(request: Request): Promise<NextResponse> {
  try {
    const identity = requireAdmin(request)

    let body: unknown
    try { body = await request.json() } catch { throw Errors.badRequest('Invalid JSON') }

    const parsed = patchSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', code: 'VALIDATION_ERROR', fields: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }

    const { userId, action, role } = parsed.data
    if (userId === identity.userId) throw Errors.badRequest('You cannot modify your own account')

    if (action === 'activate') {
      await db.update(users).set({ isActive: true, updatedAt: new Date() }).where(eq(users.id, userId))
    } else if (action === 'deactivate') {
      await db.update(users).set({ isActive: false, updatedAt: new Date() }).where(eq(users.id, userId))
    } else if (action === 'change_role') {
      if (!role) throw Errors.badRequest('role is required for change_role')
      await db.update(users).set({ role, updatedAt: new Date() }).where(eq(users.id, userId))
    }

    return NextResponse.json({ success: true, data: { message: `User ${action} successful` } })
  } catch (err) {
    return handleRouteError(err)
  }
}
