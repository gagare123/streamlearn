'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuthGuard } from '@/hooks/use-auth-guard'
import { useApiFetch } from '@/hooks/use-fetch'
import { FullPageSkeleton } from '@/components/auth/full-page-skeleton'
import { Skeleton } from '@/components/ui/skeleton'
import { Users } from 'lucide-react'

type StudentRow = {
  id: string
  name: string
  email: string
  courseTitle: string
  enrolledAt: string
  progress: number
}

export default function TutorStudentsPage() {
  const { ready } = useAuthGuard({ roles: ['TUTOR', 'ADMIN'] })
  const { apiFetch } = useApiFetch()
  const [students, setStudents] = useState<StudentRow[]>([])
  const [loading, setLoading] = useState(true)

  const fetchStudents = useCallback(async () => {
    setLoading(true)
    const r = await apiFetch<{ students: StudentRow[] }>('/api/tutor/students')
    if (r.ok) setStudents(r.data.students)
    setLoading(false)
  }, [apiFetch])

  useEffect(() => { if (ready) void fetchStudents() }, [ready, fetchStudents])

  if (!ready) return <FullPageSkeleton />

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
          <Users className="h-6 w-6 text-indigo-600" />
          My Students
        </h1>
        <p className="mt-1 text-sm text-gray-500">{students.length} students enrolled in your courses</p>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-left text-xs font-semibold uppercase text-gray-500">
              <th className="px-4 py-3">Student</th>
              <th className="px-4 py-3">Course</th>
              <th className="px-4 py-3">Enrolled</th>
              <th className="px-4 py-3">Progress</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              Array.from({ length: 5 }, (_, i) => (
                <tr key={i}>
                  {[1,2,3,4].map((j) => (
                    <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full rounded" /></td>
                  ))}
                </tr>
              ))
            ) : students.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-12 text-center text-sm text-gray-400">No students yet</td></tr>
            ) : (
              students.map((s) => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{s.name}</p>
                    <p className="text-xs text-gray-500">{s.email}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{s.courseTitle}</td>
                  <td className="px-4 py-3 text-gray-500">{new Date(s.enrolledAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-20 rounded-full bg-gray-200">
                        <div className="h-full rounded-full bg-indigo-600" style={{ width: `${s.progress}%` }} />
                      </div>
                      <span className="text-xs text-gray-500">{s.progress}%</span>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}