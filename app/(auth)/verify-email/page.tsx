'use client'

import { useEffect, useState, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

type Status = 'verifying' | 'success' | 'error'

function VerifyEmailContent() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token')
  const [status, setStatus] = useState<Status>('verifying')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!token) {
      setStatus('error')
      setMessage('No verification token found. Please use the link from your email.')
      return
    }

    async function verify() {
      try {
        const res = await fetch(`/api/auth/verify-email?token=${token}`)
        const data = await res.json() as { success: boolean; error?: string }

        if (res.ok && data.success) {
          setStatus('success')
        } else {
          setStatus('error')
          setMessage(data.error ?? 'Verification failed. Please try again.')
        }
      } catch {
        setStatus('error')
        setMessage('Network error. Please check your connection.')
      }
    }

    void verify()
  }, [token])

  if (status === 'verifying') {
    return (
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-50">
          <svg className="h-7 w-7 animate-spin text-indigo-600" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-gray-900">Verifying your email…</h2>
        <p className="mt-2 text-sm text-gray-500">Just a moment, please wait.</p>
      </div>
    )
  }

  if (status === 'success') {
    return (
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-7 w-7 text-green-600">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-gray-900">Email verified!</h2>
        <p className="mt-2 text-sm text-gray-500">
          Your account is now active. You can sign in and start learning.
        </p>
        <Link
          href="/login"
          className="mt-6 flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors"
        >
          Sign in to StreamLearn
        </Link>
      </div>
    )
  }

  return (
    <div className="text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-100">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-7 w-7 text-red-600">
          <circle cx="12" cy="12" r="10" />
          <line x1="15" y1="9" x2="9" y2="15" />
          <line x1="9" y1="9" x2="15" y2="15" />
        </svg>
      </div>
      <h2 className="text-xl font-bold text-gray-900">Verification failed</h2>
      <p className="mt-2 text-sm text-gray-500">{message}</p>
      <div className="mt-6 flex flex-col gap-3">
        <Link
          href="/login"
          className="flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors"
        >
          Sign in
        </Link>
        <Link
          href="/auth/register"
          className="flex items-center justify-center rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Create a new account
        </Link>
      </div>
    </div>
  )
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={
      <div className="space-y-4 text-center">
        <div className="mx-auto h-14 w-14 animate-skeleton-pulse rounded-full bg-gray-200" />
        <div className="mx-auto h-5 w-40 animate-skeleton-pulse rounded bg-gray-200" />
        <div className="mx-auto h-4 w-56 animate-skeleton-pulse rounded bg-gray-200" />
      </div>
    }>
      <VerifyEmailContent />
    </Suspense>
  )
}