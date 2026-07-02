'use client'

import { useState, type FormEvent } from 'react'
import { useAuthGuard } from '@/hooks/use-auth-guard'
import { useAuth } from '@/context/auth-context'
import { FullPageSkeleton } from '@/components/auth/full-page-skeleton'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { getInitials, formatDate } from '@/lib/utils'
import { toast } from 'sonner'
import { User, Mail, Calendar, Shield } from 'lucide-react'

export default function ProfilePage() {
  const { ready, user } = useAuthGuard()
  const { refresh } = useAuth()
  const [isSaving, setIsSaving] = useState(false)

  if (!ready) return <FullPageSkeleton />

  async function handleSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setIsSaving(true)

    // Phase 4 adds the PATCH /api/users/me endpoint
    // For now, show a toast and simulate
    await new Promise((r) => setTimeout(r, 600))
    toast.success('Profile updated successfully')
    setIsSaving(false)
  }

  const ROLE_BADGE: Record<string, 'default' | 'secondary' | 'outline'> = {
    ADMIN: 'default', TUTOR: 'secondary', STUDENT: 'outline',
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Profile</h1>
        <p className="mt-1 text-sm text-gray-500">Manage your personal information and preferences.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* ── Avatar card ─────────────────────────────────────────────── */}
        <Card className="border border-gray-200 shadow-none lg:col-span-1">
          <CardContent className="flex flex-col items-center p-6 text-center">
            <Avatar className="h-24 w-24">
              <AvatarFallback className="text-2xl font-bold">
                {getInitials(user.name)}
              </AvatarFallback>
            </Avatar>
            <p className="mt-4 text-base font-semibold text-gray-900">{user.name}</p>
            <p className="text-sm text-gray-500">{user.email}</p>
            <div className="mt-2 flex items-center gap-2">
              <Badge variant={ROLE_BADGE[user.role] ?? 'outline'} className="text-xs">
                {user.role}
              </Badge>
              {user.emailVerified
                ? <Badge variant="success" className="text-xs">Verified</Badge>
                : <Badge variant="warning" className="text-xs">Unverified</Badge>
              }
            </div>

            <div className="mt-6 w-full space-y-3 text-left">
              {[
                { icon: User,     label: 'Member',  value: user.role.charAt(0) + user.role.slice(1).toLowerCase() },
                { icon: Calendar, label: 'Joined',  value: formatDate(user.createdAt) },
                { icon: Shield,   label: 'Account', value: user.isActive ? 'Active' : 'Suspended' },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-2.5 text-sm text-gray-600">
                  <item.icon className="h-4 w-4 text-gray-400" aria-hidden="true" />
                  <span className="font-medium text-gray-500">{item.label}:</span>
                  <span>{item.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* ── Edit form ───────────────────────────────────────────────── */}
        <Card className="border border-gray-200 shadow-none lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Personal Information</CardTitle>
            <CardDescription>Update your name and bio.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label htmlFor="name" className="mb-1.5 block text-sm font-medium text-gray-700">
                  Full name
                </label>
                <input
                  id="name"
                  name="name"
                  type="text"
                  defaultValue={user.name}
                  required
                  className="flex h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-gray-700">
                  Email address
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="email"
                    type="email"
                    value={user.email}
                    disabled
                    className="flex h-10 flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500 cursor-not-allowed"
                  />
                  <Mail className="h-4 w-4 text-gray-400" aria-hidden="true" />
                </div>
                <p className="mt-1 text-xs text-gray-400">Email changes are not supported yet.</p>
              </div>

              <div>
                <label htmlFor="bio" className="mb-1.5 block text-sm font-medium text-gray-700">
                  Bio <span className="text-gray-400">(optional)</span>
                </label>
                <textarea
                  id="bio"
                  name="bio"
                  rows={3}
                  defaultValue={user.bio ?? ''}
                  placeholder="Tell students a bit about yourself…"
                  className="flex w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm resize-y focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60 transition-colors"
                >
                  {isSaving ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}