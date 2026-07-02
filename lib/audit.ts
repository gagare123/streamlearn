import { db, auditLogs, type NewAuditLog } from '@db/index'

export async function writeAuditLog(params: {
  actorId?: string | null
  action: string
  targetType?: string | null
  targetId?: string | null
  ipAddress?: string | null
  userAgent?: string | null
  metadata?: Record<string, unknown> | null
}): Promise<void> {
  try {
    const entry: NewAuditLog = {
      actorId: params.actorId ?? null,
      action: params.action,
      targetType: params.targetType ?? null,
      targetId: params.targetId ?? null,
      ipAddress: params.ipAddress ?? null,
      userAgent: params.userAgent ?? null,
      metadata: params.metadata ?? null,
    }
    await db.insert(auditLogs).values(entry)
  } catch (err) {
    console.error('[audit] Failed to write audit log:', err)
  }
}

export function auditMeta(request: Request): { ipAddress: string; userAgent: string } {
  const forwarded = request.headers.get('x-forwarded-for')
  return {
    ipAddress: forwarded?.split(',')[0]?.trim() ?? 'unknown',
    userAgent: request.headers.get('user-agent') ?? 'unknown',
  }
}
