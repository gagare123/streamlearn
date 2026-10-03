'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuthGuard } from '@/hooks/use-auth-guard'
import { useApiFetch } from '@/hooks/use-fetch'
import { FullPageSkeleton } from '@/components/auth/full-page-skeleton'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import {
  Award, RefreshCw, CheckCircle, Download, PlusCircle,
} from 'lucide-react'

type CompletedRow = {
  enrollmentId: string
  studentId: string
  studentName: string
  studentEmail: string
  courseId: string
  courseTitle: string
  completedAt: string
  hasCertificate: boolean
}

type CertificateRow = {
  id: string
  studentId: string
  courseId: string
  issuedAt: string
  studentName: string
  courseTitle: string
}

export default function AdminCertificatesPage() {
  const { ready } = useAuthGuard({ roles: ['ADMIN'] })
  const { apiFetch } = useApiFetch()
  const [completed, setCompleted] = useState<CompletedRow[]>([])
  const [certs, setCerts] = useState<CertificateRow[]>([])
  const [loading, setLoading] = useState(true)
  const [issuing, setIssuing] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const r = await apiFetch<{ completed: CompletedRow[]; certificates: CertificateRow[] }>(
      '/api/admin/certificates',
    )
    if (r.ok) {
      setCompleted(r.data.completed)
      setCerts(r.data.certificates)
    } else {
      toast.error(r.error)
    }
    setLoading(false)
  }, [apiFetch])

  useEffect(() => { if (ready) void fetchData() }, [ready, fetchData])

  async function issueCertificate(studentId: string, courseId: string, key: string) {
    setIssuing(key)
    const r = await apiFetch('/api/certificates', {
      method: 'POST',
      body: JSON.stringify({ studentId, courseId }),
    })
    if (r.ok) {
      toast.success('Certificate issued!')
      void fetchData()
    } else {
      toast.error(r.error || 'Failed to issue certificate')
    }
    setIssuing(null)
  }

  if (!ready) return <FullPageSkeleton />

  const pending = completed.filter(c => !c.hasCertificate)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <Award className="h-6 w-6 text-amber-500" />
            Certificates
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Issue and manage course certificates for students who completed their courses.
          </p>
        </div>
        <button onClick={() => void fetchData()} disabled={loading}
          className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>

      {/* Pending issuance */}
      <div>
        <div className="mb-3 flex items-center gap-3">
          <h2 className="text-base font-semibold text-gray-900">
            Ready to Issue
          </h2>
          {pending.length > 0 && (
            <Badge variant="warning" className="text-xs">
              {pending.length} pending
            </Badge>
          )}
        </div>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="rounded-xl border border-gray-200 bg-white p-4">
                <Skeleton className="h-5 w-64" />
              </div>
            ))}
          </div>
        ) : pending.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-gray-200 bg-white py-8 text-center">
            <CheckCircle className="mx-auto mb-2 h-8 w-8 text-green-500" />
            <p className="text-sm text-gray-500">All completed enrollments have certificates</p>
          </div>
        ) : (
          <div className="space-y-2">
            {pending.map((row) => {
              const key = `${row.studentId}:${row.courseId}`
              return (
                <div key={row.enrollmentId} className="flex flex-wrap items-center gap-4 rounded-xl border border-gray-200 bg-white p-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">
                    {row.studentName.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-900">{row.studentName}</p>
                    <p className="text-xs text-gray-500">{row.studentEmail}</p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-gray-400 uppercase tracking-wide">Course</p>
                    <p className="text-sm text-gray-700 truncate">{row.courseTitle}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs text-gray-400 uppercase tracking-wide">Completed</p>
                    <p className="text-sm text-gray-700">
                      {row.completedAt
                        ? new Date(row.completedAt).toLocaleDateString('en-NG')
                        : 'N/A'}
                    </p>
                  </div>
                  <button
                    onClick={() => issueCertificate(row.studentId, row.courseId, key)}
                    disabled={issuing === key}
                    className="flex items-center gap-1.5 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-500 disabled:opacity-50 transition-colors shrink-0"
                  >
                    <PlusCircle className="h-4 w-4" />
                    {issuing === key ? 'Issuing…' : 'Issue Certificate'}
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Issued certificates */}
      <div>
        <h2 className="mb-3 text-base font-semibold text-gray-900">
          Issued Certificates
        </h2>
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-left text-xs font-semibold uppercase text-gray-500">
                <th className="px-4 py-3">Student</th>
                <th className="px-4 py-3">Course</th>
                <th className="px-4 py-3 hidden md:table-cell">Issued</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                Array.from({ length: 4 }, (_, i) => (
                  <tr key={i}>
                    {[1,2,3,4].map((j) => (
                      <td key={j} className="px-4 py-3">
                        <Skeleton className="h-4 w-full rounded" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : certs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-12 text-center text-sm text-gray-400">
                    No certificates issued yet
                  </td>
                </tr>
              ) : (
                certs.map((cert) => (
                  <tr key={cert.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{cert.studentName}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{cert.courseTitle}</td>
                    <td className="px-4 py-3 text-xs text-gray-500 hidden md:table-cell">
                      {new Date(cert.issuedAt).toLocaleDateString('en-NG')}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <a
                        href={`/api/certificates/${cert.id}/download`}
                        className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100"
                      >
                        <Download className="h-3 w-3" />
                        Download
                      </a>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}