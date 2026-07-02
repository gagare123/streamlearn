import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db, courses, users } from '@db/index'
import { eq, desc, ilike, and, or, count, sql } from 'drizzle-orm'
import { requireTutor, getIdentityFromHeaders } from '@/lib/rbac'
import { writeAuditLog, auditMeta } from '@/lib/audit'
import { handleRouteError, Errors } from '@/lib/errors'
import { parsePagination } from '@/lib/utils'
import { generateUniqueSlug } from '@/lib/slugify'
import { redis, RedisKeys } from '@/lib/redis'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/courses
//
// Public catalogue — returns published courses with tutor info.
// Authenticated users also see their own drafts (tutors see own courses).
// ─────────────────────────────────────────────────────────────────────────────

const listQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  search: z.string().trim().max(100).optional(),
  level: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED']).optional(),
})

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const identity = getIdentityFromHeaders(request)
    const url = new URL(request.url)

    const queryParsed = listQuerySchema.safeParse({
      page: url.searchParams.get('page') ?? undefined,
      limit: url.searchParams.get('limit') ?? undefined,
      search: url.searchParams.get('search') ?? undefined,
      level: url.searchParams.get('level') ?? undefined,
    })

    if (!queryParsed.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid query parameters', code: 'VALIDATION_ERROR' },
        { status: 400 },
      )
    }

    const { search, level } = queryParsed.data
    const { limit, offset, page } = parsePagination(
      queryParsed.data.page ?? null,
      queryParsed.data.limit ?? null,
      20,
    )

    // Build conditions — non-admins only see published courses
    const conditions = []

    if (identity?.role !== 'ADMIN') {
      if (identity?.role === 'TUTOR') {
        // Tutors see all published courses + their own drafts
        conditions.push(
          or(
            eq(courses.status, 'PUBLISHED'),
            eq(courses.tutorId, identity.userId),
          ),
        )
      } else {
        conditions.push(eq(courses.status, 'PUBLISHED'))
      }
    }

    if (search) {
      conditions.push(
        or(
          ilike(courses.title, `%${search}%`),
          ilike(courses.description ?? '', `%${search}%`),
        ),
      )
    }

    if (level) {
      conditions.push(eq(courses.level, level))
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined

    const [rows, [totalRow]] = await Promise.all([
      db
        .select({
          id: courses.id,
          title: courses.title,
          slug: courses.slug,
          description: courses.description,
          thumbnailR2Key: courses.thumbnailR2Key,
          priceKobo: courses.priceKobo,
          status: courses.status,
          level: courses.level,
          tags: courses.tags,
          totalLessons: courses.totalLessons,
          totalDurationSeconds: courses.totalDurationSeconds,
          totalEnrollments: courses.totalEnrollments,
          createdAt: courses.createdAt,
          tutor: {
            id: users.id,
            name: users.name,
            avatarR2Key: users.avatarR2Key,
          },
        })
        .from(courses)
        .innerJoin(users, eq(courses.tutorId, users.id))
        .where(whereClause)
        .orderBy(desc(courses.createdAt))
        .limit(limit)
        .offset(offset),

      db.select({ total: count() }).from(courses).where(whereClause),
    ])

    const total = totalRow?.total ?? 0

    return NextResponse.json({
      success: true,
      data: {
        courses: rows,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      },
    })
  } catch (err) {
    return handleRouteError(err)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/courses — create a new course
// TUTOR or ADMIN only
// ─────────────────────────────────────────────────────────────────────────────

const createSchema = z.object({
  title: z
    .string()
    .trim()
    .min(5, 'Title must be at least 5 characters')
    .max(255, 'Title must be under 255 characters'),
  description: z.string().trim().max(5000).optional(),
  priceKobo: z
    .number()
    .int('Price must be a whole number')
    .min(0, 'Price cannot be negative')
    .default(0),
  level: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED']).default('BEGINNER'),
  tags: z.array(z.string().trim().max(50)).max(10).default([]),
})

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const identity = requireTutor(request)

    let body: unknown
    try { body = await request.json() } catch { throw Errors.badRequest('Request body must be valid JSON') }

    const parsed = createSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', code: 'VALIDATION_ERROR', fields: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }

    const { title, description, priceKobo, level, tags } = parsed.data

    // Generate unique slug from title
    const slug = await generateUniqueSlug(title)

    const [course] = await db
      .insert(courses)
      .values({
        tutorId: identity.userId,
        title,
        slug,
        description: description ?? null,
        priceKobo,
        level,
        tags,
        status: 'DRAFT',
      })
      .returning({
        id: courses.id,
        title: courses.title,
        slug: courses.slug,
        status: courses.status,
        createdAt: courses.createdAt,
      })

    if (!course) throw Errors.internalError('Failed to create course')

    // Invalidate course list cache
    await redis.del(RedisKeys.courseListCache())

    await writeAuditLog({
      actorId: identity.userId,
      action: 'course.created',
      targetType: 'course',
      targetId: course.id,
      ...auditMeta(request),
      metadata: { title, slug, priceKobo, level },
    })

    return NextResponse.json(
      { success: true, data: { course } },
      { status: 201 },
    )
  } catch (err) {
    return handleRouteError(err)
  }
}