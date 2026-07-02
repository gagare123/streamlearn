'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuthGuard } from '@/hooks/use-auth-guard'
import { useApiFetch } from '@/hooks/use-fetch'
import { FullPageSkeleton } from '@/components/auth/full-page-skeleton'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import { BookOpen, RefreshCw } from 'lucide-react'

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
    setLoading(false)
  }, [apiFetch])

  useEffect(() => { if (ready) void fetchCourses() }, [ready, fetchCourses])

  if (!ready) return <FullPageSkeleton />

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <BookOpen className="h-6 w-6 text-indigo-600" />
            All Courses
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {courses.length} courses
          </p>
        </div>
        <button onClick={() => void fetchCourses()}
          className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-left text-xs font-semibold uppercase text-gray-500">
              <th className="px-4 py-3">Course</th>
              <th className="px-4 py-3">Tutor</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Enrollments</th>
              <th className="px-4 py-3">Price</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading
              ? Array.from({ length: 5 }, (_, i) => (
                  <tr key={i}>
                    {[1,2,3,4,5].map((j) => (
                      <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full rounded" /></td>
                    ))}
                  </tr>
                ))
              : courses.map((course) => (
                  <tr key={course.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{course.title}</td>
                    <td className="px-4 py-3 text-gray-500">{course.tutorName}</td>
                    <td className="px-4 py-3">
                      <Badge variant={course.status === 'PUBLISHED' ? 'success' : 'secondary'}>
                        {course.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{course.totalEnrollments}</td>
                    <td className="px-4 py-3 text-gray-500">
                      {course.priceKobo > 0 ? `₦${(course.priceKobo / 100).toFixed(2)}` : 'Free'}
                    </td>
                  </tr>
                ))
            }
          </tbody>
        </table>
      </div>
    </div>
  )
}