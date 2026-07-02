'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuthGuard } from '@/hooks/use-auth-guard'
import { useApiFetch } from '@/hooks/use-fetch'
import { FullPageSkeleton } from '@/components/auth/full-page-skeleton'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Shield, Filter, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react'

type LogRow = {
  id: string
  action: string
  targetType: string | null
  targetId: string | null
  ipAddress: string | null
  metadata: Record<string, unknown> | null
  createdAt: string
  actorId: string | null
  actorName: string | null
  actorEmail: string | null
  actorRole: string | null
}

type Pagination = { page: number; limit: number; total: number; totalPages: number }

function actionVariant(action: string): 'default' | 'secondary' | 'destructive' | 'success' | 'warning' | 'outline' {
  if (action.startsWith('user.login') || action.startsWith('user.register')) return 'success'
  if (action.startsWith('user.logout')) return 'outline'
  if (action.includes('deactivate') || action.includes('delete')) return 'destructive'
  if (action.startsWith('admin.')) return 'default'
  if (action.startsWith('payment.success')) return 'success'
  if (action.startsWith('payment.fail')) return 'destructive'
  if (action.startsWith('webhook.')) return 'warning'
  return 'outline'
}

const QUICK_FILTERS = ['user.login', 'admin.', 'payment.', 'course.', 'quiz.']

export default function AuditLogPage() {
  const { ready }    = useAuthGuard({ roles: ['ADMIN'] })
  const { apiFetch } = useApiFetch()

  const [logs, setLogs]         = useState<LogRow[]>([])
  const [pagination, setPag]    = useState<Pagination | null>(null)
  const [loading, setLoading]   = useState(true)
  const [expandedId, setExpanded] = useState<string | null>(null)
  const [actionFilter, setAction] = useState('')
  const [page, setPage]         = useState(1)

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    const q = new URLSearchParams({ page: String(page), limit: '50' })
    if (actionFilter) q.set('action', actionFilter)
    const r = await apiFetch<{ logs: LogRow[]; pagination: Pagination }>(`/api/admin/audit?${q}`)
    if (r.ok) { setLogs(r.data.logs); setPag(r.data.pagination) }
    else toast.error(r.error)
    setLoading(false)
  }, [apiFetch, page, actionFilter])

  useEffect(() => { if (ready) void fetchLogs() }, [ready, fetchLogs])

  if (!ready) return <FullPageSkeleton />

function safeDate(value: unknown): string {
  if (!value) return 'N/A'
  const d = new Date(value as string | Date)
  return isNaN(d.getTime()) ? 'N/A' : d.toLocaleDateString('en-NG')
}

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-gray-900">
            <Shield className="h-6 w-6 text-indigo-600" aria-hidden="true" />
            Audit Log
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Immutable record of all system events.
            {pagination ? ` ${pagination.total.toLocaleString()} total entries.` : ''}
          </p>
        </div>
        <button onClick={() => void fetchLogs()}
          className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-xs flex-1">
          <Filter className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
          <input
            type="text" placeholder="Filter by action (e.g. user.login)"
            value={actionFilter}
            onChange={(e) => { setAction(e.target.value); setPage(1) }}
            className="h-9 w-full rounded-lg border border-gray-300 bg-white pl-9 pr-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div className="hidden flex-wrap gap-2 sm:flex">
          {QUICK_FILTERS.map((f) => (
            <button key={f} onClick={() => { setAction(actionFilter === f ? '' : f); setPage(1) }}
              className={[
                'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                actionFilter === f
                  ? 'bg-indigo-600 text-white'
                  : 'border border-gray-300 text-gray-600 hover:bg-gray-50',
              ].join(' ')}>
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Log entries */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        {loading ? (
          <div className="divide-y divide-gray-100">
            {Array.from({ length: 10 }, (_, i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-3.5">
                <Skeleton className="h-4 w-40 rounded" />
                <Skeleton className="h-4 w-24 rounded" />
                <Skeleton className="h-4 w-28 ml-auto rounded" />
              </div>
            ))}
          </div>
        ) : logs.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-400">No audit log entries found.</div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {logs.map((log) => (
              <li key={log.id}>
                <button
                  type="button"
                  onClick={() => setExpanded(expandedId === log.id ? null : log.id)}
                  className="flex w-full items-start gap-4 px-5 py-3.5 text-left hover:bg-gray-50 transition-colors"
                >
                  <Badge variant={actionVariant(log.action)} className="mt-0.5 shrink-0 font-mono text-[10px]">
                    {log.action}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    {log.actorName ? (
                      <p className="truncate text-sm text-gray-700">
                        <span className="font-medium">{log.actorName}</span>
                        <span className="text-gray-400"> · {log.actorEmail}</span>
                      </p>
                    ) : (
                      <p className="text-sm text-gray-400 italic">System</p>
                    )}
                    {log.targetType && (
                      <p className="text-xs text-gray-400">
                        {log.targetType}{log.targetId ? ` · ${log.targetId.slice(0, 8)}…` : ''}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs font-medium text-gray-700">
                      {log.createdAt
                        ? new Date(log.createdAt).toLocaleString('en-NG', { dateStyle: 'short', timeStyle: 'short' })
                        : 'N/A'}
                    </p>
                    {log.ipAddress && (
                      <p className="font-mono text-xs text-gray-400">{log.ipAddress}</p>
                    )}
                  </div>
                </button>
                {expandedId === log.id && log.metadata && (
                  <div className="border-t border-gray-100 bg-gray-50 px-5 py-3">
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-gray-400">Metadata</p>
                    <pre className="overflow-auto rounded-md bg-gray-900 p-3 text-xs leading-relaxed text-green-400">
                      {JSON.stringify(log.metadata, null, 2)}
                    </pre>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-400">Page {page} of {pagination.totalPages} · {pagination.total} entries</p>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-gray-300 text-gray-500 hover:bg-gray-50 disabled:opacity-40">
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <span className="text-sm text-gray-700">{page} / {pagination.totalPages}</span>
            <button onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))} disabled={page === pagination.totalPages}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-gray-300 text-gray-500 hover:bg-gray-50 disabled:opacity-40">
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}