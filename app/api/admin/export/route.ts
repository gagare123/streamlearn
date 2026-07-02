import { db } from '@db/index'
import { requireAdmin } from '@lib/rbac'
//import { Errors } from '@lib/errors'
import Papa from 'papaparse'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/export?type=users|enrollments|payments
//
// Exports platform data as a CSV file download.
// ADMIN only. Streamed directly — no temp file needed.
// ─────────────────────────────────────────────────────────────────────────────

const EXPORT_TYPES = ['users', 'enrollments', 'payments', 'quiz_results'] as const
type ExportType = (typeof EXPORT_TYPES)[number]

const QUERIES: Record<ExportType, string> = {
  users: `
    SELECT
      id, name, email, role,
      email_verified, is_active,
      created_at, last_login_at
    FROM users
    ORDER BY created_at DESC
  `,
  enrollments: `
    SELECT
      e.id AS enrollment_id,
      u.name AS student_name, u.email AS student_email,
      co.title AS course_title, co.price_kobo,
      e.status, e.created_at AS enrolled_at, e.completed_at
    FROM enrollments e
    JOIN users u   ON e.student_id = u.id
    JOIN courses co ON e.course_id = co.id
    ORDER BY e.created_at DESC
  `,
  payments: `
    SELECT
      p.id AS payment_id,
      u.name AS student_name, u.email AS student_email,
      co.title AS course_title,
      p.amount_kobo, p.currency,
      p.paystack_ref, p.status,
      p.created_at
    FROM payments p
    JOIN users u   ON p.student_id = u.id
    JOIN courses co ON p.course_id = co.id
    ORDER BY p.created_at DESC
  `,
  quiz_results: `
    SELECT
      qs.id AS submission_id,
      u.name AS student_name, u.email AS student_email,
      q.title AS quiz_title,
      co.title AS course_title,
      qs.score, qs.passed, qs.attempt_number,
      qs.started_at, qs.submitted_at
    FROM quiz_submissions qs
    JOIN users u   ON qs.student_id = u.id
    JOIN quizzes q  ON qs.quiz_id = q.id
    JOIN courses co ON q.course_id = co.id
    ORDER BY qs.submitted_at DESC
  `,
}

export async function GET(request: Request): Promise<Response> {
  try {
    requireAdmin(request)

    const url  = new URL(request.url)
    const type = url.searchParams.get('type') as ExportType | null

    if (!type || !EXPORT_TYPES.includes(type)) {
      return new Response(
        JSON.stringify({ success: false, error: `type must be one of: ${EXPORT_TYPES.join(', ')}`, code: 'VALIDATION_ERROR' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      )
    }

    const query   = QUERIES[type]
    const result  = await db.execute(query as any)
    const rows    = (result as any).rows ?? []

    // Use Papa.unparse to produce RFC-4180-compliant CSV
    const csv = Papa.unparse(rows, {
      header: true,
      newline: '\r\n',
      quotes: true,     // always quote fields for safe Excel import
    })

    const now      = new Date().toISOString().slice(0, 10)
    const filename = `streamlearn-${type}-${now}.csv`

    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type':        'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control':       'private, no-store',
        // BOM for Excel auto-detection of UTF-8
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (err) {
    const e = err as Error & { statusCode?: number; code?: string }
    const status = e.statusCode ?? 500
    return new Response(
      JSON.stringify({ success: false, error: e.message, code: e.code }),
      { status, headers: { 'Content-Type': 'application/json' } },
    )
  }
}