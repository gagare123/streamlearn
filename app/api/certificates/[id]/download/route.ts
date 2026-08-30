import { db, certificates, courses } from '@db/index'
import { eq } from 'drizzle-orm'
import { requireIdentity, requireOwnerOrAdmin } from '@lib/rbac'
import {  Errors } from '@lib/errors'
import { getR2Client } from '@lib/r2'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { env } from '@lib/env'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export async function GET(request: Request, { params }: Params): Promise<Response> {
  try {
    const identity = requireIdentity(request)
    const { id }   = await params

    // Fetch certificate record
    const [cert] = await db
      .select({
        id: certificates.id,
        studentId: certificates.studentId,
        r2Key: certificates.pdfR2Key,
        issuedAt: certificates.issuedAt,
        courseTitle: courses.title,
      })
      .from(certificates)
      .innerJoin(courses, eq(certificates.courseId, courses.id))
      .where(eq(certificates.id, id))
      .limit(1)

    if (!cert) throw Errors.notFound('Certificate')

    // Ownership check — only the student or ADMIN
    requireOwnerOrAdmin(identity, cert.studentId)

    // Fetch PDF bytes from R2
    const r2  = getR2Client()
    const cmd = new GetObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key:    cert.r2Key,
    })

    const r2Response = await r2.send(cmd)
    if (!r2Response.Body) throw Errors.internalError('Certificate file not found in storage')

    // Convert to ArrayBuffer
    const chunks: Uint8Array[] = []
    for await (const chunk of r2Response.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk)
    }
    const totalLength = chunks.reduce((sum, c) => sum + c.length, 0)
    const buffer = new Uint8Array(totalLength)
    let offset = 0
    for (const chunk of chunks) {
      buffer.set(chunk, offset)
      offset += chunk.length
    }

    // Sanitise filename
    const safeTitle = cert.courseTitle.replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, '-').slice(0, 60)
    const filename  = `StreamLearn-Certificate-${safeTitle}.pdf`

    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length':      String(buffer.length),
        'Cache-Control':       'private, no-store',
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