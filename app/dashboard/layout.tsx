'use client'

import { useState, type ReactNode } from 'react'
import { useAuthGuard } from '@/hooks/use-auth-guard'
import { FullPageSkeleton } from '@/components/auth/full-page-skeleton'
import { DashboardHeader } from '@/components/dashboard/dashboard-header'
import { SidebarNav } from '@/components/dashboard/sidebar-nav'
import { X, ChevronLeft } from 'lucide-react'

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { ready } = useAuthGuard()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [mobileOpen, setMobileOpen] = useState(false)
   
  if (!ready) return <FullPageSkeleton />

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <DashboardHeader onMenuClick={() => setMobileOpen(true)} />

      <div className="flex flex-1 overflow-hidden">
       
       
        {/* Desktop sidebar — collapsible */}
        {sidebarOpen && (
          <aside className="hidden w-60 shrink-0 flex-col border-r bg-white lg:flex">
            <div className="flex-1 overflow-y-auto p-3 pt-4">
              <SidebarNav />
            </div>
            <div className="border-t p-3">
              <p className="text-center text-xs text-gray-400">StreamLearn v1.0</p>
            </div>
          </aside>
        )}

        {/* Main content */}
        <main className="relative flex-1 overflow-y-auto">
          {/* Collapse toggle — visible on desktop */}
          <div className="sticky top-0 z-10 hidden border-b bg-white/95 backdrop-blur px-2 py-1 lg:block">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
            >
              <ChevronLeft
                className={`h-3.5 w-3.5 transition-transform duration-200 ${!sidebarOpen ? 'rotate-180' : ''}`}
              />
              <span>{sidebarOpen ? 'Collapse' : 'Expand'}</span>
            </button>
          </div>

          {/* Page content */}
          <div className="px-4 pb-8 pt-4 lg:px-8">{children}</div>
        </main>
      </div>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Backdrop */}
          <div className="fixed inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />

          {/* Slide-out sidebar */}
          <aside className="fixed left-0 top-0 h-full w-64 animate-slide-in bg-white shadow-xl">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <span className="text-sm font-bold text-gray-900">Menu</span>
              <button
                onClick={() => setMobileOpen(false)}
                className="rounded-md p-1 hover:bg-gray-100"
                aria-label="Close menu"
              >
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