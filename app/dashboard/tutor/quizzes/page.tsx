'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useAuthGuard } from '@/hooks/use-auth-guard'
import { useApiFetch } from '@/hooks/use-fetch'
import { FullPageSkeleton } from '@components/auth/full-page-skeleton'
import { Badge } from '@components/ui/badge'
import { Skeleton } from '@components/ui/skeleton'
import { toast } from 'sonner'
import { ClipboardList, PlusCircle, Globe, BookOpen, Eye, ArrowRight } from 'lucide-react'

type Quiz = {
  id: string
  title: string
  timeLimitSeconds: number | null
  passMark: number
  maxAttempts: number
  isPublished: boolean
  createdAt: string
}

type Course = { id: string; title: string; slug: string }
type CoursesResponse = { courses: Course[] }

export default function TutorQuizzesPage() {
  const { ready } = useAuthGuard({ roles: ['TUTOR', 'ADMIN'] })
  const { apiFetch } = useApiFetch()
  const [courses, setCourses] = useState<Course[]>([])
  const [selectedCourse, setSelectedCourse] = useState<string>('')
  const [quizzes, setQuizzes] = useState<Quiz[]>([])
  const [loading, setLoading] = useState(true)
  const [quizLoading, setQuizLoading] = useState(false)

  useEffect(() => {
    if (!ready) return
    void apiFetch<CoursesResponse>('/api/courses?limit=50').then((r) => {
      if (r.ok) {
        setCourses(r.data.courses)
        if (r.data.courses[0]) setSelectedCourse(r.data.courses[0].id)
      }
      setLoading(false)
    })
  }, [ready, apiFetch])

  const fetchQuizzes = useCallback(async (courseId: string) => {
    if (!courseId) return
    setQuizLoading(true)
    const result = await apiFetch<{ quizzes: Quiz[] }>(`/api/quizzes?courseId=${courseId}`)
    if (result.ok) setQuizzes(result.data.quizzes)
    else toast.error(result.error)
    setQuizLoading(false)
  }, [apiFetch])

  useEffect(() => { if (selectedCourse) void fetchQuizzes(selectedCourse) }, [selectedCourse, fetchQuizzes])

  async function togglePublish(quiz: Quiz) {
    const result = await apiFetch(`/api/quizzes/${quiz.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ isPublished: !quiz.isPublished }),
    })
    if (result.ok) {
      toast.success(quiz.isPublished ? 'Quiz unpublished' : 'Quiz published')
      void fetchQuizzes(selectedCourse)
    } else {
      toast.error(result.error)
    }
  }

  if (!ready) return <FullPageSkeleton />

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Quizzes</h1>
          <p className="mt-1 text-sm text-gray-500">Create and manage assessments for your courses</p>
        </div>
        {selectedCourse && (
          <Link
            href={`/dashboard/tutor/quizzes/new?courseId=${selectedCourse}`}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors"
          >
            <PlusCircle className="h-4 w-4" aria-hidden="true" />
            New Quiz
          </Link>
        )}
      </div>

      {/* Course selector */}
      {loading ? (
        <Skeleton className="h-10 w-64 rounded-lg" />
      ) : courses.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-gray-200 py-12 text-center">
          <BookOpen className="mx-auto mb-3 h-10 w-10 text-gray-300" aria-hidden="true" />
          <p className="text-sm font-medium text-gray-700">No courses yet</p>
          <Link href="/dashboard/tutor/courses/new" className="mt-2 text-sm text-indigo-600 hover:underline">
            Create a course first
          </Link>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <label htmlFor="course-select" className="text-sm font-medium text-gray-700">Course:</label>
            <select
              id="course-select"
              value={selectedCourse}
              onChange={(e) => setSelectedCourse(e.target.value)}
              className="h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm focus:border-indigo-500 focus:outline-none"
            >
              {courses.map((c) => (
                <option key={c.id} value={c.id}>{c.title}</option>
              ))}
            </select>
          </div>

          {/* Quiz list */}
          {quizLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }, (_, i) => (
                <div key={i} className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-4">
                  <Skeleton className="h-10 w-10 rounded-lg" />
                  <div className="flex-1 space-y-1.5"><Skeleton className="h-4 w-48" /><Skeleton className="h-3 w-32" /></div>
                  <Skeleton className="h-6 w-20 rounded-full" />
                </div>
              ))}
            </div>
          ) : quizzes.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 py-12 text-center">
              <ClipboardList className="mb-3 h-10 w-10 text-gray-300" aria-hidden="true" />
              <p className="text-sm font-medium text-gray-700">No quizzes for this course</p>
              <Link
                href={`/dashboard/tutor/quizzes/new?courseId=${selectedCourse}`}
                className="mt-3 text-sm font-medium text-indigo-600 hover:text-indigo-500"
              >
                Create your first quiz →
              </Link>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
              <ul className="divide-y divide-gray-100">
                {quizzes.map((quiz) => (
                  <li key={quiz.id} className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-50">
                      <ClipboardList className="h-5 w-5 text-indigo-500" aria-hidden="true" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-gray-900">{quiz.title}</p>
                      <p className="text-xs text-gray-400">
                        Pass mark: {quiz.passMark}% · Max attempts: {quiz.maxAttempts}
                        {quiz.timeLimitSeconds ? ` · ${Math.round(quiz.timeLimitSeconds / 60)} min limit` : ' · No time limit'}
                      </p>
                    </div>
                    <Badge variant={quiz.isPublished ? 'success' : 'secondary'} className="shrink-0 text-[10px]">
                      {quiz.isPublished ? 'Published' : 'Draft'}
                    </Badge>
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        onClick={() => void togglePublish(quiz)}
                        className={[
                          'flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                          quiz.isPublished
                            ? 'border border-gray-200 text-gray-600 hover:bg-gray-50'
                            : 'bg-green-600 text-white hover:bg-green-500',
                        ].join(' ')}
                      >
                        <Globe className="h-3 w-3" aria-hidden="true" />
                        {quiz.isPublished ? 'Unpublish' : 'Publish'}
                      </button>
                      <Link
                        href={`/dashboard/tutor/quizzes/${quiz.id}`}
                        className="flex items-center gap-1 rounded-md border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                      >
                        <Eye className="h-3 w-3" aria-hidden="true" />
                        Edit
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  )
}