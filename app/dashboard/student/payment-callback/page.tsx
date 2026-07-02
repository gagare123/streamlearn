'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useApiFetch } from '@/hooks/use-fetch'

type Status = 'verifying' | 'success' | 'failed' | 'pending'

function PaymentCallbackContent() {
  const { apiFetch } = useApiFetch()
  const searchParams = useSearchParams()
  const router = useRouter()

  const reference = searchParams.get('reference') ?? searchParams.get('trxref')
  const [status, setStatus] = useState<Status>('verifying')
  const [courseId, setCourseId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!reference) {
      setStatus('failed')
      return
    }

    async function verify() {
      const result = await apiFetch<{ status: string; courseId?: string; alreadyEnrolled?: boolean }>(
        `/api/payments/verify/${reference}`,
        { skipRefresh: true }
      )

      if (result.ok) {
        const data = result.data
        if (data.status === 'success') {
          setStatus('success')
          if (data.courseId) setCourseId(data.courseId)
          setTimeout(() => {
            if (data.courseId) router.push(`/dashboard/student/courses/${data.courseId}`)
            else router.push('/dashboard/student/courses')
          }, 3000)
        } else {
          setStatus('pending')
        }
      } else {
        if (result.status === 402) {
          setStatus('failed')
          setError(result.error)
        } else if (result.status === 409) {
          setTimeout(() => void verify(), 2000)
        } else {
          setStatus('failed')
          setError(result.error)
        }
      }
    }

    void verify()
  }, [reference, apiFetch, router])
  // ── Success ────────────────────────────────────────────────────────────
  if (status === 'success') {
    return (
      <div className="text-center">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-8 w-8 text-green-600" aria-hidden="true">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Payment Successful!</h1>
        <p className="mt-2 text-sm text-gray-500">
          You are now enrolled. Redirecting you to your course…
        </p>
        <div className="mt-2 flex justify-center">
          <div className="h-1 w-32 overflow-hidden rounded-full bg-gray-200">
            <div className="h-full animate-[fill_3s_linear_forwards] rounded-full bg-green-500" style={{ width: '100%', animationName: 'progress-fill' }} />
          </div>
        </div>
        {courseId && (
          <Link
            href={`/dashboard/student/courses/${courseId}`}
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors"
          >
            Go to Course
          </Link>
        )}
      </div>
    )
  }

  // ── Failed ────────────────────────────────────────────────────────────
  if (status === 'failed') {
    return (
      <div className="text-center">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-8 w-8 text-red-600" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Payment Failed</h1>
        <p className="mt-2 text-sm text-gray-500">
          {error ?? 'Your payment could not be completed. No money has been charged.'}
        </p>
        <div className="mt-6 flex flex-col items-center gap-3">
          <button
            onClick={() => router.back()}
            className="rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors"
          >
            Try Again
          </button>
          <Link
            href="/dashboard/student/courses"
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Back to My Courses
          </Link>
        </div>
      </div>
    )
  }

  // ── Verifying / pending ────────────────────────────────────────────────
  return (
    <div className="text-center">
      <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-indigo-50">
        <svg className="h-8 w-8 animate-spin text-indigo-600" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
      <h1 className="text-2xl font-bold text-gray-900">
        {status === 'pending' ? 'Payment Processing…' : 'Verifying Payment…'}
      </h1>
      <p className="mt-2 text-sm text-gray-500">
        Please wait while we confirm your payment with Paystack.
        <br />
        Do not close this page.
      </p>
      {reference && (
        <p className="mt-3 font-mono text-xs text-gray-400">Ref: {reference}</p>
      )}
    </div>
  )
}

export default function PaymentCallbackPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-10 shadow-sm">
        <Suspense fallback={
          <div className="text-center">
            <div className="mx-auto mb-4 h-14 w-14 animate-pulse rounded-full bg-gray-200" />
            <div className="mx-auto h-6 w-48 animate-pulse rounded bg-gray-200" />
          </div>
        }>
          <PaymentCallbackContent />
        </Suspense>
      </div>
    </div>
  )
}