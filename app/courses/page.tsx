'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useApiFetch } from '@/hooks/use-fetch'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { BookOpen } from 'lucide-react'

type CourseRow = {
  id: string
  title: string
  slug: string
  status: string
  tutorName: string
  totalLessons: number
  priceKobo: number
  level: string
}

export default function PublicCoursesPage() {
  const { apiFetch } = useApiFetch()
  const [courses, setCourses] = useState<CourseRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void apiFetch<{ courses: CourseRow[] }>('/api/courses').then((r) => {
      if (r.ok) setCourses(r.data.courses)
      setLoading(false)
    })
  }, [apiFetch])

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Browse Courses</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {loading
          ? Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="rounded-xl border border-gray-200 bg-white p-5">
                <Skeleton className="mb-3 h-5 w-3/4" />
                <Skeleton className="mb-2 h-4 w-1/2" />
                <Skeleton className="h-4 w-20" />
              </div>
            ))
          : courses
              .filter((c) => c.status === 'PUBLISHED')
              .map((course) => (
                <Link
                  key={course.id}
                  href={`/dashboard/student/courses/${course.id}`}
                  className="rounded-xl border border-gray-200 bg-white p-5 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <BookOpen className="h-4 w-4 text-indigo-600" />
                    <h2 className="font-semibold text-gray-900">{course.title}</h2>
                  </div>
                  <p className="text-sm text-gray-500 mb-2">{course.tutorName}</p>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">{course.level}</Badge>
                    <span className="text-sm font-medium text-gray-700">
                      {course.priceKobo > 0 ? `₦${(course.priceKobo / 100).toFixed(2)}` : 'Free'}
                    </span>
                  </div>
                </Link>
              ))
        }
      </div>
    </div>
  )
}