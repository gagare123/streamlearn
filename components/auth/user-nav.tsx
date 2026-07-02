'use client'

import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/auth-context'
import { getInitials } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import {
  LogOut,
  User,
  Settings,
  LayoutDashboard,
} from 'lucide-react'

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Admin',
  TUTOR: 'Tutor',
  STUDENT: 'Student',
}

const ROLE_DASHBOARD: Record<string, string> = {
  ADMIN: '/dashboard/admin',
  TUTOR: '/dashboard/tutor',
  STUDENT: '/dashboard/student',
}

export function UserNav() {
  const router = useRouter()
  const { user, logout } = useAuth()

  if (!user) return null

  const initials = getInitials(user.name)
  const dashboardHref = ROLE_DASHBOARD[user.role] ?? '/dashboard/student'
  const roleLabel = ROLE_LABELS[user.role] ?? user.role

  async function handleLogout() {
    await logout()
    router.push('/auth/login')
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          aria-label="Open user menu"
        >
          <Avatar className="h-8 w-8">
            {user.avatarR2Key && (
              <AvatarImage
                src={`/api/avatar/${user.id}`}
                alt={user.name}
              />
            )}
            <AvatarFallback className="text-xs font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="hidden text-left sm:block">
            <p className="max-w-[140px] truncate text-sm font-medium text-gray-900 leading-none">
              {user.name}
            </p>
            <p className="mt-0.5 text-xs text-gray-500">{user.email}</p>
          </div>
          <svg
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-4 w-4 text-gray-400"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        {/* User info header */}
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-semibold text-gray-900">
                {user.name}
              </span>
              <Badge
                variant={
                  user.role === 'ADMIN'
                    ? 'default'
                    : user.role === 'TUTOR'
                    ? 'secondary'
                    : 'outline'
                }
                className="text-[10px] px-1.5 py-0"
              >
                {roleLabel}
              </Badge>
            </div>
            <p className="truncate text-xs text-gray-500">{user.email}</p>
            {!user.emailVerified && (
              <p className="text-xs text-amber-600">⚠ Email not verified</p>
            )}
          </div>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onClick={() => router.push(dashboardHref)}
          className="cursor-pointer"
        >
          <LayoutDashboard className="mr-2 h-4 w-4" />
          Dashboard
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={() => router.push('/dashboard/profile')}
          className="cursor-pointer"
        >
          <User className="mr-2 h-4 w-4" />
          Profile
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={() => router.push('/dashboard/settings')}
          className="cursor-pointer"
        >
          <Settings className="mr-2 h-4 w-4" />
          Settings
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onClick={handleLogout}
          className="cursor-pointer text-red-600 focus:bg-red-50 focus:text-red-700"
        >
          <LogOut className="mr-2 h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}