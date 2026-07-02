'use client'

import { useState, type FormEvent, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useAuthGuard } from '@/hooks/use-auth-guard'
import { useApiFetch } from '@/hooks/use-fetch'
import { FullPageSkeleton } from '@components/auth/full-page-skeleton'
import { Card, CardContent, CardHeader, CardTitle } from '@components/ui/card'
import { toast } from 'sonner'
import { ArrowLeft, PlusCircle, Trash2, CheckCircle } from 'lucide-react'

type QuestionDraft = {
  id: string
  question: string
  options: string[]
  correctIndex: number
  explanation: string
}

function NewQuizForm() {
  const { ready } = useAuthGuard({ roles: ['TUTOR', 'ADMIN'] })
  const { apiFetch } = useApiFetch()
  const router = useRouter()
  const searchParams = useSearchParams()
  const courseId = searchParams.get('courseId') ?? ''

  const [step, setStep] = useState<'details' | 'questions'>('details')
  const [quizId, setQuizId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [questions, setQuestions] = useState<QuestionDraft[]>([])
  const [addingQuestion, setAddingQuestion] = useState(false)
  const [newQ, setNewQ] = useState<Omit<QuestionDraft, 'id'>>({
    question: '',
    options: ['', ''],
    correctIndex: 0,
    explanation: '',
  })

  if (!ready) return <FullPageSkeleton />

  // ── Step 1: create quiz details ──────────────────────────────────────────
  async function handleCreateQuiz(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaving(true)
    const form = new FormData(e.currentTarget)

    const timeLimitMinutes = parseInt(form.get('timeLimitMinutes') as string || '0', 10)

    const result = await apiFetch<{ quiz: { id: string } }>('/api/quizzes', {
      method: 'POST',
      body: JSON.stringify({
        courseId,
        title: form.get('title'),
        description: form.get('description') || undefined,
        timeLimitSeconds: timeLimitMinutes > 0 ? timeLimitMinutes * 60 : null,
        passMark: parseInt(form.get('passMark') as string || '70', 10),
        maxAttempts: parseInt(form.get('maxAttempts') as string || '3', 10),
      }),
    })

    if (result.ok) {
      setQuizId(result.data.quiz.id)
      setStep('questions')
      toast.success('Quiz created. Now add questions.')
    } else {
      toast.error(result.error)
    }
    setSaving(false)
  }

  // ── Add a question ───────────────────────────────────────────────────────
  async function handleAddQuestion() {
    if (!quizId) return
    if (!newQ.question.trim()) { toast.error('Question text is required'); return }
    if (newQ.options.some((o) => !o.trim())) { toast.error('All option fields must be filled'); return }
    if (newQ.options.length < 2) { toast.error('At least 2 options required'); return }

    setSaving(true)
    const result = await apiFetch<{ question: { id: string } }>(
      `/api/quizzes/${quizId}/questions`,
      {
        method: 'POST',
        body: JSON.stringify({
          question: newQ.question,
          options: newQ.options,
          correctIndex: newQ.correctIndex,
          explanation: newQ.explanation || undefined,
        }),
      },
    )

    if (result.ok) {
      setQuestions((prev) => [...prev, { ...newQ, id: result.data.question.id }])
      setNewQ({ question: '', options: ['', ''], correctIndex: 0, explanation: '' })
      setAddingQuestion(false)
      toast.success('Question added')
    } else {
      toast.error(result.error)
    }
    setSaving(false)
  }

  // ── Publish and finish ───────────────────────────────────────────────────
  async function handlePublish(publish: boolean) {
    if (!quizId) return
    if (publish && questions.length === 0) { toast.error('Add at least one question before publishing'); return }
    setSaving(true)

    const result = await apiFetch(`/api/quizzes/${quizId}`, {
      method: 'PATCH',
      body: JSON.stringify({ isPublished: publish }),
    })

    if (result.ok) {
      toast.success(publish ? 'Quiz published!' : 'Quiz saved as draft')
      router.push('/dashboard/tutor/quizzes')
    } else {
      toast.error(result.error)
    }
    setSaving(false)
  }

  // ─── Step 1: Quiz Details ─────────────────────────────────────────────────
  if (step === 'details') {
    return (
      <div className="space-y-6">
        <Link href="/dashboard/tutor/quizzes" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Quizzes
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Create Quiz</h1>
          <p className="mt-1 text-sm text-gray-500">Step 1 of 2 — Set quiz details</p>
        </div>

        <Card className="border border-gray-200 shadow-none max-w-2xl">
          <CardHeader><CardTitle className="text-base">Quiz Settings</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={handleCreateQuiz} noValidate className="space-y-4">
              <div>
                <label htmlFor="title" className="mb-1.5 block text-sm font-medium text-gray-700">
                  Title <span className="text-red-500">*</span>
                </label>
                <input
                  id="title" name="title" type="text" required disabled={saving}
                  placeholder="e.g. Module 1 Assessment"
                  className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60"
                />
              </div>

              <div>
                <label htmlFor="description" className="mb-1.5 block text-sm font-medium text-gray-700">
                  Description <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <textarea
                  id="description" name="description" rows={3} disabled={saving}
                  placeholder="Brief description of what this quiz covers…"
                  className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60"
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label htmlFor="timeLimitMinutes" className="mb-1.5 block text-sm font-medium text-gray-700">
                    Time Limit (minutes)
                  </label>
                  <input
                    id="timeLimitMinutes" name="timeLimitMinutes" type="number"
                    min="0" defaultValue="0" disabled={saving}
                    className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm focus:border-indigo-500 focus:outline-none disabled:opacity-60"
                  />
                  <p className="mt-1 text-xs text-gray-400">0 = no limit</p>
                </div>
                <div>
                  <label htmlFor="passMark" className="mb-1.5 block text-sm font-medium text-gray-700">
                    Pass Mark (%)
                  </label>
                  <input
                    id="passMark" name="passMark" type="number"
                    min="0" max="100" defaultValue="70" disabled={saving}
                    className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm focus:border-indigo-500 focus:outline-none disabled:opacity-60"
                  />
                </div>
                <div>
                  <label htmlFor="maxAttempts" className="mb-1.5 block text-sm font-medium text-gray-700">
                    Max Attempts
                  </label>
                  <input
                    id="maxAttempts" name="maxAttempts" type="number"
                    min="1" max="10" defaultValue="3" disabled={saving}
                    className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm focus:border-indigo-500 focus:outline-none disabled:opacity-60"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit" disabled={saving}
                  className="flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
                >
                  {saving ? 'Saving…' : 'Next: Add Questions →'}
                </button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ─── Step 2: Questions ────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <Link href="/dashboard/tutor/quizzes" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Quizzes
      </Link>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Add Questions</h1>
          <p className="mt-1 text-sm text-gray-500">Step 2 of 2 — {questions.length} question{questions.length !== 1 ? 's' : ''} added</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void handlePublish(false)}
            disabled={saving}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
          >
            Save as Draft
          </button>
          <button
            onClick={() => void handlePublish(true)}
            disabled={saving || questions.length === 0}
            className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-500 disabled:opacity-50"
          >
            Publish Quiz
          </button>
        </div>
      </div>

      {/* Existing questions */}
      {questions.length > 0 && (
        <div className="space-y-3">
          {questions.map((q, idx) => (
            <div key={q.id} className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">
                  {idx + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">{q.question}</p>
                  <ul className="mt-2 space-y-1">
                    {q.options.map((opt, i) => (
                      <li key={i} className={`flex items-center gap-2 text-xs ${i === q.correctIndex ? 'text-green-700 font-semibold' : 'text-gray-500'}`}>
                        {i === q.correctIndex
                          ? <CheckCircle className="h-3.5 w-3.5 text-green-500 shrink-0" aria-hidden="true" />
                          : <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-gray-300 inline-block" />
                        }
                        {opt}
                      </li>
                    ))}
                  </ul>
                  {q.explanation && (
                    <p className="mt-2 text-xs text-gray-400 italic">Explanation: {q.explanation}</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add question form */}
      {addingQuestion ? (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-5 space-y-4">
          <p className="text-sm font-semibold text-indigo-800">New Question</p>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Question text *</label>
            <textarea
              value={newQ.question}
              onChange={(e) => setNewQ((p) => ({ ...p, question: e.target.value }))}
              rows={2}
              placeholder="What is…?"
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none resize-none"
            />
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-xs font-medium text-gray-600">Options * (click radio to mark correct)</label>
              <button
                type="button"
                onClick={() => setNewQ((p) => ({ ...p, options: [...p.options, ''] }))}
                disabled={newQ.options.length >= 6}
                className="text-xs text-indigo-600 hover:text-indigo-500 disabled:opacity-40"
              >
                + Add option
              </button>
            </div>
            <div className="space-y-2">
              {newQ.options.map((opt, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="correct"
                    checked={newQ.correctIndex === i}
                    onChange={() => setNewQ((p) => ({ ...p, correctIndex: i }))}
                    className="h-4 w-4 text-indigo-600"
                    aria-label={`Mark option ${i + 1} as correct`}
                  />
                  <input
                    type="text"
                    value={opt}
                    onChange={(e) => {
                      const opts = [...newQ.options]
                      opts[i] = e.target.value
                      setNewQ((p) => ({ ...p, options: opts }))
                    }}
                    placeholder={`Option ${i + 1}`}
                    className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none"
                  />
                  {newQ.options.length > 2 && (
                    <button
                      type="button"
                      onClick={() => {
                        const opts = newQ.options.filter((_, j) => j !== i)
                        const correct = newQ.correctIndex >= opts.length ? opts.length - 1 : newQ.correctIndex
                        setNewQ((p) => ({ ...p, options: opts, correctIndex: correct }))
                      }}
                      className="text-gray-400 hover:text-red-500"
                      aria-label="Remove option"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Explanation <span className="text-gray-400">(shown after submission)</span>
            </label>
            <input
              type="text"
              value={newQ.explanation}
              onChange={(e) => setNewQ((p) => ({ ...p, explanation: e.target.value }))}
              placeholder="Why is this the correct answer?"
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleAddQuestion}
              disabled={saving}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Add Question'}
            </button>
            <button
              onClick={() => { setAddingQuestion(false); setNewQ({ question: '', options: ['', ''], correctIndex: 0, explanation: '' }) }}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAddingQuestion(true)}
          className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-200 py-4 text-sm font-medium text-indigo-600 hover:border-indigo-300 hover:bg-indigo-50 transition-colors"
        >
          <PlusCircle className="h-4 w-4" aria-hidden="true" />
          Add Question
        </button>
      )}
    </div>
  )
}

export default function NewQuizPage() {
  return (
    <Suspense fallback={<FullPageSkeleton />}>
      <NewQuizForm />
    </Suspense>
  )
}