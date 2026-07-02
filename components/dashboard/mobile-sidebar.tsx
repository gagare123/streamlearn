'use client'

import { useState } from 'react'
import { Menu, X } from 'lucide-react'
import { SidebarNav } from './sidebar-nav'
import { useAuth } from '@/context/auth-context'
import { getInitials } from '@/lib/utils'

export function MobileSidebar() {
  const [open, setOpen] = useState(false)
  const { user } = useAuth()

  return (
    <>
      {/* Hamburger trigger */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-9 w-9 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 lg:hidden"
        aria-label="Open navigation"
      >
        <Menu className="h-5 w-5" aria-hidden="true" />
      </button>

      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 z-50 lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40" />

          {/* Drawer */}
          <aside
            className="absolute inset-y-0 left-0 flex w-72 flex-col bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
            aria-label="Navigation drawer"
          >
            {/* Drawer header */}
            <div className="flex h-14 items-center justify-between border-b px-4">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">
                  {user ? getInitials(user.name) : '?'}
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900 leading-none">
                    {user?.name ?? 'Loading…'}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500 capitalize">
                    {user?.role.toLowerCase() ?? ''}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100"
                aria-label="Close navigation"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            {/* Nav items */}
            <div className="flex-1 overflow-y-auto p-3">
              <SidebarNav />
            </div>
          </aside>
        </div>
      )}
    </>
  )
}