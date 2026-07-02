import Link from 'next/link'
import type { Metadata } from 'next'
import { ArrowRight, Play, Shield, BarChart3, Award, Zap, Users, Star } from 'lucide-react'

export const metadata: Metadata = {
  title: 'StreamLearn — Learn Without Limits',
  description:
    'Production-grade e-learning platform for Nigerian universities. Adaptive video streaming optimised for 3G networks.',
}

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col">
      {/* ── Nav ──────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-gray-100 bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-indigo-600">
              <Play className="h-3.5 w-3.5 text-white" fill="currentColor" aria-hidden="true" />
            </div>
            <span className="text-lg font-bold text-gray-900">
              Stream<span className="text-indigo-600">Learn</span>
            </span>
          </Link>

          <nav className="flex items-center gap-4">
            <Link
              href="/login"
              className="text-sm font-medium text-gray-600 transition-colors hover:text-gray-900"
            >
              Sign in
            </Link>
            <Link
              href="/register"
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-indigo-700 hover:shadow-md"
            >
              Join for free
            </Link>
          </nav>
        </div>
      </header>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-white px-4 pb-20 pt-16 sm:pt-24">
        {/* Subtle gradient background */}
        <div className="absolute inset-0 bg-gradient-to-b from-indigo-50/50 via-white to-white" />

        <div className="relative z-10 mx-auto max-w-4xl">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            {/* Left — text */}
            <div className="text-center lg:text-left">
              <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl lg:text-6xl">
                Learn skills that
                <span className="block text-indigo-600">move you forward</span>
              </h1>

              <p className="mt-5 text-base leading-relaxed text-gray-500 sm:text-lg">
                World‑class courses for Nigerian students. Adaptive video,
                interactive quizzes, and verifiable certificates — all optimised
                for 3G networks.
              </p>

              <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row lg:justify-start">
                <Link
                  href="/register"
                  className="group inline-flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-6 py-3.5 text-sm font-semibold text-white shadow-md transition-all hover:bg-indigo-700 hover:shadow-lg sm:w-auto"
                >
                  Start learning free
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </Link>
                <Link
                  href="/register?role=tutor"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-6 py-3.5 text-sm font-semibold text-gray-700 transition-all hover:border-gray-300 hover:bg-gray-50 sm:w-auto"
                >
                  Become a tutor
                </Link>
              </div>

              {/* Trust badges */}
              <div className="mt-8 flex items-center gap-5 text-xs text-gray-400 lg:justify-start justify-center">
                <span className="flex items-center gap-1">
                  <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-hidden="true" />
                  4.9 star ratings
                </span>
                <span>10K+ students</span>
                <span>500+ courses</span>
              </div>
            </div>

            {/* Right — illustration card */}
            <div className="hidden lg:block">
              <div className="relative rounded-2xl border border-gray-100 bg-white p-6 shadow-xl shadow-gray-100/50">
                {/* Fake course card */}
                <div className="mb-4 h-40 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 p-5 text-white">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/20">
                      <Play className="h-4 w-4" fill="currentColor" aria-hidden="true" />
                    </div>
                    <span className="text-xs font-medium opacity-80">Course preview</span>
                  </div>
                  <p className="mt-3 text-lg font-bold">Introduction to JavaScript</p>
                  <p className="mt-1 text-sm opacity-75">12 lessons · Beginner</p>
                </div>
                <div className="space-y-3">
                  <div className="h-3 w-3/4 rounded-full bg-gray-100" />
                  <div className="h-3 w-1/2 rounded-full bg-gray-100" />
                  <div className="flex items-center gap-2 mt-4">
                    <div className="h-8 w-8 rounded-full bg-gray-100" />
                    <div>
                      <div className="h-3 w-20 rounded-full bg-gray-100 mb-1" />
                      <div className="h-2 w-14 rounded-full bg-gray-50" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────────────────── */}
      <section className="border-t border-gray-100 bg-gray-50/50 px-4 py-24">
        <div className="mx-auto max-w-6xl">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-900 sm:text-3xl">
              Why students choose StreamLearn
            </h2>
            <p className="mx-auto mt-3 max-w-md text-sm text-gray-500">
              Every feature is designed for Nigerian networks — fast, affordable, reliable.
            </p>
          </div>

          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                icon: Play,
                title: 'Adaptive Video',
                desc: 'Mux streaming auto‑adjusts quality. Smooth playback even on 3G.',
                color: 'bg-indigo-50 text-indigo-600',
              },
              {
                icon: Shield,
                title: 'Secure in Naira',
                desc: 'Paystack payments with bank‑grade security. Pay what you see.',
                color: 'bg-emerald-50 text-emerald-600',
              },
              {
                icon: BarChart3,
                title: 'Track Progress',
                desc: 'Watch progress saved in real‑time. Pick up anywhere, any device.',
                color: 'bg-amber-50 text-amber-600',
              },
              {
                icon: Award,
                title: 'Earn Certificates',
                desc: 'Downloadable PDF certificates when you finish a course.',
                color: 'bg-rose-50 text-rose-600',
              },
              {
                icon: Zap,
                title: '3G First',
                desc: 'System fonts, tiny bundles, lazy loading. Instant page loads.',
                color: 'bg-sky-50 text-sky-600',
              },
              {
                icon: Users,
                title: 'Stay Updated',
                desc: 'Real‑time notifications for results, enrollments, and more.',
                color: 'bg-violet-50 text-violet-600',
              },
            ].map(({ icon: Icon, title, desc, color }) => (
              <div
                key={title}
                className="group rounded-xl border border-gray-100 bg-white p-6 transition-shadow hover:shadow-md"
              >
                <div className={`mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg ${color}`}>
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </div>
                <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-gray-500">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────────────── */}
      <section className="bg-gray-900 px-4 py-20">
        <div className="mx-auto max-w-lg text-center">
          <h2 className="text-2xl font-bold text-white sm:text-3xl">
            Start learning today
          </h2>
          <p className="mt-3 text-sm text-gray-400">
            Free to start. No hidden fees. Learn at your own pace.
          </p>
          <Link
            href="/register"
            className="group mt-8 inline-flex items-center gap-2 rounded-lg bg-white px-6 py-3.5 text-sm font-semibold text-gray-900 shadow-lg transition-all hover:bg-gray-100 hover:shadow-xl"
          >
            Create your free account
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </Link>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer className="border-t border-gray-800 bg-gray-900 px-4 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 sm:flex-row">
          <p className="text-xs text-gray-500">
            &copy; {new Date().getFullYear()} StreamLearn. Built for Nigerian universities.
          </p>
          <div className="flex items-center gap-6">
            <Link href="/login" className="text-xs text-gray-500 hover:text-gray-300 transition-colors">
              Sign in
            </Link>
            <Link href="/register" className="text-xs text-gray-500 hover:text-gray-300 transition-colors">
              Create account
            </Link>
          </div>
        </div>
      </footer>
    </main>
  )
}

