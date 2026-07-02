'use client'

import { useState, type ReactNode } from 'react'
import { useAuthGuard } from '@/hooks/use-auth-guard'
import { FullPageSkeleton } from '@/components/auth/full-page-skeleton'
import { DashboardHeader } from '@/components/dashboard/dashboard-header'
import { SidebarNav } from '@/components/dashboard/sidebar-nav'
import { Menu, X } from 'lucide-react'

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { ready } = useAuthGuard()
  const [mobileOpen, setMobileOpen] = useState(false)

  if (!ready) return <FullPageSkeleton />

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <DashboardHeader onMenuClick={() => setMobileOpen(true)} />

      <div className="flex flex-1 overflow-hidden">
        {/* Desktop sidebar — always visible */}
        <aside className="hidden w-60 shrink-0 flex-col border-r bg-white lg:flex">
          <div className="flex-1 overflow-y-auto p-3 pt-4">
            <SidebarNav />
          </div>
          <div className="border-t p-3">
            <p className="text-center text-xs text-gray-400">StreamLearn v1.0</p>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto">
          <div className="px-4 pb-8 pt-6 lg:px-8">
            {children}
          </div>
        </main>
      </div>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="fixed inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <aside className="fixed left-0 top-0 h-full w-64 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <span className="text-sm font-bold text-gray-900">Menu</span>
              <button onClick={() => setMobileOpen(false)} className="rounded p-1 hover:bg-gray-100">
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>
            <div className="p-3">
              <SidebarNav />
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}