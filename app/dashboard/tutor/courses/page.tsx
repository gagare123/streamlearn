'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useAuthGuard } from '@/hooks/use-auth-guard'
import { useApiFetch } from '@/hooks/use-fetch'
import { FullPageSkeleton } from '@/components/auth/full-page-skeleton'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { formatNaira, formatDuration, formatDate } from '@/lib/utils'
import {
  PlusCircle, BookOpen, Users, Clock,
  Eye, Edit, MoreVertical, Globe, Archive,
} from 'lucide-react'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

type Course = {
  id: string
  title: string
  slug: string
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
  level: string
  priceKobo: number
  totalLessons: number
  totalDurationSeconds: number
  totalEnrollments: number
  createdAt: string
}

type CoursesResponse = {
  courses: Course[]
  pagination: { page: number; limit: number; total: number; totalPages: number }
}

const STATUS_BADGE: Record<string, 'success' | 'secondary' | 'outline'> = {
  PUBLISHED: 'success',
  DRAFT: 'secondary',
  ARCHIVED: 'outline',
}

export default function TutorCoursesPage() {
  const { ready } = useAuthGuard({ roles: ['TUTOR', 'ADMIN'] })
  const { apiFetch } = useApiFetch()
  const [data, setData] = useState<CoursesResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionId, setActionId] = useState<string | null>(null)

  const fetchCourses = useCallback(async () => {
    setLoading(true)
    const result = await apiFetch<CoursesResponse>('/api/courses?limit=50')
    if (result.ok) setData(result.data)
    else toast.error(result.error)
    setLoading(false)
  }, [apiFetch])

  useEffect(() => { if (ready) void fetchCourses() }, [ready, fetchCourses])

  async function handleStatusChange(courseId: string, status: 'PUBLISHED' | 'ARCHIVED' | 'DRAFT') {
    setActionId(courseId)
    const result = await apiFetch(`/api/courses/${courseId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    })
    if (result.ok) {
      toast.success(`Course ${status.toLowerCase()} successfully`)
      void fetchCourses()
    } else {
      toast.error(result.error)
    }
    setActionId(null)
  }

  if (!ready) return <FullPageSkeleton />

  const courses = data?.courses ?? []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">My Courses</h1>
          <p className="mt-1 text-sm text-gray-500">
            {data?.pagination.total ?? 0} course{data?.pagination.total !== 1 ? 's' : ''}
          </p>
        </div>
        <Link
          href="/dashboard/tutor/courses/new"
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 transition-colors"
        >
          <PlusCircle className="h-4 w-4" aria-hidden="true" />
          New Course
        </Link>
      </div>

      {/* Course grid */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="rounded-xl border border-gray-200 bg-white p-4">
              <Skeleton className="mb-3 h-36 w-full rounded-lg" />
              <Skeleton className="mb-2 h-5 w-3/4" />
              <Skeleton className="mb-3 h-4 w-1/2" />
              <div className="flex gap-2">
                <Skeleton className="h-6 w-16 rounded-full" />
                <Skeleton className="h-6 w-12 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      ) : courses.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 py-16 text-center">
          <BookOpen className="mb-3 h-12 w-12 text-gray-300" aria-hidden="true" />
          <h3 className="text-base font-semibold text-gray-700">No courses yet</h3>
          <p className="mt-1 text-sm text-gray-500">
            Create your first course to start teaching.
          </p>
          <Link
            href="/dashboard/tutor/courses/new"
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
          >
            <PlusCircle className="h-4 w-4" aria-hidden="true" />
            Create Course
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((course) => (
            <div key={course.id} className="group relative flex flex-col rounded-xl border border-gray-200 bg-white shadow-none transition-shadow hover:shadow-sm">
              {/* Thumbnail */}
              <div className="flex h-36 items-center justify-center rounded-t-xl bg-gradient-to-br from-indigo-50 to-indigo-100">
                <BookOpen className="h-12 w-12 text-indigo-300" aria-hidden="true" />
              </div>

              {/* Content */}
              <div className="flex flex-1 flex-col p-4">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <h3 className="line-clamp-2 text-sm font-semibold text-gray-900 leading-snug">
                    {course.title}
                  </h3>
                  {/* Action menu */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        className="shrink-0 rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                        disabled={actionId === course.id}
                        aria-label="Course actions"
                      >
                        <MoreVertical className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuItem asChild>
                        <Link href={`/dashboard/tutor/courses/${course.id}`}>
                          <Edit className="mr-2 h-4 w-4" />
                          Edit
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {course.status === 'DRAFT' && (
                        <DropdownMenuItem
                          onClick={() => handleStatusChange(course.id, 'PUBLISHED')}
                          disabled={course.totalLessons < 1}
                          className="text-green-700 focus:bg-green-50"
                        >
                          <Globe className="mr-2 h-4 w-4" />
                          Publish
                        </DropdownMenuItem>
                      )}
                      {course.status === 'PUBLISHED' && (
                        <DropdownMenuItem
                          onClick={() => handleStatusChange(course.id, 'DRAFT')}
                          className="text-amber-700 focus:bg-amber-50"
                        >
                          <Edit className="mr-2 h-4 w-4" />
                          Unpublish
                        </DropdownMenuItem>
                      )}
                      {course.status !== 'ARCHIVED' && (
                        <DropdownMenuItem
                          onClick={() => handleStatusChange(course.id, 'ARCHIVED')}
                          className="text-red-600 focus:bg-red-50"
                        >
                          <Archive className="mr-2 h-4 w-4" />
                          Archive
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {/* Meta */}
                <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                  <Badge variant={STATUS_BADGE[course.status] ?? 'outline'} className="text-[10px]">
                    {course.status}
                  </Badge>
                  <span className="capitalize">{course.level.toLowerCase()}</span>
                </div>

                <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
                  <span className="flex items-center gap-1">
                    <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
                    {course.totalLessons} lesson{course.totalLessons !== 1 ? 's' : ''}
                  </span>
                  <span className="flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" aria-hidden="true" />
                    {course.totalEnrollments} enrolled
                  </span>
                  {course.totalDurationSeconds > 0 && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                      {formatDuration(course.totalDurationSeconds)}
                    </span>
                  )}
                </div>

                <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-3">
                  <span className="text-sm font-semibold text-gray-900">
                    {course.priceKobo === 0 ? 'Free' : formatNaira(course.priceKobo)}
                  </span>
                  <Link
                    href={`/dashboard/tutor/courses/${course.id}`}
                    className="flex items-center gap-1 rounded-md border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    <Eye className="h-3 w-3" aria-hidden="true" />
                    Manage
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}