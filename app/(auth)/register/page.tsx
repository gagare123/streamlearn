'use client'

import { useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

type FieldErrors = Partial<Record<'name' | 'email' | 'password' | 'role', string[]>>

type FormState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string; fields?: FieldErrors }
  | { status: 'success'; email: string }

function RegisterForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const defaultRole = searchParams.get('role') === 'tutor' ? 'TUTOR' : 'STUDENT'

  const [state, setState] = useState<FormState>({ status: 'idle' })
  const [role, setRole] = useState<'STUDENT' | 'TUTOR'>(defaultRole)
  const [password, setPassword] = useState('')

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setState({ status: 'loading' })

    const formData = new FormData(e.currentTarget)

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.get('name'),
          email: formData.get('email'),
          password: formData.get('password'),
          role,
        }),
        credentials: 'include',
      })

      const data = await res.json() as {
        success: boolean
        error?: string
        fields?: FieldErrors
      }

      if (!res.ok || !data.success) {
          setState({
      status: 'error',
      message: data.error ?? 'Registration failed. Please try again.',
      ...(data.fields ? { fields: data.fields } : {}),
    })
        return
      }

      setState({
        status: 'success',
        email: formData.get('email') as string,
      })
    } catch {
      setState({
        status: 'error',
        message: 'Network error. Please check your connection and try again.',
      })
    }
  }

  // ── Success state ─────────────────────────────────────────────────────────
  if (state.status === 'success') {
    return (
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="h-7 w-7 text-green-600"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-gray-900">Check your email</h2>
        <p className="mt-2 text-sm text-gray-500">
          We sent a verification link to{' '}
          <span className="font-medium text-gray-700">{state.email}</span>.
          Click it to activate your account.
        </p>
        <p className="mt-4 text-xs text-gray-400">
          Didn&apos;t receive it?{' '}
          <button
            type="button"
            className="text-indigo-600 hover:underline"
            onClick={async () => {
              await fetch('/api/auth/resend-verification', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: state.email }),
              })
            }}
          >
            Resend email
          </button>
        </p>
        <button
          type="button"
         onClick={() => router.push('/login')}
          className="mt-6 w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
        >
          Go to sign in
        </button>
      </div>
    )
  }

  const isLoading = state.status === 'loading'
  const fieldErrors = state.status === 'error' ? state.fields : undefined

  // Password strength
  const strength = getPasswordStrength(password)

  return (
    <div>
      {/* ── Heading ──────────────────────────────────────────────────── */}
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">
          Create your account
        </h1>
        <p className="mt-1.5 text-sm text-gray-500">
          Join StreamLearn — it&apos;s free
        </p>
      </div>

      {/* ── Error banner ─────────────────────────────────────────────── */}
      {state.status === 'error' && !fieldErrors && (
        <div className="mb-4 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-3.5 text-sm text-red-700">
          <svg viewBox="0 0 20 20" fill="currentColor" className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
          </svg>
          <span>{state.message}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {/* Role selector */}
        <div>
          <p className="mb-2 text-sm font-medium text-gray-700">I want to</p>
          <div className="grid grid-cols-2 gap-2">
            {(['STUDENT', 'TUTOR'] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRole(r)}
                disabled={isLoading}
                className={[
                  'flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-all',
                  role === r
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-700 ring-1 ring-indigo-500'
                    : 'border-gray-300 text-gray-600 hover:border-gray-400 hover:bg-gray-50',
                  isLoading && 'cursor-not-allowed opacity-60',
                ].join(' ')}
              >
                <span>{r === 'STUDENT' ? '🎓' : '👨‍🏫'}</span>
                {r === 'STUDENT' ? 'Learn' : 'Teach'}
              </button>
            ))}
          </div>
        </div>

        {/* Name */}
        <div>
          <label htmlFor="name" className="mb-1.5 block text-sm font-medium text-gray-700">
            Full name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            autoComplete="name"
            required
            disabled={isLoading}
            placeholder="Amina Yusuf"
            className={inputClass(!!fieldErrors?.name?.length)}
          />
          {fieldErrors?.name?.map((err) => (
            <p key={err} className="mt-1 text-xs text-red-600">{err}</p>
          ))}
        </div>

        {/* Email */}
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
            className={inputClass(!!fieldErrors?.email?.length)}
          />
          {fieldErrors?.email?.map((err) => (
            <p key={err} className="mt-1 text-xs text-red-600">{err}</p>
          ))}
        </div>

        {/* Password */}
        <div>
          <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-gray-700">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            disabled={isLoading}
            placeholder="Min. 8 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass(!!fieldErrors?.password?.length)}
          />
          {fieldErrors?.password?.map((err) => (
            <p key={err} className="mt-1 text-xs text-red-600">{err}</p>
          ))}

          {/* Password strength indicator */}
          {password.length > 0 && (
            <div className="mt-2">
              <div className="flex gap-1">
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className={[
                      'h-1 flex-1 rounded-full transition-all',
                      i < strength.score
                        ? strength.score <= 1
                          ? 'bg-red-400'
                          : strength.score <= 2
                            ? 'bg-amber-400'
                            : 'bg-green-500'
                        : 'bg-gray-200',
                    ].join(' ')}
                  />
                ))}
              </div>
              <p className="mt-1 text-xs text-gray-400">{strength.label}</p>
            </div>
          )}
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={isLoading}
          className="flex w-full items-center justify-center rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoading ? (
            <>
              <svg className="mr-2 h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Creating account…
            </>
          ) : (
            'Create account'
          )}
        </button>

        <p className="text-center text-xs text-gray-400">
          By creating an account you agree to our{' '}
          <Link href="/terms" className="text-indigo-600 hover:underline">Terms of Service</Link>
          {' '}and{' '}
          <Link href="/privacy" className="text-indigo-600 hover:underline">Privacy Policy</Link>.
        </p>
      </form>

      <p className="mt-6 text-center text-sm text-gray-500">
        Already have an account?{' '}
       <Link href="/login" className="font-medium text-indigo-600 hover:text-indigo-500">
          Sign in
        </Link>
      </p>
    </div>
  )
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="h-96 animate-skeleton-pulse rounded-lg bg-gray-100" />}>
      <RegisterForm />
    </Suspense>
  )
}

function inputClass(hasError: boolean): string {
  return [
    'flex h-10 w-full rounded-lg border bg-white px-3 py-2 text-sm',
    'placeholder:text-gray-400 transition-colors',
    'focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-0',
    'disabled:cursor-not-allowed disabled:bg-gray-50 disabled:opacity-60',
    hasError ? 'border-red-400 focus:ring-red-400' : 'border-gray-300 focus:border-indigo-500',
  ].join(' ')
}

function getPasswordStrength(password: string): { score: number; label: string } {
  let score = 0
  if (password.length >= 8) score++
  if (/[A-Z]/.test(password)) score++
  if (/[0-9]/.test(password)) score++
  if (/[^A-Za-z0-9]/.test(password)) score++

  const labels = ['Too weak', 'Weak', 'Fair', 'Good', 'Strong']
  return { score, label: labels[score] ?? 'Too weak' }
}