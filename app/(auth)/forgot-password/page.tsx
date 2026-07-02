'use client'

import { useState, type FormEvent } from 'react'
import Link from 'next/link'

type FormState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success' }
  | { status: 'error'; message: string }

export default function ForgotPasswordPage() {
  const [state, setState] = useState<FormState>({ status: 'idle' })

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setState({ status: 'loading' })

    const email = (new FormData(e.currentTarget)).get('email') as string

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })

      const data = await res.json() as { success: boolean; error?: string }

      if (data.success) {
        setState({ status: 'success' })
      } else {
        setState({ status: 'error', message: data.error ?? 'Something went wrong.' })
      }
    } catch {
      setState({ status: 'error', message: 'Network error. Please try again.' })
    }
  }

  if (state.status === 'success') {
    return (
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-100">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-7 w-7 text-indigo-600">
            <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-gray-900">Check your email</h2>
        <p className="mt-2 text-sm text-gray-500">
          If an account exists with that address, you&apos;ll receive a password reset link shortly.
        </p>
        <Link href="/login" className="mt-6 flex items-center justify-center text-sm font-medium text-indigo-600 hover:text-indigo-500">
          ← Back to sign in
        </Link>
      </div>
    )
  }

  const isLoading = state.status === 'loading'

  return (
    <div>
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Reset your password</h1>
        <p className="mt-1.5 text-sm text-gray-500">
          Enter your email and we&apos;ll send you a reset link
        </p>
      </div>

      {state.status === 'error' && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3.5 text-sm text-red-700">
          {state.message}
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div>
          <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-gray-700">
            Email address
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            disabled={isLoading}
            placeholder="you@example.com"
            className="flex h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
          />
        </div>
        <button
          type="submit"
          disabled={isLoading}
          className="flex w-full items-center justify-center rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoading ? (
            <>
              <svg className="mr-2 h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Sending…
            </>
          ) : (
            'Send reset link'
          )}
        </button>
      </form>

      <Link href="/login" className="mt-6 flex items-center justify-center text-sm font-medium text-gray-500 hover:text-gray-700">
        ← Back to sign in
      </Link>
    </div>
  )
}