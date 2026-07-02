'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuthGuard } from '@/hooks/use-auth-guard'
import { useApiFetch } from '@/hooks/use-fetch'
import { FullPageSkeleton } from '@components/auth/full-page-skeleton'
import { Progress } from '@components/ui/progress'
import { Badge } from '@components/ui/badge'
import { toast } from 'sonner'
import { ArrowLeft, Clock, CheckCircle, XCircle, AlertTriangle, ChevronRight, ChevronLeft, Send } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type Question = {
  id: string
  question: string
  options: string[]
  position: number
}

type QuizMeta = {
  id: string
  title: string
  description: string | null
  timeLimitSeconds: number | null
  passMark: number
  maxAttempts: number
  questions: Question[]
}

type Submission = {
  id: string
  startedAt: string
  deadlineAt: string | null
  attemptNumber: number
}

type QuestionResult = {
  questionId: string
  question: string
  options: string[]
  chosenIndex: number
  correctIndex: number
  isCorrect: boolean
  explanation: string | null
}

type SubmitResult = {
  score: number
  passed: boolean
  correct: number
  total: number
  passMark: number
  results: QuestionResult[]
  submittedAt: string
  timedOut?: boolean
}

type Phase = 'loading' | 'intro' | 'quiz' | 'submitted' | 'error'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function StudentQuizPage() {
  const { ready } = useAuthGuard({ roles: ['STUDENT'] })
  const { apiFetch } = useApiFetch()
  const params = useParams()
  const router = useRouter()
  const quizId = params['id'] as string

  const [phase, setPhase] = useState<Phase>('loading')
  const [quiz, setQuiz] = useState<QuizMeta | null>(null)
  const [submission, setSubmission] = useState<Submission | null>(null)
  const [answers, setAnswers] = useState<Record<string, number>>({})
  const [currentIdx, setCurrentIdx] = useState(0)
  const [timeLeft, setTimeLeft] = useState<number | null>(null)
  const [submitResult, setSubmitResult] = useState<SubmitResult | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const autoSubmitRef = useRef(false)

  // ── Fetch quiz metadata ───────────────────────────────────────────────────
  useEffect(() => {
    if (!ready) return
    apiFetch<{ quiz: QuizMeta }>(`/api/quizzes/${quizId}`).then((r) => {
      if (r.ok) {
        setQuiz(r.data.quiz)
        setPhase('intro')
      } else {
        setErrorMsg(r.error)
        setPhase('error')
      }
    })
  }, [ready, apiFetch, quizId])

  // ── Start quiz attempt ────────────────────────────────────────────────────
  const handleStart = useCallback(async () => {
    if (!quiz) return
    const result = await apiFetch<{ submission: Submission }>(
      `/api/quizzes/${quizId}/start`,
      { method: 'POST', body: JSON.stringify({}) },
    )

    if (!result.ok) {
      toast.error(result.error)
      return
    }

    const sub = result.data.submission
    setSubmission(sub)
    setCurrentIdx(0)
    setAnswers({})

    // Set countdown from server-calculated deadline
    if (sub.deadlineAt) {
      const remaining = Math.max(0, Math.floor((new Date(sub.deadlineAt).getTime() - Date.now()) / 1000))
      setTimeLeft(remaining)
    }

    setPhase('quiz')
  }, [quiz, apiFetch, quizId])

  // ── Countdown timer ───────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'quiz' || timeLeft === null) return

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev === null || prev <= 1) {
          // Time's up — auto-submit
          if (!autoSubmitRef.current) {
            autoSubmitRef.current = true
            toast.warning('Time is up! Submitting your answers…')
            void handleSubmit(true)
          }
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [phase, timeLeft === null ? null : 'running'])

  // ── Submit answers ────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async (autoSubmit = false) => {
    if (!submission || !quiz || submitting) return

    if (!autoSubmit) {
      const unanswered = quiz.questions.filter((q) => answers[q.id] === undefined).length
      if (unanswered > 0) {
        const ok = window.confirm(`You have ${unanswered} unanswered question${unanswered > 1 ? 's' : ''}. Submit anyway?`)
        if (!ok) return
      }
    }

    if (timerRef.current) clearInterval(timerRef.current)
    setSubmitting(true)

    const result = await apiFetch<SubmitResult>(
      `/api/quizzes/${quizId}/submit`,
      {
        method: 'POST',
        body: JSON.stringify({ submissionId: submission.id, answers }),
      },
    )

    setSubmitting(false)

    if (result.ok) {
      setSubmitResult(result.data)
      setPhase('submitted')
    } else if (result.status === 422) {
      // Timed out on server side
      setSubmitResult({
        score: 0, passed: false, correct: 0,
        total: quiz.questions.length, passMark: quiz.passMark,
        results: [], submittedAt: new Date().toISOString(), timedOut: true,
      })
      setPhase('submitted')
    } else {
      toast.error(result.error)
    }
  }, [submission, quiz, answers, submitting, apiFetch, quizId])

  if (!ready) return <FullPageSkeleton />

  // ─── Phase: loading ─────────────────────────────────────────────────────
  if (phase === 'loading') {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-50">
            <svg className="h-7 w-7 animate-spin text-indigo-600" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
          <p className="text-sm text-gray-500">Loading quiz…</p>
        </div>
      </div>
    )
  }

  // ─── Phase: error ────────────────────────────────────────────────────────
  if (phase === 'error') {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <AlertTriangle className="mb-3 h-10 w-10 text-red-400" aria-hidden="true" />
        <h2 className="text-base font-semibold text-gray-900">Cannot load quiz</h2>
        <p className="mt-1 text-sm text-gray-500">{errorMsg}</p>
        <Link href="/dashboard/student/quizzes" className="mt-5 text-sm text-indigo-600 hover:underline">
          Back to quizzes
        </Link>
      </div>
    )
  }

  // ─── Phase: intro ────────────────────────────────────────────────────────
  if (phase === 'intro' && quiz) {
    return (
      <div className="space-y-6">
        <Link href="/dashboard/student/quizzes" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Quizzes
        </Link>

        <div className="mx-auto max-w-lg rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-100">
            <CheckCircle className="h-7 w-7 text-indigo-600" aria-hidden="true" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">{quiz.title}</h1>
          {quiz.description && (
            <p className="mt-2 text-sm text-gray-500">{quiz.description}</p>
          )}

          <div className="my-6 grid grid-cols-3 gap-4 text-center">
            {[
              { label: 'Questions', value: String(quiz.questions.length) },
              { label: 'Time Limit', value: quiz.timeLimitSeconds ? `${Math.round(quiz.timeLimitSeconds / 60)} min` : 'None' },
              { label: 'Pass Mark', value: `${quiz.passMark}%` },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-lg bg-gray-50 p-3">
                <p className="text-lg font-bold text-gray-900">{value}</p>
                <p className="text-xs text-gray-500">{label}</p>
              </div>
            ))}
          </div>

          <div className="mb-6 rounded-lg border border-amber-100 bg-amber-50 p-3 text-left">
            <p className="text-xs font-semibold text-amber-800">Before you begin:</p>
            <ul className="mt-1 space-y-1 text-xs text-amber-700">
              <li>• You have {quiz.maxAttempts} attempt{quiz.maxAttempts !== 1 ? 's' : ''} for this quiz</li>
              {quiz.timeLimitSeconds && <li>• The timer starts immediately when you click Start</li>}
              <li>• You can navigate between questions freely</li>
              <li>• Unanswered questions will be marked incorrect</li>
            </ul>
          </div>

          <button
            onClick={handleStart}
            className="w-full rounded-lg bg-indigo-600 py-3 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors"
          >
            Start Quiz
          </button>
        </div>
      </div>
    )
  }

  // ─── Phase: quiz ─────────────────────────────────────────────────────────
  if (phase === 'quiz' && quiz) {
    const currentQ = quiz.questions[currentIdx]
    const answered = Object.keys(answers).length
    const progressPct = Math.round((answered / quiz.questions.length) * 100)
    const isLowTime = timeLeft !== null && timeLeft < 60
    const isCriticalTime = timeLeft !== null && timeLeft < 30

    return (
      <div className="space-y-5">
        {/* Quiz header */}
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Quiz</p>
            <h1 className="truncate text-lg font-bold text-gray-900">{quiz.title}</h1>
          </div>

          {/* Timer */}
          {timeLeft !== null && (
            <div className={[
              'flex items-center gap-2 rounded-lg px-4 py-2 font-mono text-base font-bold transition-colors',
              isCriticalTime ? 'bg-red-100 text-red-700 animate-pulse' :
              isLowTime     ? 'bg-amber-100 text-amber-700' :
                             'bg-gray-100 text-gray-700',
            ].join(' ')} role="timer" aria-live="off">
              <Clock className="h-4 w-4" aria-hidden="true" />
              {formatCountdown(timeLeft)}
            </div>
          )}
        </div>

        {/* Progress */}
        <div>
          <div className="mb-1 flex justify-between text-xs text-gray-500">
            <span>Question {currentIdx + 1} of {quiz.questions.length}</span>
            <span>{answered} answered</span>
          </div>
          <Progress value={progressPct} className="h-1.5" />
        </div>

        {/* Question card */}
        {currentQ && (
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <p className="mb-5 text-base font-semibold text-gray-900 leading-relaxed">
              <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">
                {currentIdx + 1}
              </span>
              {currentQ.question}
            </p>

            <div className="space-y-3">
              {currentQ.options.map((option, i) => {
                const isSelected = answers[currentQ.id] === i
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setAnswers((prev) => ({ ...prev, [currentQ.id]: i }))}
                    className={[
                      'flex w-full items-center gap-3 rounded-xl border-2 px-4 py-3 text-left text-sm transition-all',
                      isSelected
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-900 font-medium'
                        : 'border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50',
                    ].join(' ')}
                    aria-pressed={isSelected}
                  >
                    <span className={[
                      'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold transition-colors',
                      isSelected ? 'border-indigo-500 bg-indigo-500 text-white' : 'border-gray-300 text-gray-400',
                    ].join(' ')}>
                      {String.fromCharCode(65 + i)}
                    </span>
                    {option}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
            disabled={currentIdx === 0}
            className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-colors"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            Previous
          </button>

          {/* Question dots */}
          <div className="hidden sm:flex items-center gap-1.5">
            {quiz.questions.map((q, i) => (
              <button
                key={q.id}
                onClick={() => setCurrentIdx(i)}
                className={[
                  'h-2.5 w-2.5 rounded-full transition-all',
                  i === currentIdx ? 'bg-indigo-600 w-5' :
                  answers[q.id] !== undefined ? 'bg-indigo-300' : 'bg-gray-200',
                ].join(' ')}
                aria-label={`Go to question ${i + 1}${answers[q.id] !== undefined ? ' (answered)' : ''}`}
              />
            ))}
          </div>

          {currentIdx < quiz.questions.length - 1 ? (
            <button
              onClick={() => setCurrentIdx((i) => Math.min(quiz.questions.length - 1, i + 1))}
              className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors"
            >
              Next
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : (
            <button
              onClick={() => void handleSubmit(false)}
              disabled={submitting}
              className="flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-500 disabled:opacity-60 transition-colors"
            >
              <Send className="h-4 w-4" aria-hidden="true" />
              {submitting ? 'Submitting…' : 'Submit Quiz'}
            </button>
          )}
        </div>

        {/* Submit button always visible on last question or if all answered */}
        {currentIdx < quiz.questions.length - 1 && answered === quiz.questions.length && (
          <div className="flex justify-end">
            <button
              onClick={() => void handleSubmit(false)}
              disabled={submitting}
              className="flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-500 disabled:opacity-60"
            >
              <Send className="h-4 w-4" aria-hidden="true" />
              {submitting ? 'Submitting…' : 'Submit Quiz'}
            </button>
          </div>
        )}
      </div>
    )
  }

  // ─── Phase: submitted ────────────────────────────────────────────────────
  if (phase === 'submitted' && submitResult && quiz) {
    const { score, passed, correct, total, results, timedOut } = submitResult

    return (
      <div className="space-y-6">
        <Link href="/dashboard/student/quizzes" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Quizzes
        </Link>

        {/* Result card */}
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
          {timedOut ? (
            <>
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-100">
                <Clock className="h-8 w-8 text-amber-600" aria-hidden="true" />
              </div>
              <h2 className="text-xl font-bold text-gray-900">Time's Up</h2>
              <p className="mt-1 text-sm text-gray-500">Your time ran out. Submitted with 0 marks.</p>
            </>
          ) : passed ? (
            <>
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                <CheckCircle className="h-8 w-8 text-green-600" aria-hidden="true" />
              </div>
              <h2 className="text-xl font-bold text-gray-900">You Passed! 🎉</h2>
              <p className="mt-1 text-sm text-gray-500">Great work on this assessment.</p>
            </>
          ) : (
            <>
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
                <XCircle className="h-8 w-8 text-red-600" aria-hidden="true" />
              </div>
              <h2 className="text-xl font-bold text-gray-900">Not Passed</h2>
              <p className="mt-1 text-sm text-gray-500">You needed {quiz.passMark}% to pass. Review and try again.</p>
            </>
          )}

          <div className="my-6 text-5xl font-bold">
            <span className={passed ? 'text-green-600' : timedOut ? 'text-amber-600' : 'text-red-500'}>
              {score}%
            </span>
          </div>

          <div className="grid grid-cols-3 gap-4 text-center">
            {[
              { label: 'Correct', value: `${correct}/${total}` },
              { label: 'Score', value: `${score}%` },
              { label: 'Required', value: `${quiz.passMark}%` },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-lg bg-gray-50 p-3">
                <p className="text-lg font-bold text-gray-900">{value}</p>
                <p className="text-xs text-gray-500">{label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Per-question results */}
        {results.length > 0 && (
          <div className="space-y-4">
            <h3 className="text-base font-semibold text-gray-900">Review</h3>
            {results.map((r, idx) => (
              <div
                key={r.questionId}
                className={[
                  'rounded-xl border p-4',
                  r.isCorrect ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50',
                ].join(' ')}
              >
                <div className="flex items-start gap-3">
                  {r.isCorrect
                    ? <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-green-600" aria-hidden="true" />
                    : <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" aria-hidden="true" />
                  }
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900">
                      {idx + 1}. {r.question}
                    </p>
                    <div className="mt-2 space-y-1">
                      {r.options.map((opt, i) => {
                        const isChosen = i === r.chosenIndex
                        const isCorrect = i === r.correctIndex
                        return (
                          <p key={i} className={[
                            'text-xs flex items-center gap-1.5',
                            isCorrect ? 'text-green-700 font-semibold' :
                            isChosen  ? 'text-red-600' : 'text-gray-500',
                          ].join(' ')}>
                            <span>
                              {isCorrect ? '✓' : isChosen && !isCorrect ? '✗' : '○'}
                            </span>
                            {opt}
                            {isCorrect && !isChosen && ' (correct answer)'}
                          </p>
                        )
                      })}
                    </div>
                    {r.explanation && (
                      <p className="mt-2 text-xs text-gray-600 italic">
                        💡 {r.explanation}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between">
          <Link
            href="/dashboard/student/quizzes"
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Back to Quizzes
          </Link>
          {!passed && !timedOut && (
            <button
              onClick={handleStart}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
            >
              Try Again
            </button>
          )}
        </div>
      </div>
    )
  }

  return null
}