'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useAuth } from '@/context/auth-context'
import { useApiFetch } from '@/hooks/use-fetch'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import {
  BookOpen, PlayCircle, Trophy, ClipboardList, TrendingUp,
  Clock, ArrowRight, GraduationCap,
} from 'lucide-react'

type DashboardStats = {
  enrolled: number
  inProgress: number
  completed: number
  quizzesDone: number
}

type ContinueCourse = {
  id: string
  title: string
  level: string
  tutorName: string
  progress: number
  completedLessons: number
  totalLessons: number
}

export default function StudentDashboardPage() {
  const { user } = useAuth()
  const { apiFetch } = useApiFetch()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [continueCourses, setContinueCourses] = useState<ContinueCourse[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      const [statsRes, coursesRes] = await Promise.all([
        apiFetch<DashboardStats>('/api/dashboard/student/stats'),
        apiFetch<{ courses: ContinueCourse[] }>('/api/enrollments'),
      ])

      if (statsRes.ok) setStats(statsRes.data)
       if (coursesRes.ok) {
       const courses = (coursesRes.data as any).enrollments?.map((e: any) => ({
        id: e.course?.id,
        title: e.course?.title,
        level: e.course?.level,
        tutorName: e.tutor?.name || e.course?.tutorName || 'Unknown',
        progress: e.progress?.percentComplete || 0,
        completedLessons: e.progress?.completedLessons || 0,
        totalLessons: e.progress?.totalLessons || 0,
      })) || []
      setContinueCourses(courses)
    }
      setLoading(false)
    }
    void fetchData()
  }, [apiFetch])

  const firstName = user?.name?.split(' ')[0] || 'there'

  return (
    <div className="space-y-8">
      {/* ── Welcome ──────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">
          Welcome back, {firstName} 👋
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Pick up where you left off or explore new courses.
        </p>
      </div>

      {/* ── Stats cards ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {loading ? (
          Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="rounded-xl border border-gray-200 bg-white p-4">
              <Skeleton className="mb-2 h-4 w-12" />
              <Skeleton className="h-8 w-8" />
            </div>
          ))
        ) : (
          [
            { label: 'Enrolled', value: stats?.enrolled ?? 0, icon: BookOpen, color: 'text-blue-600 bg-blue-50' },
            { label: 'In Progress', value: stats?.inProgress ?? 0, icon: Clock, color: 'text-amber-600 bg-amber-50' },
            { label: 'Completed', value: stats?.completed ?? 0, icon: Trophy, color: 'text-green-600 bg-green-50' },
            { label: 'Quizzes Done', value: stats?.quizzesDone ?? 0, icon: ClipboardList, color: 'text-purple-600 bg-purple-50' },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="rounded-xl border border-gray-200 bg-white p-4">
              <div className={`mb-2 inline-flex h-8 w-8 items-center justify-center rounded-lg ${color}`}>
                <Icon className="h-4 w-4" />
              </div>
              <p className="text-2xl font-bold text-gray-900">{value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{label}</p>
            </div>
          ))
        )}
      </div>

      {/* ── Continue Learning ────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900">
            <TrendingUp className="h-5 w-5 text-indigo-600" />
            Continue Learning
          </h2>
          <Link href="/dashboard/student/courses" className="flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-500">
            All courses <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {Array.from({ length: 2 }, (_, i) => (
              <div key={i} className="rounded-xl border border-gray-200 bg-white p-5">
                <Skeleton className="mb-3 h-5 w-3/4" />
                <Skeleton className="mb-2 h-4 w-1/2" />
                <Skeleton className="h-2 w-full rounded-full" />
              </div>
            ))}
          </div>
        ) : continueCourses.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-gray-200 bg-white p-10 text-center">
            <GraduationCap className="mx-auto h-10 w-10 text-gray-300 mb-3" />
            <p className="text-sm font-medium text-gray-700">No courses yet</p>
            <Link href="/courses" className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-500">
              Browse courses <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {continueCourses.slice(0, 4).map((course) => (
              <Link
                key={course.id}
                href={`/dashboard/student/courses/${course.id}`}
                className="group rounded-xl border border-gray-200 bg-white p-5 hover:border-indigo-200 hover:shadow-md transition-all"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <Badge variant="secondary" className="text-[10px] mb-1.5">
                      {course.level?.toLowerCase() || 'beginner'}
                    </Badge>
                    <h3 className="font-semibold text-gray-900 group-hover:text-indigo-700 transition-colors">
                      {course.title}
                    </h3>
                    <p className="text-xs text-gray-500 mt-0.5">{course.tutorName}</p>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>{course.completedLessons}/{course.totalLessons} lessons</span>
                    <span className="font-medium">{course.progress}%</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-gray-100">
                    <div
                      className="h-full rounded-full bg-indigo-600 transition-all"
                      style={{ width: `${course.progress}%` }}
                    />
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-1.5 text-sm font-semibold text-indigo-600">
                  {course.progress === 0 ? 'Start' : course.progress === 100 ? 'Review' : 'Continue'}
                  <PlayCircle className="h-4 w-4" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* ── Quick Actions ────────────────────────────────────────────── */}
      <div>
        <h2 className="mb-4 text-lg font-bold text-gray-900">Quick Actions</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'Browse Courses', href: '/courses', icon: BookOpen },
            { label: 'My Progress', href: '/dashboard/student/courses', icon: TrendingUp },
            { label: 'Take Quiz', href: '/dashboard/student/quizzes', icon: ClipboardList },
            { label: 'Certificates', href: '/dashboard/student/certificates', icon: Trophy },
          ].map(({ label, href, icon: Icon }) => (
            <Link
              key={label}
              href={href}
              className="flex flex-col items-center gap-2 rounded-xl border border-gray-200 bg-white p-4 text-center hover:border-indigo-200 hover:bg-indigo-50/50 transition-all"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50">
                <Icon className="h-5 w-5 text-indigo-600" />
              </div>
              <span className="text-xs font-medium text-gray-700">{label}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}

















// 'use client'

// import { useState, useEffect } from 'react'
// import Link from 'next/link'
// import { useAuthGuard } from '@/hooks/use-auth-guard'
// import { useApiFetch } from '@/hooks/use-fetch'
// import { FullPageSkeleton } from '@/components/auth/full-page-skeleton'
// import { Progress } from '@/components/ui/progress'
// import { Badge } from '@/components/ui/badge'
// import { Skeleton } from '@/components/ui/skeleton'
// import { BookOpen, PlayCircle, Award, ClipboardList, ArrowRight } from 'lucide-react'

// type EnrolledCourse = {
//   id: string
//   course: { id: string; title: string; totalLessons: number; level: string }
//   tutor: { name: string }
//   progress: { completedLessons: number; totalLessons: number; percentComplete: number }
// }

// export default function StudentDashboardPage() {
//   const { ready, user } = useAuthGuard({ roles: ['STUDENT'] })
//   const { apiFetch } = useApiFetch()
//   const [enrollments, setEnrollments] = useState<EnrolledCourse[]>([])
//   const [loading, setLoading] = useState(true)

//   useEffect(() => {
//     if (!ready) return
//     void apiFetch<{ enrollments: EnrolledCourse[] }>('/api/enrollments').then((r) => {
//       if (r.ok) setEnrollments(r.data.enrollments)
//       setLoading(false)
//     })
//   }, [ready, apiFetch])

//   if (!ready) return <FullPageSkeleton />

//   const inProgress = enrollments.filter((e) => e.progress.percentComplete > 0 && e.progress.percentComplete < 100)
//   const completed = enrollments.filter((e) => e.progress.percentComplete === 100)

//   return (
//     <div className="space-y-6">
//       <div>
//         <h1 className="text-2xl font-bold tracking-tight text-gray-900">
//           Welcome back, {user.name.split(' ')[0]} 👋
//         </h1>
//         <p className="mt-1 text-sm text-gray-500">Pick up where you left off or explore new courses.</p>
//       </div>

//       <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
//         {[
//           { icon: BookOpen,      bg: 'bg-indigo-50', col: 'text-indigo-600', val: String(enrollments.length), label: 'Enrolled' },
//           { icon: PlayCircle,    bg: 'bg-blue-50',   col: 'text-blue-600',   val: String(inProgress.length),  label: 'In Progress' },
//           { icon: Award,         bg: 'bg-green-50',  col: 'text-green-600',  val: String(completed.length),   label: 'Completed' },
//           { icon: ClipboardList, bg: 'bg-amber-50',  col: 'text-amber-600',  val: '—',                        label: 'Quizzes Done' },
//         ].map(({ icon: Icon, bg, col, val, label }) => (
//           <div key={label} className="rounded-lg border border-gray-200 bg-white p-4">
//             <div className={'flex h-9 w-9 items-center justify-center rounded-lg ' + bg}>
//               <Icon className={'h-5 w-5 ' + col} />
//             </div>
//             <p className="mt-3 text-2xl font-bold text-gray-900">{loading ? '—' : val}</p>
//             <p className="text-xs text-gray-500">{label}</p>
//           </div>
//         ))}
//       </div>

//       <section>
//         <div className="mb-4 flex items-center justify-between">
//           <h2 className="text-base font-semibold text-gray-900">Continue Learning</h2>
//           <Link href="/dashboard/student/courses" className="flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-500">
//             All courses <ArrowRight className="h-3.5 w-3.5" />
//           </Link>
//         </div>

//         {loading ? (
//           <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
//             {Array.from({ length: 3 }, (_, i) => (
//               <div key={i} className="rounded-xl border border-gray-200 bg-white p-4">
//                 <Skeleton className="mb-3 h-36 w-full rounded-lg" />
//                 <Skeleton className="mb-2 h-4 w-3/4" />
//                 <Skeleton className="mb-3 h-3 w-1/2" />
//                 <Skeleton className="h-2 w-full rounded-full" />
//               </div>
//             ))}
//           </div>
//         ) : enrollments.length === 0 ? (
//           <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 py-16 text-center">
//             <BookOpen className="mb-3 h-12 w-12 text-gray-300" />
//             <h3 className="text-base font-semibold text-gray-700">No courses yet</h3>
//             <p className="mt-1 text-sm text-gray-500">Browse the catalogue and enroll in your first course.</p>
//             <Link href="/courses" className="mt-5 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500">
//               Browse Courses
//             </Link>
//           </div>
//         ) : (
//           <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
//             {(inProgress.length > 0 ? inProgress : enrollments).slice(0, 3).map((e) => (
//               <div key={e.id} className="flex flex-col rounded-xl border border-gray-200 bg-white hover:shadow-sm transition-shadow">
//                 <div className="flex h-36 items-center justify-center rounded-t-xl bg-gradient-to-br from-indigo-50 to-indigo-100">
//                   <PlayCircle className="h-10 w-10 text-indigo-300" />
//                 </div>
//                 <div className="flex flex-1 flex-col p-4">
//                   <Badge variant="secondary" className="mb-2 w-fit text-xs capitalize">{e.course.level.toLowerCase()}</Badge>
//                   <h3 className="mb-1 line-clamp-2 text-sm font-semibold text-gray-900">{e.course.title}</h3>
//                   <p className="mb-3 text-xs text-gray-500">{e.tutor.name}</p>
//                   <div className="mt-auto">
//                     <div className="mb-1 flex justify-between text-xs text-gray-500">
//                       <span>{e.progress.percentComplete}% complete</span>
//                       <span>{e.progress.completedLessons}/{e.progress.totalLessons}</span>
//                     </div>
//                     <Progress value={e.progress.percentComplete} className="h-1.5" />
//                   </div>
//                   <Link href={'/dashboard/student/courses/' + e.course.id}
//                     className="mt-3 flex items-center justify-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 transition-colors">
//                     <PlayCircle className="h-3.5 w-3.5" />
//                     {e.progress.percentComplete === 0 ? 'Start' : 'Continue'}
//                   </Link>
//                 </div>
//               </div>
//             ))}
//           </div>
//         )}
//       </section>

//       {!user.emailVerified && (
//         <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
//           <div className="flex items-start gap-3">
//             <span className="text-lg">⚠️</span>
//             <div>
//               <p className="text-sm font-semibold text-amber-800">Verify your email</p>
//               <p className="mt-1 text-sm text-amber-700">
//                 Some features are limited until you verify your email.{' '}
//                 <Link href="/auth/resend-verification" className="font-medium underline">Resend email</Link>
//               </p>
//             </div>
//           </div>
//         </div>
//       )}

//       <section>
//         <h2 className="mb-4 text-base font-semibold text-gray-900">Quick Actions</h2>
//         <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
//           {[
//             { label: 'Browse Courses', href: '/courses',                        icon: BookOpen },
//             { label: 'My Progress',    href: '/dashboard/student/courses',      icon: PlayCircle },
//             { label: 'Take Quiz',      href: '/dashboard/student/quizzes',      icon: ClipboardList },
//             { label: 'Certificates',   href: '/dashboard/student/certificates', icon: Award },
//           ].map(({ label, href, icon: Icon }) => (
//             <Link key={label} href={href}
//               className="flex flex-col items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-4 text-center text-sm font-medium text-gray-700 transition-all hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700">
//               <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100">
//                 <Icon className="h-5 w-5 text-gray-500" />
//               </div>
//               {label}
//             </Link>
//           ))}
//         </div>
//       </section>
//     </div>
//   )
// }