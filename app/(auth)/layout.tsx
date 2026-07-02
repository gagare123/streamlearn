import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: {
    template: '%s | StreamLearn',
    default: 'StreamLearn',
  },
}

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      {/* ── Minimal header ─────────────────────────────────────────────── */}
      <header className="flex h-14 items-center border-b bg-white px-6">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              className="h-4 w-4 text-white"
            >
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
          </div>
          <span className="text-sm font-bold tracking-tight text-gray-900">
            StreamLearn
          </span>
        </Link>
      </header>

      {/* ── Content ────────────────────────────────────────────────────── */}
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">{children}</div>
      </main>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer className="border-t bg-white py-4 text-center">
        <p className="text-xs text-gray-400">
          © {new Date().getFullYear()} StreamLearn. All rights reserved.
        </p>
      </footer>
    </div>
  )
}