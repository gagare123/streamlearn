'use client'

import { useState, useEffect } from 'react'
import { useAuthGuard } from '@/hooks/use-auth-guard'
import { useApiFetch } from '@/hooks/use-fetch'
import { FullPageSkeleton } from '@components/auth/full-page-skeleton'
import { Skeleton } from '@components/ui/skeleton'
import { TrendingUp, Users, BookOpen, DollarSign, Award } from 'lucide-react'

type StatsData = {
  users: { total: number; byRole: Record<string, number>; newThisMonth: number; newThisWeek: number }
  courses: { total: number; byStatus: Record<string, number> }
  enrollments: { total: number; byStatus: Record<string, number> }
  revenue: { totalKobo: number; totalNaira: string }
  dailySignups: Array<{ day: string; cnt: number }>
  topCourses: Array<{ id: string; title: string; total_enrollments: number; price_kobo: number; tutor_name: string }>
}

function formatNaira(kobo: number) {
  return '₦' + (kobo / 100).toLocaleString('en-NG', { minimumFractionDigits: 0 })
}

// Simple bar chart rendered with CSS flex — no charting library needed
function BarChart({ data }: { data: Array<{ day: string; cnt: number }> }) {
  if (!data.length) return <p className="text-sm text-gray-400 text-center py-8">No data yet</p>
  const max = Math.max(...data.map((d) => d.cnt), 1)

  return (
    <div className="flex items-end gap-1.5 h-32 px-2">
      {data.map((d) => {
        const pct = Math.max(4, Math.round((d.cnt / max) * 100))
        const label = new Date(d.day).toLocaleDateString('en-NG', { month: 'short', day: 'numeric' })
        return (
          <div key={d.day} className="flex flex-1 flex-col items-center gap-1 group">
            <span className="hidden group-hover:block text-xs text-gray-500 font-medium">{d.cnt}</span>
            <div
              className="w-full rounded-t-md bg-indigo-400 hover:bg-indigo-600 transition-colors"
              style={{ height: `${pct}%` }}
              title={`${label}: ${d.cnt} users`}
              aria-label={`${label}: ${d.cnt} new users`}
            />
            <span className="text-[9px] text-gray-400 rotate-45 origin-left mt-1 hidden sm:block">
              {new Date(d.day).toLocaleDateString('en-NG', { day: 'numeric' })}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// Donut chart with CSS conic-gradient
function DonutChart({ segments }: { segments: Array<{ label: string; value: number; color: string }> }) {
  const total = segments.reduce((s, seg) => s + seg.value, 0)
  if (!total) return <p className="text-sm text-gray-400 text-center py-4">No data</p>

  let cumulative = 0
  const gradientParts = segments.map((seg) => {
    const start = (cumulative / total) * 360
    const end = ((cumulative + seg.value) / total) * 360
    cumulative += seg.value
    return `${seg.color} ${start}deg ${end}deg`
  })

  return (
    <div className="flex items-center gap-6">
      <div
        className="h-24 w-24 shrink-0 rounded-full"
        style={{
          background: `conic-gradient(${gradientParts.join(', ')})`,
          WebkitMask: 'radial-gradient(circle at center, transparent 35%, black 36%)',
          mask: 'radial-gradient(circle at center, transparent 35%, black 36%)',
        }}
        aria-hidden="true"
      />
      <div className="space-y-2">
        {segments.map((seg) => (
          <div key={seg.label} className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-sm shrink-0" style={{ background: seg.color }} aria-hidden="true" />
            <span className="text-xs text-gray-600">{seg.label}</span>
            <span className="ml-auto text-xs font-semibold text-gray-900">{seg.value.toLocaleString()}</span>
            <span className="text-xs text-gray-400 w-8 text-right">
              {total > 0 ? Math.round((seg.value / total) * 100) : 0}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function AdminAnalyticsPage() {
  const { ready }    = useAuthGuard({ roles: ['ADMIN'] })
  const { apiFetch } = useApiFetch()
  const [stats, setStats] = useState<StatsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!ready) return
    void apiFetch<StatsData>('/api/admin/stats').then((r) => {
      if (r.ok) setStats(r.data)
      setLoading(false)
    })
  }, [ready, apiFetch])

  if (!ready) return <FullPageSkeleton />

  const courseSegments = [
    { label: 'Published', value: stats?.courses.byStatus['PUBLISHED'] ?? 0, color: '#4f46e5' },
    { label: 'Draft',     value: stats?.courses.byStatus['DRAFT']     ?? 0, color: '#a5b4fc' },
    { label: 'Archived',  value: stats?.courses.byStatus['ARCHIVED']  ?? 0, color: '#e0e7ff' },
  ]

  const userSegments = [
    { label: 'Students', value: stats?.users.byRole['STUDENT'] ?? 0, color: '#3b82f6' },
    { label: 'Tutors',   value: stats?.users.byRole['TUTOR']   ?? 0, color: '#6366f1' },
    { label: 'Admins',   value: stats?.users.byRole['ADMIN']   ?? 0, color: '#8b5cf6' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-gray-900">
          <TrendingUp className="h-6 w-6 text-indigo-600" aria-hidden="true" />
          Analytics
        </h1>
        <p className="mt-1 text-sm text-gray-500">Platform-wide metrics and trends</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { icon: Users,      bg: 'bg-indigo-50', col: 'text-indigo-600', label: 'Total Users',    val: stats?.users.total ?? 0,              fmt: (v: number) => v.toLocaleString() },
          { icon: BookOpen,   bg: 'bg-blue-50',   col: 'text-blue-600',   label: 'Total Courses',  val: stats?.courses.total ?? 0,            fmt: (v: number) => v.toLocaleString() },
          { icon: Award,      bg: 'bg-green-50',  col: 'text-green-600',  label: 'Enrollments',    val: stats?.enrollments.total ?? 0,        fmt: (v: number) => v.toLocaleString() },
          { icon: DollarSign, bg: 'bg-amber-50',  col: 'text-amber-600',  label: 'Total Revenue',  val: stats?.revenue.totalKobo ?? 0,        fmt: (v: number) => formatNaira(v) },
        ].map(({ icon: Icon, bg, col, label, val, fmt }) => (
          <div key={label} className="rounded-xl border border-gray-200 bg-white p-4">
            <div className={'flex h-9 w-9 items-center justify-center rounded-lg ' + bg}>
              <Icon className={'h-5 w-5 ' + col} aria-hidden="true" />
            </div>
            {loading
              ? <><Skeleton className="mt-3 h-7 w-20" /><Skeleton className="mt-1 h-3 w-24" /></>
              : <><p className="mt-3 text-2xl font-bold text-gray-900">{fmt(val)}</p>
                  <p className="text-xs text-gray-500">{label}</p></>
            }
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Daily signups bar chart */}
        <div className="lg:col-span-2 rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="mb-1 text-sm font-semibold text-gray-900">New Signups — Last 14 Days</h2>
          <p className="mb-4 text-xs text-gray-400">Daily new user registrations</p>
          {loading
            ? <Skeleton className="h-32 w-full rounded-lg" />
            : <BarChart data={stats?.dailySignups ?? []} />
          }
        </div>

        {/* User role donut */}
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="mb-1 text-sm font-semibold text-gray-900">Users by Role</h2>
          <p className="mb-4 text-xs text-gray-400">Distribution of account types</p>
          {loading
            ? <Skeleton className="h-24 w-24 rounded-full mx-auto" />
            : <DonutChart segments={userSegments} />
          }
        </div>
      </div>

      {/* Courses breakdown */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="mb-1 text-sm font-semibold text-gray-900">Courses by Status</h2>
          <p className="mb-4 text-xs text-gray-400">Published vs Draft vs Archived</p>
          {loading
            ? <Skeleton className="h-24 w-24 rounded-full mx-auto" />
            : <DonutChart segments={courseSegments} />
          }
        </div>

        {/* Enrollment funnel */}
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold text-gray-900">Enrollment Status</h2>
          {loading
            ? <div className="space-y-3">{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-8 w-full rounded" />)}</div>
            : (
              <div className="space-y-3">
                {[
                  { label: 'Active',    key: 'ACTIVE',    color: 'bg-indigo-500' },
                  { label: 'Completed', key: 'COMPLETED', color: 'bg-green-500' },
                  { label: 'Refunded',  key: 'REFUNDED',  color: 'bg-red-400' },
                ].map(({ label, key, color }) => {
                  const cnt   = stats?.enrollments.byStatus[key] ?? 0
                  const total = stats?.enrollments.total ?? 1
                  const pct   = total > 0 ? Math.round((cnt / total) * 100) : 0
                  return (
                    <div key={key}>
                      <div className="mb-1 flex justify-between text-xs text-gray-600">
                        <span>{label}</span>
                        <span className="font-medium">{cnt.toLocaleString()} ({pct}%)</span>
                      </div>
                      <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
                        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          }
        </div>
      </div>

      {/* Growth highlights */}
      {!loading && stats && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { label: 'New users this week',  val: stats.users.newThisWeek,  color: 'text-green-600' },
            { label: 'New users this month', val: stats.users.newThisMonth, color: 'text-indigo-600' },
            { label: 'Published courses',    val: stats.courses.byStatus['PUBLISHED'] ?? 0, color: 'text-blue-600' },
            { label: 'Completed enrollments',val: stats.enrollments.byStatus['COMPLETED'] ?? 0, color: 'text-amber-600' },
          ].map(({ label, val, color }) => (
            <div key={label} className="rounded-xl border border-gray-200 bg-white p-4 text-center">
              <p className={'text-3xl font-bold ' + color}>{val.toLocaleString()}</p>
              <p className="mt-1 text-xs text-gray-500">{label}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}