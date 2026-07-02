'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthGuard } from '@/hooks/use-auth-guard'
import { useAuth } from '@/context/auth-context'
import { FullPageSkeleton } from '@/components/auth/full-page-skeleton'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { toast } from 'sonner'
import { Lock, LogOut, ShieldCheck } from 'lucide-react'

export default function SettingsPage() {
  const { ready } = useAuthGuard()
  const { user, logout } = useAuth()
  const router = useRouter()

  if (!ready) return <FullPageSkeleton />

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Settings</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage your account security and preferences.
        </p>
      </div>

      <ChangePasswordCard />

      <Card className="border border-gray-200 shadow-none">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4 text-indigo-600" aria-hidden="true" />
            Account Security
          </CardTitle>
          <CardDescription>Your account protection status.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-gray-800">Email verification</p>
              <p className="text-xs text-gray-500">{user?.email}</p>
            </div>
            {user?.emailVerified ? (
              <span className="flex items-center gap-1.5 rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700">
                ✓ Verified
              </span>
            ) : (
              <span className="flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">
                ⚠ Unverified
              </span>
            )}
          </div>

          <div className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-gray-800">Password protection</p>
              <p className="text-xs text-gray-500">scrypt · memory-hard · OWASP compliant</p>
            </div>
            <span className="flex items-center gap-1.5 rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700">
              ✓ Secured
            </span>
          </div>

          <div className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-gray-800">Session management</p>
              <p className="text-xs text-gray-500">JWT · 15m access · 7d refresh · rotated on each use</p>
            </div>
            <span className="flex items-center gap-1.5 rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700">
              ✓ Active
            </span>
          </div>
        </CardContent>
      </Card>

      <Card className="border border-red-100 shadow-none">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-red-700">
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Sign out
          </CardTitle>
          <CardDescription>
            Sign out of this device, or revoke all active sessions.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={async () => {
              await logout()
              router.push('/login')
            }}
            className="flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Sign out this device
          </button>
        </CardContent>
      </Card>
    </div>
  )
}

type PwState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success' }
  | { status: 'error'; message: string; fields?: Record<string, string[]> }

function ChangePasswordCard() {
  const router = useRouter()
  const [state, setState] = useState<PwState>({ status: 'idle' })
  const [newPw, setNewPw] = useState('')

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setState({ status: 'loading' })

    const form = new FormData(e.currentTarget)
    const currentPassword = form.get('currentPassword') as string
    const newPassword = form.get('newPassword') as string

    try {
      const res = await fetch('/api/users/me/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
        credentials: 'include',
      })

      const data = (await res.json()) as {
        success: boolean
        error?: string
        fields?: Record<string, string[]>
      }

      if (!res.ok || !data.success) {
        setState({
          status: 'error',
          message: data.error ?? 'Failed to change password',
          ...(data.fields ? { fields: data.fields } : {}),
        })
        return
      }

      setState({ status: 'success' })
      toast.success('Password changed. Please sign in again.')
      setTimeout(() => router.push('/login'), 1500)
    } catch {
      setState({ status: 'error', message: 'Network error. Please try again.' })
    }
  }

  const isLoading = state.status === 'loading'
  const fieldErrors = state.status === 'error' ? state.fields : undefined
  const strength = getStrength(newPw)

  return (
    <Card className="border border-gray-200 shadow-none">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Lock className="h-4 w-4 text-indigo-600" aria-hidden="true" />
          Change Password
        </CardTitle>
        <CardDescription>
          Changing your password will sign you out of all devices.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {state.status === 'error' && !fieldErrors && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {state.message}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate className="space-y-4 max-w-sm">
          <div>
            <label htmlFor="currentPassword" className="mb-1.5 block text-sm font-medium text-gray-700">
              Current password
            </label>
            <input
              id="currentPassword"
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
              disabled={isLoading}
              className={inputCls(!!fieldErrors?.['currentPassword']?.length)}
            />
            {fieldErrors?.['currentPassword']?.map((e) => (
              <p key={e} className="mt-1 text-xs text-red-600">{e}</p>
            ))}
          </div>

          <div>
            <label htmlFor="newPassword" className="mb-1.5 block text-sm font-medium text-gray-700">
              New password
            </label>
            <input
              id="newPassword"
              name="newPassword"
              type="password"
              autoComplete="new-password"
              required
              disabled={isLoading}
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              className={inputCls(!!fieldErrors?.['newPassword']?.length)}
            />
            {fieldErrors?.['newPassword']?.map((e) => (
              <p key={e} className="mt-1 text-xs text-red-600">{e}</p>
            ))}

            {newPw.length > 0 && (
              <div className="mt-2 space-y-1.5">
                <div className="flex gap-1">
                  {[0, 1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className={[
                        'h-1 flex-1 rounded-full transition-all',
                        i < strength.score
                          ? strength.score <= 1 ? 'bg-red-400'
                            : strength.score <= 2 ? 'bg-amber-400'
                            : 'bg-green-500'
                          : 'bg-gray-200',
                      ].join(' ')}
                    />
                  ))}
                </div>
                <p className="text-xs text-gray-400">{strength.label}</p>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60 transition-colors"
          >
            {isLoading ? 'Changing…' : 'Change password'}
          </button>
        </form>
      </CardContent>
    </Card>
  )
}

function inputCls(err: boolean) {
  return [
    'flex h-10 w-full rounded-lg border bg-white px-3 py-2 text-sm placeholder:text-gray-400',
    'focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-0',
    'disabled:cursor-not-allowed disabled:opacity-60',
    err ? 'border-red-400' : 'border-gray-300',
  ].join(' ')
}

function getStrength(pw: string) {
  let s = 0
  if (pw.length >= 8) s++
  if (/[A-Z]/.test(pw)) s++
  if (/[0-9]/.test(pw)) s++
  if (/[^A-Za-z0-9]/.test(pw)) s++
  return { score: s, label: ['Too weak', 'Weak', 'Fair', 'Good', 'Strong'][s] ?? 'Too weak' }
}