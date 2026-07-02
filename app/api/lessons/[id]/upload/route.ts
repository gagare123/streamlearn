import { NextResponse } from 'next/server'
import { db, lessons } from '@db/index'
import { eq } from 'drizzle-orm'
import { requireTutor, requireOwnerOrAdmin } from '@/lib/rbac'
import { writeAuditLog, auditMeta } from '@/lib/audit'
import { handleRouteError, Errors } from '@/lib/errors'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export async function POST(request: Request, { params }: Params): Promise<NextResponse> {
  try {
    const identity = requireTutor(request)
    const { id } = await params

    // Use Drizzle's relations query to fetch the lesson with its parent section and course
    const lessonData = await db.query.lessons.findFirst({
      where: eq(lessons.id, id),
      with: {
        section: {
          with: {
            course: {
              columns: { tutorId: true },
            },
          },
        },
      },
    })

    if (!lessonData) throw Errors.notFound('Lesson')

    // Verify the tutor owns the course that contains this lesson
    requireOwnerOrAdmin(identity, lessonData.section.course.tutorId)

    // ── Call Mux to create a direct upload ─────────────────────────────────
    const muxTokenId = process.env.MUX_TOKEN_ID!
    const muxTokenSecret = process.env.MUX_TOKEN_SECRET!
    const auth = Buffer.from(`${muxTokenId}:${muxTokenSecret}`).toString('base64')

       const muxRes = await fetch('https://api.mux.com/video/v1/uploads', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        new_asset_settings: {
          playback_policy: ['public'],
          // mp4_support is deprecated for basic assets — omitted
        },
        cors_origin: '*',
      }),
    })

    if (!muxRes.ok) {
      const errBody = await muxRes.text()
      console.error('Mux API error:', muxRes.status, errBody)
      throw new Error(`Mux API returned ${muxRes.status}`)
    }

    const muxData = (await muxRes.json()) as {
      data: { url: string; id: string }
    }

    // ── Store Mux upload ID on the lesson ─────────────────────────────────
    await db
      .update(lessons)
      .set({
        muxUploadId: muxData.data.id,
        muxAssetStatus: 'WAITING',
        updatedAt: new Date(),
      })
      .where(eq(lessons.id, id))

    // ── Audit log ──────────────────────────────────────────────────────────
    await writeAuditLog({
      actorId: identity.userId,
      action: 'lesson.upload_initiated',
      targetType: 'lesson',
      targetId: id,
      ...auditMeta(request),
      metadata: { muxUploadId: muxData.data.id },
    })

    return NextResponse.json({
      success: true,
      data: {
        url: muxData.data.url,
        uploadId: muxData.data.id,
      },
    })
  } catch (err) {
    return handleRouteError(err)
  }
}