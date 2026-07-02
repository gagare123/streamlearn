'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuthGuard } from '@/hooks/use-auth-guard'
import { useApiFetch } from '@/hooks/use-fetch'
import { FullPageSkeleton } from '@/components/auth/full-page-skeleton'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Search, RefreshCw, ChevronLeft, ChevronRight, UserCheck, UserX } from 'lucide-react'

type UserRow = {
  id: string; name: string; email: string; role: 'ADMIN' | 'TUTOR' | 'STUDENT'
  emailVerified: boolean; isActive: boolean; createdAt: string; lastLoginAt: string | null
}

type Pagination = { page: number; limit: number; total: number; totalPages: number }

const ROLE_OPTIONS = ['', 'STUDENT', 'TUTOR', 'ADMIN'] as const
const STATUS_OPTIONS = ['', 'active', 'inactive'] as const

export default function AdminUsersPage() {
  const { ready }     = useAuthGuard({ roles: ['ADMIN'] })
  const { apiFetch }  = useApiFetch()
  const [users, setUsers]       = useState<UserRow[]>([])
  const [pagination, setPag]    = useState<Pagination | null>(null)
  const [loading, setLoading]   = useState(true)
  const [actionId, setActionId] = useState<string | null>(null)
  const [search, setSearch]     = useState('')
  const [role, setRole]         = useState('')
  const [status, setStatus]     = useState('')
  const [page, setPage]         = useState(1)

  const fetchUsers = useCallback(async () => {
  setLoading(true)
  const q = new URLSearchParams({ page: String(page), limit: '20' })
  if (search) q.set('search', search)
  if (role)   q.set('role', role)
  if (status) q.set('status', status)

  const r = await apiFetch<{ users: UserRow[]; pagination: Pagination }>(`/api/admin/users?${q}`)
  if (r.ok && r.data?.users) {
    setUsers(r.data.users)
    setPag(r.data.pagination ?? null)
  } else {
    setUsers([])
  }
  setLoading(false)
}, [apiFetch, page, search, role, status])

  useEffect(() => { if (ready) void fetchUsers() }, [ready, fetchUsers])

  async function handleAction(userId: string, action: 'activate' | 'deactivate' | 'change_role', newRole?: string) {
    setActionId(userId)
    const r = await apiFetch('/api/admin/users', {
      method: 'PATCH',
      body: JSON.stringify({ userId, action, ...(newRole ? { role: newRole } : {}) }),
    })
    if (r.ok) { toast.success('User updated'); void fetchUsers() }
    else toast.error(r.error)
    setActionId(null)
  }

  if (!ready) return <FullPageSkeleton />

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">User Management</h1>
          <p className="mt-1 text-sm text-gray-500">
            {pagination ? `${pagination.total.toLocaleString()} total users` : 'Loading…'}
          </p>
        </div>
        <button
          onClick={() => void fetchUsers()}
          className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
          <input
            type="text" placeholder="Search name or email…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="h-9 w-full rounded-lg border border-gray-300 bg-white pl-9 pr-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <select value={role} onChange={(e) => { setRole(e.target.value); setPage(1) }}
          className="h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm focus:border-indigo-500 focus:outline-none">
          {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r || 'All roles'}</option>)}
        </select>
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }}
          className="h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm focus:border-indigo-500 focus:outline-none">
          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s || 'All status'}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3 hidden sm:table-cell">Role</th>
              <th className="px-4 py-3 hidden md:table-cell">Joined</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading
              ? Array.from({ length: 8 }, (_, i) => (
                  <tr key={i}>
                    {[1,2,3,4,5].map((j) => (
                      <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full rounded" /></td>
                    ))}
                  </tr>
                ))
              : users.length === 0
              ? <tr><td colSpan={5} className="px-4 py-12 text-center text-sm text-gray-400">No users found</td></tr>
              : users.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                    {/* User */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">
                          {user.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-gray-900">{user.name}</p>
                          <p className="truncate text-xs text-gray-500">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    {/* Role dropdown */}
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <select
                        value={user.role}
                        onChange={(e) => void handleAction(user.id, 'change_role', e.target.value)}
                        disabled={actionId === user.id}
                        className="rounded border border-gray-200 bg-white px-2 py-1 text-xs focus:border-indigo-500 focus:outline-none disabled:opacity-50"
                        aria-label={`Change role for ${user.name}`}
                      >
                        <option value="STUDENT">Student</option>
                        <option value="TUTOR">Tutor</option>
                        <option value="ADMIN">Admin</option>
                      </select>
                    </td>
                    {/* Joined */}
                    <td className="px-4 py-3 text-xs text-gray-500 hidden md:table-cell">
                      {user.createdAt ? new Date(user.createdAt).toLocaleDateString('en-NG') : 'N/A'}
                    </td>
                    {/* Status */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className={`h-2 w-2 rounded-full ${user.isActive ? 'bg-green-500' : 'bg-gray-300'}`} aria-hidden="true" />
                        <span className={`text-xs font-medium ${user.isActive ? 'text-green-700' : 'text-gray-400'}`}>
                          {user.isActive ? 'Active' : 'Inactive'}
                        </span>
                        {!user.emailVerified && (
                          <Badge variant="warning" className="text-[10px] px-1 py-0">Unverified</Badge>
                        )}
                      </div>
                    </td>
                    {/* Actions */}
                    <td className="px-4 py-3 text-right">
                      {user.isActive ? (
                        <button
                          onClick={() => void handleAction(user.id, 'deactivate')}
                          disabled={actionId === user.id}
                          className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                        >
                          <UserX className="h-3 w-3" aria-hidden="true" />
                          {actionId === user.id ? '…' : 'Deactivate'}
                        </button>
                      ) : (
                        <button
                          onClick={() => void handleAction(user.id, 'activate')}
                          disabled={actionId === user.id}
                          className="inline-flex items-center gap-1 rounded-md border border-green-200 px-2.5 py-1 text-xs font-medium text-green-700 hover:bg-green-50 disabled:opacity-50"
                        >
                          <UserCheck className="h-3 w-3" aria-hidden="true" />
                          {actionId === user.id ? '…' : 'Activate'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))
            }
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-400">
            Showing {((page - 1) * pagination.limit) + 1}–{Math.min(page * pagination.limit, pagination.total)} of {pagination.total}
          </p>
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