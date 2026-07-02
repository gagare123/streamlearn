'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuthGuard } from '@/hooks/use-auth-guard'
import { useApiFetch } from '@/hooks/use-fetch'
import { FullPageSkeleton } from '@/components/auth/full-page-skeleton'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { formatNaira, formatDuration } from '@/lib/utils'
import {
  PlayCircle, CheckCircle, Lock, Clock,
  ChevronDown, ChevronRight, ArrowLeft, BookOpen,
} from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type Lesson = {
  id: string
  title: string
  position: number
  muxPlaybackId: string | null
  muxAssetStatus: string
  durationSeconds: number
  isFreePreview: boolean
  progress?: { watchedSeconds: number; isCompleted: boolean }
}

type Section = {
  id: string
  title: string
  position: number
  lessons: Lesson[]
}

type CourseDetail = {
  id: string
  title: string
  description: string | null
  status: string
  level: string
  priceKobo: number
  totalLessons: number
  totalDurationSeconds: number
  tags: string[]
  curriculum: Section[]
  tutor: { id: string; name: string; bio: string | null }
}

type EnrollmentData = {
  id: string
  status: string
  progress: { completedLessons: number; totalLessons: number; percentComplete: number }
  curriculum: Section[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function StudentCourseViewPage() {
  const { ready, user } = useAuthGuard({ roles: ['STUDENT'] })
  const { apiFetch } = useApiFetch()
  const params = useParams()
  const router = useRouter()
  const courseId = params['id'] as string

  const [course, setCourse] = useState<CourseDetail | null>(null)
  const [enrollment, setEnrollment] = useState<EnrollmentData | null>(null)
  const [loadingCourse, setLoadingCourse] = useState(true)
  const [enrolling, setEnrolling] = useState(false)
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set())

  // ── Fetch course ──────────────────────────────────────────────────────────
  const fetchCourse = useCallback(async () => {
    const result = await apiFetch<{ course: CourseDetail }>(`/api/courses/${courseId}`)
    if (result.ok) {
      setCourse(result.data.course)
      // Auto-expand all sections
      setExpandedSections(new Set(result.data.course.curriculum.map((s) => s.id)))
    } else {
      toast.error(result.error)
    }
    setLoadingCourse(false)
  }, [apiFetch, courseId])

  // ── Fetch enrollment + progress ──────────────────────────────────────────
  const fetchEnrollments = useCallback(async () => {
    const result = await apiFetch<{ enrollments: Array<{ id: string; course: { id: string }; status: string; progress: EnrollmentData['progress'] }> }>(
      '/api/enrollments',
    )
    if (result.ok) {
      const found = result.data.enrollments.find((e) => e.course.id === courseId)
      if (found) {
        // Fetch full enrollment detail with curriculum progress
        const detail = await apiFetch<{ enrollment: EnrollmentData }>(`/api/enrollments/${found.id}`)
        if (detail.ok) setEnrollment(detail.data.enrollment)
      }
    }
  }, [apiFetch, courseId])

  useEffect(() => {
    if (!ready) return
    void Promise.all([fetchCourse(), fetchEnrollments()])
  }, [ready, fetchCourse, fetchEnrollments])

  // ── Handle enrollment (free or paid) ────────────────────────────────────
  async function handleEnroll() {
    setEnrolling(true)
    const result = await apiFetch<{
      type: 'free' | 'paid'
      enrolled?: boolean
      authorizationUrl?: string
      reference?: string
    }>('/api/payments/initialize', {
      method: 'POST',
      body: JSON.stringify({ courseId }),
    })

    if (!result.ok) {
      toast.error(result.error)
      setEnrolling(false)
      return
    }

    if (result.data.type === 'free') {
      toast.success('Enrolled successfully! Start learning.')
      void fetchEnrollments()
      setEnrolling(false)
      return
    }

    // Paid course — redirect to Paystack
    if (result.data.authorizationUrl) {
      window.location.href = result.data.authorizationUrl
    }
  }

  if (!ready) return <FullPageSkeleton />

  if (loadingCourse) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-full max-w-2xl" />
        <Skeleton className="h-4 w-3/4 max-w-xl" />
        <div className="space-y-3">
          {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
        </div>
      </div>
    )
  }

  if (!course) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-gray-500">Course not found.</p>
        <Link href="/dashboard/student/courses" className="mt-3 text-sm text-indigo-600 hover:underline">
          Back to my courses
        </Link>
      </div>
    )
  }

  const isEnrolled = !!enrollment
  const isFree = course.priceKobo === 0

  // Merge progress data into curriculum for enrolled students
  const curriculum = isEnrolled ? (enrollment.curriculum ?? course.curriculum) : course.curriculum

  const totalCompleted = enrollment?.progress.completedLessons ?? 0
  const progressPct = enrollment?.progress.percentComplete ?? 0

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href="/dashboard/student/courses"
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        My Courses
      </Link>

      {/* Course header */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <Badge variant="secondary" className="capitalize text-xs">
                {course.level.toLowerCase()}
              </Badge>
              {course.tags.slice(0, 3).map((tag) => (
                <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
              ))}
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">{course.title}</h1>
            {course.description && (
              <p className="mt-2 text-sm leading-relaxed text-gray-600">{course.description}</p>
            )}
            <p className="mt-2 text-sm text-gray-500">
              By <span className="font-medium text-gray-700">{course.tutor.name}</span>
              {' · '}{course.totalLessons} lessons
              {course.totalDurationSeconds > 0 && ` · ${formatDuration(course.totalDurationSeconds)}`}
            </p>
          </div>

          {/* Progress bar (enrolled only) */}
          {isEnrolled && (
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-900">Your Progress</p>
                <span className={`text-sm font-bold ${progressPct === 100 ? 'text-green-600' : 'text-indigo-600'}`}>
                  {progressPct}%
                </span>
              </div>
              <Progress value={progressPct} className="mb-2 h-2" />
              <p className="text-xs text-gray-500">
                {totalCompleted} of {course.totalLessons} lessons completed
                {progressPct === 100 && ' 🎉 Course complete!'}
              </p>
            </div>
          )}
        </div>

        {/* Enroll card */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm h-fit">
          <div className="mb-4 text-center">
            <p className="text-3xl font-bold text-gray-900">
              {isFree ? 'Free' : formatNaira(course.priceKobo)}
            </p>
            {!isFree && (
              <p className="mt-1 text-xs text-gray-400">One-time payment · Lifetime access</p>
            )}
          </div>

          {isEnrolled ? (
            <div className="space-y-3">
              <div className="flex items-center justify-center gap-2 rounded-lg bg-green-50 py-3 text-sm font-semibold text-green-700">
                <CheckCircle className="h-4 w-4" aria-hidden="true" />
                Enrolled
              </div>
              <button
                onClick={() => {
                  // Find first incomplete lesson and navigate there
                  const firstSection = curriculum[0]
                  const firstLesson = firstSection?.lessons[0]
                  if (firstLesson) {
                    router.push(`/dashboard/student/courses/${courseId}/lessons/${firstLesson.id}`)
                  }
                }}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors"
              >
                <PlayCircle className="h-4 w-4" aria-hidden="true" />
                {progressPct === 0 ? 'Start Learning' : 'Continue'}
              </button>
            </div>
          ) : (
            <button
              onClick={handleEnroll}
              disabled={enrolling}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 py-3 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60 transition-colors"
            >
              {enrolling ? (
                <>
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  {isFree ? 'Enrolling…' : 'Redirecting…'}
                </>
              ) : (
                <>
                  {isFree ? '🎓 Enroll for Free' : `Pay ${formatNaira(course.priceKobo)}`}
                </>
              )}
            </button>
          )}

          {!isEnrolled && !isFree && (
            <p className="mt-3 text-center text-xs text-gray-400">
              Secure payment via Paystack · NGN
            </p>
          )}
        </div>
      </div>

      {/* Curriculum */}
      <div>
        <h2 className="mb-4 text-base font-semibold text-gray-900">
          Course Curriculum · {course.totalLessons} lessons
        </h2>
        <div className="space-y-2">
          {curriculum.map((section) => {
            const isExpanded = expandedSections.has(section.id)
            return (
              <div key={section.id} className="overflow-hidden rounded-xl border border-gray-200 bg-white">
                <button
                  type="button"
                  onClick={() => setExpandedSections((prev) => {
                    const next = new Set(prev)
                    if (next.has(section.id)) next.delete(section.id)
                    else next.add(section.id)
                    return next
                  })}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                >
                  {isExpanded
                    ? <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" aria-hidden="true" />
                    : <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" aria-hidden="true" />
                  }
                  <span className="flex-1 text-sm font-semibold text-gray-900">{section.title}</span>
                  <span className="text-xs text-gray-400">{section.lessons.length} lessons</span>
                </button>

                {isExpanded && (
                  <ul className="divide-y divide-gray-100 border-t border-gray-100">
                    {section.lessons.map((lesson) => {
                      const lessonProgress = lesson.progress
                      const isDone = lessonProgress?.isCompleted
                      const canWatch = isEnrolled || lesson.isFreePreview

                      return (
                        <li key={lesson.id} className="flex items-center gap-3 px-4 py-3">
                          {/* Status icon */}
                          <div className="shrink-0">
                            {isDone ? (
                              <CheckCircle className="h-4 w-4 text-green-500" aria-hidden="true" />
                            ) : canWatch ? (
                              <PlayCircle className="h-4 w-4 text-indigo-400" aria-hidden="true" />
                            ) : (
                              <Lock className="h-4 w-4 text-gray-300" aria-hidden="true" />
                            )}
                          </div>

                          {/* Title */}
                          <div className="flex-1 min-w-0">
                            {canWatch ? (
                              <Link
                                href={isEnrolled ? `/dashboard/student/courses/${courseId}/lessons/${lesson.id}` : '#'}
                                className={`text-sm ${isDone ? 'text-gray-400 line-through' : 'text-gray-700 hover:text-indigo-600'}`}
                              >
                                {lesson.title}
                              </Link>
                            ) : (
                              <span className="text-sm text-gray-400">{lesson.title}</span>
                            )}
                            {lesson.isFreePreview && !isEnrolled && (
                              <Badge variant="success" className="ml-2 text-[10px]">Free preview</Badge>
                            )}
                          </div>

                          {/* Duration */}
                          {lesson.durationSeconds > 0 && (
                            <span className="flex shrink-0 items-center gap-1 text-xs text-gray-400">
                              <Clock className="h-3 w-3" aria-hidden="true" />
                              {formatDuration(lesson.durationSeconds)}
                            </span>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}