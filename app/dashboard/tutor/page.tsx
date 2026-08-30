'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useAuthGuard } from '@/hooks/use-auth-guard'
import { useApiFetch } from '@/hooks/use-fetch'
import { FullPageSkeleton } from '@/components/auth/full-page-skeleton'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { BookOpen, Users, DollarSign, PlusCircle, Eye, ClipboardList, ArrowRight } from 'lucide-react'
import { formatNaira } from '@/lib/utils'

type Course = {
  id: string
  title: string
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
  totalLessons: number
  totalEnrollments: number
  priceKobo: number
}

type CoursesResponse = { courses: Course[]; pagination: { total: number } }

const STATUS_BADGE: Record<string, 'success' | 'secondary' | 'outline'> = {
  PUBLISHED: 'success',
  DRAFT: 'secondary',
  ARCHIVED: 'outline',
}

export default function TutorDashboardPage() {
  const { ready, user } = useAuthGuard({ roles: ['TUTOR', 'ADMIN'] })
  const { apiFetch } = useApiFetch()
  const [courses, setCourses] = useState<Course[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!ready) return
    void apiFetch<CoursesResponse>('/api/courses?limit=5').then((r) => {
      if (r.ok) {
        // Filter out any courses with missing IDs
        const validCourses = (r.data.courses ?? []).filter((c) => c && c.id)
        setCourses(validCourses)
        setTotal(r.data.pagination?.total ?? 0)
      }
      setLoading(false)
    })
  }, [ready, apiFetch])

  if (!ready) return <FullPageSkeleton />

  const published = courses.filter((c) => c.status === 'PUBLISHED').length
  const totalStudents = courses.reduce((s, c) => s + (c.totalEnrollments || 0), 0)
  const totalRevenue = courses.reduce((s, c) => s + (c.priceKobo || 0) * (c.totalEnrollments || 0), 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Tutor Dashboard</h1>
          <p className="mt-1 text-sm text-gray-500">Welcome back, {user?.name?.split(' ')[0] || 'there'}.</p>
        </div>
        <Link
          href="/dashboard/tutor/courses/new"
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors"
        >
          <PlusCircle className="h-4 w-4" />
          New Course
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {loading ? (
          Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="rounded-lg border border-gray-200 bg-white p-4">
              <Skeleton className="mb-3 h-8 w-8 rounded-lg" />
              <Skeleton className="mb-1 h-7 w-16" />
              <Skeleton className="h-3 w-24" />
            </div>
          ))
        ) : (
          [
            { icon: BookOpen, bg: 'bg-indigo-50', col: 'text-indigo-600', v: String(total), label: 'Total Courses', sub: `${published} published` },
            { icon: Users, bg: 'bg-blue-50', col: 'text-blue-600', v: String(totalStudents), label: 'Total Students', sub: 'across all courses' },
            { icon: DollarSign, bg: 'bg-green-50', col: 'text-green-600', v: formatNaira(totalRevenue), label: 'Est. Revenue', sub: 'cumulative' },
            { icon: ClipboardList, bg: 'bg-amber-50', col: 'text-amber-600', v: String(courses.filter((c) => c.status === 'DRAFT').length), label: 'Drafts', sub: 'in progress' },
          ].map(({ icon: Icon, bg, col, v, label, sub }) => (
            <div key={label} className="rounded-lg border border-gray-200 bg-white p-4">
              <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${bg}`}>
                <Icon className={`h-5 w-5 ${col}`} />
              </div>
              <p className="mt-3 text-2xl font-bold text-gray-900">{v}</p>
              <p className="text-xs text-gray-500">{label}</p>
              <p className="mt-0.5 text-xs text-gray-400">{sub}</p>
            </div>
          ))
        )}
      </div>

      {/* My Courses */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">My Courses</h2>
          <Link href="/dashboard/tutor/courses" className="flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-500">
            View all <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          {loading ? (
            <div className="divide-y divide-gray-100">
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="flex items-center gap-4 px-5 py-4">
                  <Skeleton className="h-10 w-10 rounded-lg" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                  <Skeleton className="h-6 w-16 rounded-full" />
                  <Skeleton className="h-8 w-20 rounded-md" />
                </div>
              ))}
            </div>
          ) : courses.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-center">
              <BookOpen className="mb-3 h-10 w-10 text-gray-300" />
              <p className="text-sm font-medium text-gray-700">No courses yet</p>
              <Link href="/dashboard/tutor/courses/new" className="mt-3 text-sm font-medium text-indigo-600 hover:text-indigo-500">
                Create your first course →
              </Link>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {courses.map((course) => (
                <li key={course.id} className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-50">
                    <BookOpen className="h-5 w-5 text-indigo-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-gray-900">{course.title}</p>
                    <p className="text-xs text-gray-400">
                      {course.totalLessons} lesson{course.totalLessons !== 1 ? 's' : ''} · {course.totalEnrollments} enrolled · {course.priceKobo === 0 ? 'Free' : formatNaira(course.priceKobo)}
                    </p>
                  </div>
                  <Badge variant={STATUS_BADGE[course.status] ?? 'outline'} className="shrink-0 text-[10px]">
                    {course.status}
                  </Badge>
                  <Link
                    href={course.id ? `/dashboard/tutor/courses/${course.id}` : '#'}
                    className="shrink-0 flex items-center gap-1 rounded-md border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors"
                  >
                    <Eye className="h-3 w-3" />
                    Manage
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Quick Actions */}
      <section>
        <h2 className="mb-4 text-base font-semibold text-gray-900">Quick Actions</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'New Course', href: '/dashboard/tutor/courses/new', icon: PlusCircle },
            { label: 'All Courses', href: '/dashboard/tutor/courses', icon: BookOpen },
            { label: 'Students', href: '/dashboard/tutor/students', icon: Users },
            { label: 'Quizzes', href: '/dashboard/tutor/quizzes', icon: ClipboardList },
          ].map(({ label, href, icon: Icon }) => (
            <Link
              key={label}
              href={href}
              className="flex flex-col items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-4 text-center text-sm font-medium text-gray-700 transition-all hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100">
                <Icon className="h-5 w-5 text-gray-500" />
              </div>
              {label}
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}