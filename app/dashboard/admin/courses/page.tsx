'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useAuthGuard } from '@/hooks/use-auth-guard'
import { useApiFetch } from '@/hooks/use-fetch'
import { FullPageSkeleton } from '@/components/auth/full-page-skeleton'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { BookOpen, RefreshCw, ExternalLink, Settings2 } from 'lucide-react'

type CourseRow = {
  id: string
  title: string
  status: string
  tutorName: string
  totalEnrollments: number
  priceKobo: number
  createdAt: string
}

export default function AdminCoursesPage() {
  const { ready } = useAuthGuard({ roles: ['ADMIN'] })
  const { apiFetch } = useApiFetch()
  const [courses, setCourses] = useState<CourseRow[]>([])
  const [loading, setLoading] = useState(true)

  const fetchCourses = useCallback(async () => {
    setLoading(true)
    const r = await apiFetch<{ courses: CourseRow[] }>('/api/admin/courses')
    if (r.ok) setCourses(r.data.courses)
    else toast.error(r.error)
    setLoading(false)
  }, [apiFetch])

  useEffect(() => { if (ready) void fetchCourses() }, [ready, fetchCourses])

  if (!ready) return <FullPageSkeleton />

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <BookOpen className="h-6 w-6 text-indigo-600" />
            All Courses
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {loading ? 'Loading…' : `${courses.length} course${courses.length !== 1 ? 's' : ''} on the platform`}
          </p>
        </div>
        <button
          onClick={() => void fetchCourses()}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              <th className="px-4 py-3">Course</th>
              <th className="px-4 py-3 hidden md:table-cell">Tutor</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 hidden sm:table-cell">Enrollments</th>
              <th className="px-4 py-3 hidden lg:table-cell">Price</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              Array.from({ length: 5 }, (_, i) => (
                <tr key={i}>
                  {[1, 2, 3, 4, 5, 6].map((j) => (
                    <td key={j} className="px-4 py-3">
                      <Skeleton className="h-4 w-full rounded" />
                    </td>
                  ))}
                </tr>
              ))
            ) : courses.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-400">
                  No courses on the platform yet
                </td>
              </tr>
            ) : (
              courses.map((course) => (
                <tr key={course.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900 line-clamp-1">{course.title}</p>
                    <p className="text-xs text-gray-400 font-mono md:hidden">
                      {course.tutorName}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-gray-500 hidden md:table-cell">
                    {course.tutorName}
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      variant={
                        course.status === 'PUBLISHED'
                          ? 'success'
                          : course.status === 'DRAFT'
                            ? 'secondary'
                            : 'outline'
                      }
                    >
                      {course.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">
                    {course.totalEnrollments}
                  </td>
                  <td className="px-4 py-3 text-gray-500 hidden lg:table-cell">
                    {course.priceKobo > 0 ? `₦${(course.priceKobo / 100).toFixed(2)}` : 'Free'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                     

                      {/* Manage (full editor) */}
                      <Link
                        href={`/dashboard/tutor/courses/${course.id}`}
                        className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-indigo-500 transition-colors"
                        title="Manage course (edit, sections, lessons, publish)"
                      >
                        <Settings2 className="h-3 w-3" />
                        Manage
                      </Link>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Info note */}
      <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
        <p className="text-sm text-blue-800">
          <span className="font-semibold">Admin access:</span>{' '}
          Click <span className="font-semibold">Manage</span> on any course to edit it as if you
          were the tutor — add sections, upload videos, publish, unpublish, or delete.
        </p>
      </div>
    </div>
  )
}