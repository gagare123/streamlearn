'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuthGuard } from '@/hooks/use-auth-guard'
import { useApiFetch } from '@/hooks/use-fetch'
import { FullPageSkeleton } from '@components/auth/full-page-skeleton'
import { Skeleton } from '@components/ui/skeleton'
import { Badge } from '@components/ui/badge'
import { toast } from 'sonner'
import { formatDateTime } from '@lib/utils'
import {
  Bell, BookOpen, DollarSign, Award,
  ClipboardList, Info, RefreshCw, CheckCheck,
} from 'lucide-react'
import Link from 'next/link'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type Notification = {
  id: string
  type: 'ENROLLMENT' | 'PAYMENT' | 'CERTIFICATE' | 'QUIZ_RESULT' | 'COURSE_UPDATE' | 'SYSTEM'
  title: string
  body: string
  isRead: boolean
  readAt: string | null
  actionUrl: string | null
  createdAt: string
}

type NotificationsResponse = { notifications: Notification[] }

// ─────────────────────────────────────────────────────────────────────────────
// Icon + colour map
// ─────────────────────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<
  Notification['type'],
  { icon: React.ElementType; bg: string; iconColor: string; label: string }
> = {
  ENROLLMENT:    { icon: BookOpen,      bg: 'bg-indigo-50',  iconColor: 'text-indigo-600', label: 'Enrollment' },
  PAYMENT:       { icon: DollarSign,    bg: 'bg-green-50',   iconColor: 'text-green-600',  label: 'Payment'    },
  CERTIFICATE:   { icon: Award,         bg: 'bg-amber-50',   iconColor: 'text-amber-600',  label: 'Certificate'},
  QUIZ_RESULT:   { icon: ClipboardList, bg: 'bg-blue-50',    iconColor: 'text-blue-600',   label: 'Quiz'       },
  COURSE_UPDATE: { icon: BookOpen,      bg: 'bg-purple-50',  iconColor: 'text-purple-600', label: 'Course'     },
  SYSTEM:        { icon: Info,          bg: 'bg-gray-50',    iconColor: 'text-gray-500',   label: 'System'     },
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function NotificationsPage() {
  const { ready } = useAuthGuard()
  const { apiFetch } = useApiFetch()
  const [items, setItems] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [markingAll, setMarkingAll] = useState(false)

  const fetchNotifications = useCallback(async () => {
    const result = await apiFetch<NotificationsResponse>('/api/notifications')
    if (result.ok) setItems(result.data.notifications)
    else toast.error(result.error)
    setLoading(false)
  }, [apiFetch])

  useEffect(() => {
    if (ready) void fetchNotifications()
  }, [ready, fetchNotifications])

  async function handleMarkAllRead() {
    setMarkingAll(true)
    const result = await apiFetch('/api/notifications', { method: 'PATCH' })
    if (result.ok) {
      setItems((prev) => prev.map((n) => ({ ...n, isRead: true, readAt: new Date().toISOString() })))
      toast.success('All notifications marked as read')
    } else {
      toast.error(result.error)
    }
    setMarkingAll(false)
  }

  async function handleMarkRead(id: string) {
    const result = await apiFetch(`/api/notifications/${id}`, { method: 'PATCH' })
    if (result.ok) {
      setItems((prev) =>
        prev.map((n) => n.id === id ? { ...n, isRead: true, readAt: new Date().toISOString() } : n),
      )
    }
  }

  if (!ready) return <FullPageSkeleton />

  const unreadCount = items.filter((n) => !n.isRead).length

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Notifications</h1>
          <p className="mt-1 text-sm text-gray-500">
            {loading ? 'Loading…' : unreadCount > 0
              ? `${unreadCount} unread notification${unreadCount > 1 ? 's' : ''}`
              : 'All caught up!'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setLoading(true); void fetchNotifications() }}
            className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            Refresh
          </button>
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              disabled={markingAll}
              className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60 transition-colors"
            >
              <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
              {markingAll ? 'Marking…' : 'Mark all read'}
            </button>
          )}
        </div>
      </div>

      {/* List */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        {loading ? (
          <div className="divide-y divide-gray-100">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="flex items-start gap-4 px-5 py-4">
                <Skeleton className="mt-0.5 h-10 w-10 shrink-0 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-80" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-100">
              <Bell className="h-7 w-7 text-gray-400" aria-hidden="true" />
            </div>
            <p className="text-sm font-medium text-gray-700">No notifications yet</p>
            <p className="text-xs text-gray-400">
              Enrollment confirmations, quiz results, and updates will appear here.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {items.map((notif) => {
              const cfg = TYPE_CONFIG[notif.type] ?? TYPE_CONFIG.SYSTEM
              const Icon = cfg.icon

              return (
                <li
                  key={notif.id}
                  className={`group flex items-start gap-4 px-5 py-4 transition-colors hover:bg-gray-50 ${
                    !notif.isRead ? 'bg-indigo-50/30' : ''
                  }`}
                >
                  {/* Icon */}
                  <div className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${cfg.bg}`}>
                    <Icon className={`h-5 w-5 ${cfg.iconColor}`} aria-hidden="true" />
                  </div>

                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className={`text-sm font-semibold ${notif.isRead ? 'text-gray-700' : 'text-gray-900'}`}>
                          {notif.title}
                        </p>
                        <Badge variant="outline" className="text-[10px] capitalize">
                          {cfg.label}
                        </Badge>
                      </div>
                      {!notif.isRead && (
                        <span
                          className="mt-1 inline-flex h-2.5 w-2.5 shrink-0 rounded-full bg-indigo-500"
                          aria-label="Unread"
                        />
                      )}
                    </div>
                    <p className="mt-0.5 text-sm text-gray-500 leading-relaxed">{notif.body}</p>
                    <div className="mt-1.5 flex items-center gap-3">
                      <span className="text-xs text-gray-400">{formatDateTime(notif.createdAt)}</span>
                      {notif.actionUrl && (
                        <Link
                          href={notif.actionUrl}
                          onClick={() => { if (!notif.isRead) void handleMarkRead(notif.id) }}
                          className="text-xs font-medium text-indigo-600 hover:text-indigo-500"
                        >
                          View →
                        </Link>
                      )}
                      {!notif.isRead && !notif.actionUrl && (
                        <button
                          onClick={() => void handleMarkRead(notif.id)}
                          className="text-xs text-gray-400 hover:text-gray-600"
                        >
                          Mark read
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}