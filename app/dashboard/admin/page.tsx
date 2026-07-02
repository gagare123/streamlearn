'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useAuthGuard } from '@/hooks/use-auth-guard'
import { useApiFetch } from '@/hooks/use-fetch'
import { FullPageSkeleton } from '@components/auth/full-page-skeleton'
import { Skeleton } from '@components/ui/skeleton'
import { Badge } from '@components/ui/badge'
import { Users, BookOpen, DollarSign, TrendingUp, Shield, Activity, ArrowRight } from 'lucide-react'

type StatsData = {
  users: { total: number; byRole: Record<string, number>; newThisMonth: number; newThisWeek: number }
  courses: { total: number; byStatus: Record<string, number> }
  enrollments: { total: number; byStatus: Record<string, number> }
  revenue: { totalKobo: number; totalNaira: string }
  recentActivity: Array<{ id: string; action: string; created_at: string; actor_name: string | null; actor_email: string | null }>
  topCourses: Array<{ id: string; title: string; total_enrollments: number; price_kobo: number; tutor_name: string }>
}

function formatNaira(kobo: number) {
  return '₦' + (kobo / 100).toLocaleString('en-NG', { minimumFractionDigits: 0 })
}

function StatCard({ icon: Icon, bg, col, value, label, sub }: {
  icon: React.ElementType; bg: string; col: string; value: string; label: string; sub?: string
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-none">
      <div className={'flex h-9 w-9 items-center justify-center rounded-lg ' + bg}>
        <Icon className={'h-5 w-5 ' + col} aria-hidden="true" />
      </div>
      <p className="mt-3 text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-xs text-gray-500">{label}</p>
      {sub && <p className="mt-0.5 text-xs text-green-600 font-medium">{sub}</p>}
    </div>
  )
}

