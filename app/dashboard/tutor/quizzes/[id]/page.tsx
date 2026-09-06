'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuthGuard } from '@/hooks/use-auth-guard'
import { useApiFetch } from '@/hooks/use-fetch'
import { FullPageSkeleton } from '@/components/auth/full-page-skeleton'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { ArrowLeft, PlusCircle, Trash2, CheckCircle, Save, Globe } from 'lucide-react'

type Quiz = {
  id: string
  courseId: string
  title: string
  description: string | null
  timeLimitSeconds: number | null
  passMark: number
  maxAttempts: number
  isPublished: boolean
}

type Question = {
  id: string
  question: string
  options: string[]
  correctIndex: number
  explanation: string | null
  position: number
}

export default function EditQuizPage() {
  const { ready } = useAuthGuard({ roles: ['TUTOR', 'ADMIN'] })
  const { apiFetch } = useApiFetch()
  const params = useParams()
  const router = useRouter()
  const quizId = params['id'] as string

  const [quiz, setQuiz] = useState<Quiz | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [passMark, setPassMark] = useState(70)
  const [timeLimit, setTimeLimit] = useState(0)
  const [maxAttempts, setMaxAttempts] = useState(3)

  const fetchQuiz = useCallback(async () => {
    const [quizRes, questionsRes] = await Promise.all([
      apiFetch<{ quiz: Quiz }>(`/api/quizzes/${quizId}`),
      apiFetch<{ questions: Question[] }>(`/api/quizzes/${quizId}/questions`),
    ])

    if (quizRes.ok) {
      const q = quizRes.data.quiz
      setQuiz(q)
      setTitle(q.title)
      setDescription(q.description ?? '')
      setPassMark(q.passMark)
      setTimeLimit(q.timeLimitSeconds ? Math.floor(q.timeLimitSeconds / 60) : 0)
      setMaxAttempts(q.maxAttempts)
    } else {
      toast.error('Quiz not found')
      router.push('/dashboard/tutor/quizzes')
    }

    if (questionsRes.ok) {
      setQuestions(questionsRes.data.questions)
    }

    setLoading(false)
  }, [apiFetch, quizId, router])

  useEffect(() => { if (ready) void fetchQuiz() }, [ready, fetchQuiz])

  async function handleSave() {
    setSaving(true)
    const result = await apiFetch(`/api/quizzes/${quizId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        title,
        description: description || null,
        passMark,
        timeLimitSeconds: timeLimit > 0 ? timeLimit * 60 : null,
        maxAttempts,
      }),
    })
    if (result.ok) {
      toast.success('Quiz updated')
      void fetchQuiz()
    } else {
      toast.error(result.error)
    }
    setSaving(false)
  }

  async function handleTogglePublish() {
    setSaving(true)
    const result = await apiFetch(`/api/quizzes/${quizId}`, {
      method: 'PATCH',
      body: JSON.stringify({ isPublished: !quiz?.isPublished }),
    })
    if (result.ok) {
      toast.success(quiz?.isPublished ? 'Quiz unpublished' : 'Quiz published!')
      void fetchQuiz()
    } else {
      toast.error(result.error)
    }
    setSaving(false)
  }

  async function handleDeleteQuestion(questionId: string) {
    if (!confirm('Delete this question?')) return
    const result = await apiFetch(`/api/quizzes/${quizId}/questions/${questionId}`, { method: 'DELETE' })
    if (result.ok) {
      toast.success('Question deleted')
      void fetchQuiz()
    } else {
      toast.error(result.error)
    }
  }

  if (!ready) return <FullPageSkeleton />

  if (loading) {
    return <div className="space-y-4"><Skeleton className="h-8 w-64" /><Skeleton className="h-4 w-96" /></div>
  }

  if (!quiz) return null

  return (
    <div className="space-y-6">
      <Link href="/dashboard/tutor/quizzes" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900">
        <ArrowLeft className="h-4 w-4" /> Quizzes
      </Link>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Edit Quiz</h1>
          <p className="mt-1 text-sm text-gray-500">
            <Badge variant={quiz.isPublished ? 'success' : 'secondary'} className="mr-2">
              {quiz.isPublished ? 'Published' : 'Draft'}
            </Badge>
            {questions.length} question{questions.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50">
            <Save className="h-4 w-4" /> Save
          </button>
          <button onClick={handleTogglePublish} disabled={saving}
            className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50 ${
              quiz.isPublished
                ? 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                : 'bg-green-600 text-white hover:bg-green-500'
            }`}>
            <Globe className="h-4 w-4" />
            {quiz.isPublished ? 'Unpublish' : 'Publish'}
          </button>
        </div>
      </div>

      {/* Quiz settings */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4 max-w-2xl">
        <h2 className="text-sm font-semibold text-gray-900">Quiz Settings</h2>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none" />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Pass Mark %</label>
            <input type="number" value={passMark} onChange={(e) => setPassMark(Number(e.target.value))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Time Limit (min)</label>
            <input type="number" value={timeLimit} onChange={(e) => setTimeLimit(Number(e.target.value))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Max Attempts</label>
            <input type="number" value={maxAttempts} onChange={(e) => setMaxAttempts(Number(e.target.value))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>
        </div>
      </div>

      {/* Questions list */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Questions</h2>
          <Link href={`/dashboard/tutor/quizzes/${quizId}/questions/new`}
            className="flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-500">
            <PlusCircle className="h-4 w-4" /> Add Question
          </Link>
        </div>

        <div className="space-y-3">
          {questions.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed border-gray-200 py-10 text-center">
              <p className="text-sm text-gray-500">No questions yet</p>
              <Link href={`/dashboard/tutor/quizzes/${quizId}/questions/new`}
                className="mt-2 inline-block text-sm font-medium text-indigo-600 hover:text-indigo-500">
                Add your first question →
              </Link>
            </div>
          ) : (
            questions.map((q, idx) => (
              <div key={q.id} className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="flex items-start gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">
                    {idx + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{q.question}</p>
                    <ul className="mt-2 space-y-1">
                      {q.options.map((opt, i) => (
                        <li key={i} className={`text-xs ${i === q.correctIndex ? 'text-green-700 font-semibold' : 'text-gray-500'}`}>
                          {i === q.correctIndex ? '✓ ' : '○ '}{opt}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <button onClick={() => handleDeleteQuestion(q.id)}
                    className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors shrink-0">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}