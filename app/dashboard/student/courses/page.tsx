'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useAuthGuard } from '@/hooks/use-auth-guard'
import { useApiFetch } from '@/hooks/use-fetch'
import { FullPageSkeleton } from '@/components/auth/full-page-skeleton'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { BookOpen, PlayCircle, CheckCircle } from 'lucide-react'
import { formatDuration } from '@/lib/utils'

type Enrollment = {
  id: string
  status: string
  createdAt: string
  course: {
    id: string
    title: string
    slug: string
    totalLessons: number
    totalDurationSeconds: number
    level: string
  }
  tutor: { name: string }
  progress: {
    completedLessons: number
    totalLessons: number
    percentComplete: number
  }
}

export default function StudentCoursesPage() {
  const { ready } = useAuthGuard({ roles: ['STUDENT'] })
  const { apiFetch } = useApiFetch()
  const [enrollments, setEnrollments] = useState<Enrollment[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'in-progress' | 'completed'>('all')

  useEffect(() => {
    if (!ready) return
    void apiFetch<{ enrollments: Enrollment[] }>('/api/enrollments').then((r) => {
      if (r.ok) setEnrollments(r.data.enrollments)
      else toast.error(r.error)
      setLoading(false)
    })
  }, [ready, apiFetch])

  if (!ready) return <FullPageSkeleton />

  const filtered = enrollments.filter((e) => {
    if (filter === 'in-progress') return e.progress.percentComplete < 100
    if (filter === 'completed') return e.progress.percentComplete === 100
    return true
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">My Courses</h1>
          <p className="mt-1 text-sm text-gray-500">
            {loading ? '…' : `${enrollments.length} enrolled course${enrollments.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <Link
          href="/courses"
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors"
        >
          Browse More Courses
        </Link>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 rounded-lg border border-gray-200 bg-gray-50 p-1 w-fit">
        {(['all', 'in-progress', 'completed'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={[
              'rounded-md px-3 py-1.5 text-sm font-medium transition-colors capitalize',
              filter === f
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700',
            ].join(' ')}
          >
            {f.replace('-', ' ')}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-4">
              <Skeleton className="h-20 w-28 shrink-0 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-2 w-full rounded-full" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 py-16 text-center">
          <BookOpen className="mb-3 h-12 w-12 text-gray-300" aria-hidden="true" />
          <p className="text-sm font-medium text-gray-700">
            {filter === 'completed' ? 'No completed courses yet' : 'No courses found'}
          </p>
          <Link href="/courses" className="mt-3 text-sm font-medium text-indigo-600 hover:text-indigo-500">
            Browse courses →
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((enrollment) => {
            const { course, tutor, progress } = enrollment
            const isDone = progress.percentComplete === 100

            return (
              <div
                key={enrollment.id}
                className="flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-4 sm:flex-row sm:items-center"
              >
                {/* Thumbnail */}
                <div className="flex h-20 w-full shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-50 to-indigo-100 sm:w-28">
                  {isDone
                    ? <CheckCircle className="h-8 w-8 text-green-500" aria-hidden="true" />
                    : <PlayCircle className="h-8 w-8 text-indigo-400" aria-hidden="true" />
                  }
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <h3 className="text-sm font-semibold text-gray-900 truncate">{course.title}</h3>
                    {isDone && (
                      <Badge variant="success" className="text-[10px]">Completed</Badge>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mb-2">
                    {tutor.name} · {course.level.toLowerCase()}
                    {course.totalDurationSeconds > 0 && ` · ${formatDuration(course.totalDurationSeconds)}`}
                  </p>

                  {/* Progress */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>{progress.completedLessons} of {progress.totalLessons} lessons</span>
                      <span className={isDone ? 'text-green-600 font-semibold' : ''}>
                        {progress.percentComplete}%
                      </span>
                    </div>
                    <Progress value={progress.percentComplete} className="h-1.5" />
                  </div>
                </div>

                {/* Action */}
                <div className="flex shrink-0 gap-2">
                  <Link
                    href={`/dashboard/student/courses/${course.id}`}
                    className={[
                      'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition-colors',
                      isDone
                        ? 'border border-gray-300 text-gray-700 hover:bg-gray-50'
                        : 'bg-indigo-600 text-white hover:bg-indigo-500',
                    ].join(' ')}
                  >
                    <PlayCircle className="h-4 w-4" aria-hidden="true" />
                    {isDone ? 'Review' : progress.percentComplete === 0 ? 'Start' : 'Continue'}
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}