export default function AdminDashboardPage() {
  const { ready, user } = useAuthGuard({ roles: ['ADMIN'] })
  const { apiFetch }    = useApiFetch()
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Admin Dashboard</h1>
          <Badge variant="default" className="text-xs">Admin</Badge>
        </div>
        <p className="mt-1 text-sm text-gray-500">System overview — logged in as {user.email}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {loading ? Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="rounded-xl border border-gray-200 bg-white p-4">
            <Skeleton className="mb-3 h-9 w-9 rounded-lg" />
            <Skeleton className="mb-1 h-7 w-20" />
            <Skeleton className="h-3 w-24" />
          </div>
        )) : (<>
          <StatCard icon={Users}      bg="bg-indigo-50" col="text-indigo-600"
            value={stats?.users.total.toLocaleString() ?? '—'} label="Total Users"
            sub={'+' + (stats?.users.newThisWeek ?? 0) + ' this week'} />
          <StatCard icon={BookOpen}   bg="bg-blue-50"   col="text-blue-600"
            value={stats?.courses.total.toLocaleString() ?? '—'} label="Courses"
            sub={(stats?.courses.byStatus['PUBLISHED'] ?? 0) + ' published'} />
          <StatCard icon={TrendingUp} bg="bg-green-50"  col="text-green-600"
            value={stats?.enrollments.total.toLocaleString() ?? '—'} label="Enrollments"
            sub={(stats?.enrollments.byStatus['COMPLETED'] ?? 0) + ' completed'} />
          <StatCard icon={DollarSign} bg="bg-amber-50"  col="text-amber-600"
            value={stats ? formatNaira(stats.revenue.totalKobo) : '—'} label="Revenue" sub="All time" />
        </>)}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* User breakdown */}
        <div className="lg:col-span-1">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900">
              <Users className="h-4 w-4 text-gray-400" aria-hidden="true" />
              Users by Role
            </h2>
            <Link href="/dashboard/admin/users" className="text-sm font-medium text-indigo-600 hover:text-indigo-500">
              Manage <ArrowRight className="inline h-3 w-3" aria-hidden="true" />
            </Link>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white">
            {[
              { role: 'STUDENT', label: 'Students', color: 'bg-blue-500' },
              { role: 'TUTOR',   label: 'Tutors',   color: 'bg-indigo-500' },
              { role: 'ADMIN',   label: 'Admins',   color: 'bg-purple-500' },
            ].map(({ role, label, color }) => {
              const cnt   = stats?.users.byRole[role] ?? 0
              const total = stats?.users.total ?? 1
              const pct   = total > 0 ? Math.round((cnt / total) * 100) : 0
              return (
                <div key={role} className="flex items-center gap-4 border-b border-gray-100 px-5 py-3.5 last:border-0">
                  <span className={'h-2.5 w-2.5 rounded-full ' + color} aria-hidden="true" />
                  <span className="flex-1 text-sm text-gray-700">{label}</span>
                  <span className="text-sm font-semibold text-gray-900">{loading ? '—' : cnt.toLocaleString()}</span>
                  <span className="w-9 text-right text-xs text-gray-400">{loading ? '' : pct + '%'}</span>
                </div>
              )
            })}
            {!loading && (
              <p className="px-5 py-2 text-center text-xs text-gray-400">
                +{stats?.users.newThisMonth ?? 0} new this month
              </p>
            )}
          </div>
        </div>

        {/* Recent activity */}
        <div className="lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900">
              <Shield className="h-4 w-4 text-gray-400" aria-hidden="true" />
              Recent Activity
            </h2>
            <Link href="/dashboard/admin/audit" className="text-sm font-medium text-indigo-600 hover:text-indigo-500">
              Full log <ArrowRight className="inline h-3 w-3" aria-hidden="true" />
            </Link>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white">
            {loading ? (
              Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 last:border-0">
                  <Skeleton className="h-5 w-5 rounded-full" />
                  <Skeleton className="h-4 flex-1" />
                  <Skeleton className="h-3 w-20" />
                </div>
              ))
            ) : (stats?.recentActivity ?? []).length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-400">No recent activity</p>
            ) : (
              (stats?.recentActivity ?? []).map((e) => (
                <div key={e.id} className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 last:border-0">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100">
                    <Activity className="h-3 w-3 text-gray-500" aria-hidden="true" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="truncate font-mono text-xs text-gray-700">{e.action}</span>
                    {e.actor_name && <span className="ml-2 text-xs text-gray-400">{e.actor_name}</span>}
                  </div>
                  <span className="shrink-0 text-xs text-gray-400">
                    {new Date(e.created_at).toLocaleString('en-NG', { dateStyle: 'short', timeStyle: 'short' })}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Top courses */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Top Courses by Enrollment</h2>
        </div>
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                <th className="px-4 py-3">Course</th>
                <th className="px-4 py-3 hidden sm:table-cell">Tutor</th>
                <th className="px-4 py-3">Enrollments</th>
                <th className="px-4 py-3 hidden md:table-cell">Price</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? Array.from({ length: 5 }, (_, i) => (
                <tr key={i}><td className="px-4 py-3" colSpan={4}><Skeleton className="h-4 w-full" /></td></tr>
              )) : (stats?.topCourses ?? []).length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-400">No published courses yet</td></tr>
              ) : (stats?.topCourses ?? []).map((c, i) => (
                <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">
                        {i + 1}
                      </span>
                      <span className="truncate font-medium text-gray-900 max-w-[200px]">{c.title}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">{c.tutor_name}</td>
                  <td className="px-4 py-3 font-semibold text-gray-900">{c.total_enrollments.toLocaleString()}</td>
                  <td className="px-4 py-3 text-gray-500 hidden md:table-cell">
                    {c.price_kobo === 0 ? 'Free' : formatNaira(c.price_kobo)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Admin quick links */}
      <div>
        <h2 className="mb-4 text-base font-semibold text-gray-900">Admin Controls</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'Manage Users',  href: '/dashboard/admin/users',     icon: Users },
            { label: 'Analytics',     href: '/dashboard/admin/analytics',  icon: TrendingUp },
            { label: 'Audit Log',     href: '/dashboard/admin/audit',      icon: Shield },
            { label: 'All Courses',   href: '/dashboard/admin/courses',    icon: BookOpen },
          ].map(({ label, href, icon: Icon }) => (
            <Link key={label} href={href}
              className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3.5 text-sm font-medium text-gray-700 transition-all hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700">
              <Icon className="h-4 w-4 text-gray-400" aria-hidden="true" />{label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}