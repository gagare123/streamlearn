'use client'

import Link from 'next/link'
import { UserNav } from '@/components/auth/user-nav'
import { Bell, Menu } from 'lucide-react'

type Props = {
  onMenuClick?: () => void
}

export function DashboardHeader({ onMenuClick }: Props) {
  return (
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b bg-white px-4 lg:px-6">
      <div className="flex items-center gap-3">
        {/* Mobile menu button */}
        <button
          onClick={onMenuClick}
          className="rounded-md p-1.5 hover:bg-gray-100 lg:hidden"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5 text-gray-600" />
        </button>

        {/* ── Logo ────────────────────────────────────────────────────────── */}
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              className="h-4 w-4 text-white"
              aria-hidden="true"
            >
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
          </div>
          <span className="text-sm font-bold text-gray-900 hidden sm:inline">
            Stream<span className="text-indigo-600">Learn</span>
          </span>
        </Link>
      </div>

      {/* ── Right side actions ───────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        {/* Notification bell — Phase 8 wires this up to SSE */}
        <Link
          href="/dashboard/notifications"
          className="relative flex h-9 w-9 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" aria-hidden="true" />
          {/* Unread dot — Phase 8 makes this dynamic */}
          <span
            className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-indigo-600 ring-1 ring-white"
            aria-hidden="true"
          />
        </Link>

        {/* Avatar + dropdown */}
        <UserNav />
      </div>
    </header>
  )
}