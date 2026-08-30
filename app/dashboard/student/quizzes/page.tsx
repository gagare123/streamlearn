'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useAuthGuard } from '@/hooks/use-auth-guard'
import { useApiFetch } from '@/hooks/use-fetch'
import { FullPageSkeleton } from '@/components/auth/full-page-skeleton'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { ClipboardList, Clock, CheckCircle } from 'lucide-react'

type QuizItem = {
  id: string
  title: string
  courseTitle: string
  courseId: string
  timeLimitSeconds: number | null
  passMark: number
  maxAttempts: number
  isPublished: boolean
  attemptCount: number
  bestScore: number | null
  passed: boolean
}

export default function StudentQuizzesPage() {
  const { ready } = useAuthGuard({ roles: ['STUDENT'] })
  const { apiFetch } = useApiFetch()
  const [quizzes, setQuizzes] = useState<QuizItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!ready) return
    void apiFetch<{ quizzes: QuizItem[] }>('/api/quizzes').then((r) => {
      if (r.ok) setQuizzes(r.data.quizzes)
      setLoading(false)
    })
  }, [ready, apiFetch])

  if (!ready) return <FullPageSkeleton />

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
          <ClipboardList className="h-6 w-6 text-indigo-600" />
          My Quizzes
        </h1>
        <p className="mt-1 text-sm text-gray-500">Quizzes from your enrolled courses</p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="rounded-xl border border-gray-200 bg-white p-5">
              <Skeleton className="mb-2 h-5 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ))}
        </div>
      ) : quizzes.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-gray-200 py-12 text-center">
          <ClipboardList className="mx-auto h-10 w-10 text-gray-300 mb-3" />
          <p className="text-sm font-medium text-gray-700">No quizzes available</p>
          <p className="mt-1 text-xs text-gray-400">Enroll in a course to take quizzes</p>
        </div>
      ) : (
        <div className="space-y-3">
          {quizzes.map((quiz) => (
            <div key={quiz.id} className="rounded-xl border border-gray-200 bg-white p-5">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900">{quiz.title}</h3>
                  <p className="text-sm text-gray-500">{quiz.courseTitle}</p>
                </div>
                {quiz.passed && (
                  <Badge variant="success" className="gap-1">
                    <CheckCircle className="h-3 w-3" /> Passed
                  </Badge>
                )}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-gray-500">
                {quiz.timeLimitSeconds && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" /> {Math.floor(quiz.timeLimitSeconds / 60)} min
                  </span>
                )}
                <span>Pass mark: {quiz.passMark}%</span>
                <span>Attempts: {quiz.attemptCount}/{quiz.maxAttempts}</span>
                {quiz.bestScore !== null && (
                  <span className="font-medium text-indigo-600">Best: {quiz.bestScore}%</span>
                )}
              </div>

              <div className="mt-4">
                {quiz.attemptCount >= quiz.maxAttempts ? (
                  <span className="text-xs text-gray-400">No attempts remaining</span>
                ) : (
                  <Link
                    href={`/dashboard/student/quizzes/${quiz.id}`}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors"
                  >
                    {quiz.attemptCount === 0 ? 'Start Quiz' : 'Retake Quiz'}
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}