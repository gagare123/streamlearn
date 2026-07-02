import { NextResponse } from 'next/server'

type AppError = Error & { statusCode?: number; code?: string; fields?: Record<string, string[]> }

export const Errors = {
  badRequest:        (msg: string) => Object.assign(new Error(msg), { statusCode: 400, code: 'BAD_REQUEST' }),
  unauthorized:      (msg = 'Authentication required') => Object.assign(new Error(msg), { statusCode: 401, code: 'UNAUTHORIZED' }),
  forbidden:         (msg = 'Access denied') => Object.assign(new Error(msg), { statusCode: 403, code: 'FORBIDDEN' }),
  notFound:          (entity: string) => Object.assign(new Error(`${entity} not found`), { statusCode: 404, code: 'NOT_FOUND' }),
  conflict:          (msg: string) => Object.assign(new Error(msg), { statusCode: 409, code: 'CONFLICT' }),
  internalError:     (msg = 'Internal server error') => Object.assign(new Error(msg), { statusCode: 500, code: 'INTERNAL_ERROR' }),
  serviceUnavailable:(svc: string) => Object.assign(new Error(`${svc} is unavailable`), { statusCode: 503, code: 'SERVICE_UNAVAILABLE' }),
}

export function handleRouteError(err: unknown): NextResponse {
  const e = err as AppError
  const status = e.statusCode ?? 500
  const code   = e.code ?? 'INTERNAL_ERROR'
  const message= e.message ?? 'An unexpected error occurred'

  if (status >= 500) console.error('[route-error]', e)

  return NextResponse.json(
    { success: false, error: message, code, ...(e.fields ? { fields: e.fields } : {}) },
    { status },
  )
}