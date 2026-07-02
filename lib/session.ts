//import { randomUUID } from 'crypto'
import { redis, RedisKeys, RedisTTL } from './redis'
import { sha256 } from './utils'
import { db, sessions, type NewSession, type UserRole } from '@db/index'
import { eq, and, isNull } from 'drizzle-orm'

// ─────────────────────────────────────────────────────────────────────────────
// Session Store
//
// Two-layer session persistence:
//   1. Upstash Redis — authoritative for fast token validation
//      Key: session:{userId}:{tokenId}
//      Value: JSON { userId, role, tokenHash, email, name }
//      TTL: 7 days
//
//   2. PostgreSQL sessions table — durable audit trail + admin revocation
//      Allows viewing all active sessions and revoking them by ID
//
// On every refresh:
//   - Old Redis key is deleted
//   - Old DB row revokedAt is set
//   - New token is issued, new Redis + DB entries created
//
// On logout:
//   - Redis key deleted
//   - DB row marked revokedAt
//
// ─────────────────────────────────────────────────────────────────────────────



export type SessionData = {
  userId: string
  role: UserRole
  email: string
  name: string
  tokenHash: string
}

export type CreateSessionResult = {
  refreshToken: string
  tokenId: string
}

export async function createSession(params: {
  userId: string
  role: UserRole
  email: string
  name: string
  refreshToken: string
  tokenId: string
  ipAddress?: string
  userAgent?: string
}): Promise<CreateSessionResult> {
  const { userId, role, email, name, refreshToken, tokenId, ipAddress, userAgent } = params
  const tokenHash = await sha256(refreshToken)

  const expiresAt = new Date(Date.now() + RedisTTL.SESSION * 1000)

  const sessionData: SessionData = { userId, role, email, name, tokenHash }
  const redisKey = RedisKeys.session(userId, tokenId)
  await redis.set(redisKey, JSON.stringify(sessionData), { ex: RedisTTL.SESSION })

  const newSession: NewSession = {
    userId,
    tokenHash,
    tokenId,
    ipAddress: ipAddress ?? null,
    userAgent: userAgent ?? null,
    expiresAt,
  }
  await db.insert(sessions).values(newSession)

  return { refreshToken, tokenId }
}

export async function validateSession(
  userId: string,
  tokenId: string,
  refreshToken: string,
): Promise<SessionData | null> {
  const redisKey = RedisKeys.session(userId, tokenId)
  const raw = await redis.get<string>(redisKey)
  if (!raw) return null

  let sessionData: SessionData
  try {
    sessionData = typeof raw === 'string' ? JSON.parse(raw) : (raw as SessionData)
  } catch {
    return null
  }

  const incomingHash = await sha256(refreshToken)
  if (incomingHash !== sessionData.tokenHash) return null

  return sessionData
}

export async function rotateSession(params: {
  oldUserId: string
  oldTokenId: string
  role: UserRole
  email: string
  name: string
  newRefreshToken: string
  newTokenId: string
  ipAddress?: string
  userAgent?: string
}): Promise<CreateSessionResult> {
  const { oldUserId, oldTokenId, newRefreshToken, newTokenId, ...createParams } = params

  await Promise.all([
    redis.del(RedisKeys.session(oldUserId, oldTokenId)),
    db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(eq(sessions.tokenId, oldTokenId)),
  ])

  return createSession({
    userId: oldUserId,
    refreshToken: newRefreshToken,
    tokenId: newTokenId,
    ...createParams,
  })
}

export async function revokeSession(userId: string, tokenId: string): Promise<void> {
  await Promise.all([
    redis.del(RedisKeys.session(userId, tokenId)),
    db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(eq(sessions.tokenId, tokenId)),
  ])
}

export async function revokeAllSessions(userId: string): Promise<void> {
  const activeSessions = await db
    .select({ tokenId: sessions.tokenId })
    .from(sessions)
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)))

  if (activeSessions.length > 0) {
    const keys = activeSessions.map((s) => RedisKeys.session(userId, s.tokenId))
    await Promise.all(keys.map((k) => redis.del(k)))
  }

  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(eq(sessions.userId, userId))
}