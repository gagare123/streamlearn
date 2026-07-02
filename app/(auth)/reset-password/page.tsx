'use client'

import { useState, Suspense, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'

type FormState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success' }
  | { status: 'error'; message: string; fields?: Partial<Record<'password', string[]>> }

function ResetPasswordForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')
  const [state, setState] = useState<FormState>({ status: 'idle' })
  const [password, setPassword] = useState('')

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!token) return

    setState({ status: 'loading' })

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })

      const data = await res.json() as {
        success: boolean
        error?: string
        fields?: Partial<Record<'password', string[]>>
      }

      if (!res.ok || !data.success) {
        setState({ status: 'error', message: data.error ?? 'Reset failed.', ...(data.fields ? { fields: data.fields } : {}) })
      }

      setState({ status: 'success' })
      window.location.href = '/login'
    } catch {
      setState({ status: 'error', message: 'Network error. Please try again.' })
    }
  }

  if (!token) {
    return (
      <div className="text-center">
        <p className="text-sm text-gray-500">Invalid or missing reset link. Please request a new one.</p>
        <Link href="/forgot-password" className="mt-4 flex items-center justify-center text-sm font-medium text-indigo-600 hover:underline">
          Request new link
        </Link>
      </div>
    )
  }

  if (state.status === 'success') {
    return (
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-7 w-7 text-green-600">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-gray-900">Password reset!</h2>
        <p className="mt-2 text-sm text-gray-500">Redirecting you to sign in…</p>
      </div>
    )
  }

  const isLoading = state.status === 'loading'
  const fieldErrors = state.status === 'error' ? state.fields : undefined

  return (
    <div>
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Choose a new password</h1>
        <p className="mt-1.5 text-sm text-gray-500">Must be at least 8 characters</p>
      </div>

      {state.status === 'error' && !fieldErrors && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3.5 text-sm text-red-700">
          {state.message}
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div>
          <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-gray-700">
            New password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            disabled={isLoading}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Min. 8 characters"
            className={[
              'flex h-10 w-full rounded-lg border bg-white px-3 py-2 text-sm placeholder:text-gray-400',
              'focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-0',
              'disabled:cursor-not-allowed disabled:opacity-60',
              fieldErrors?.password ? 'border-red-400' : 'border-gray-300',
            ].join(' ')}
          />
          {fieldErrors?.password?.map((err) => (
            <p key={err} className="mt-1 text-xs text-red-600">{err}</p>
          ))}
          {password.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs text-gray-500">
              {[
                [/^.{8,}$/, '8+ characters'],
                [/[A-Z]/, 'One uppercase letter'],
                [/[0-9]/, 'One number'],
              ].map(([regex, label]) => (
                <li key={label as string} className={`flex items-center gap-1.5 ${(regex as RegExp).test(password) ? 'text-green-600' : ''}`}>
                  {(regex as RegExp).test(password) ? '✓' : '○'} {label as string}
                </li>
              ))}
            </ul>
          )}
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="flex w-full items-center justify-center rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoading ? 'Resetting…' : 'Reset password'}
        </button>
      </form>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="h-64 animate-skeleton-pulse rounded-lg bg-gray-100" />}>
      <ResetPasswordForm />
    </Suspense>
  )
}