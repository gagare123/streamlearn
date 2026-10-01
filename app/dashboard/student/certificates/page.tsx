'use client'

import { useState, useEffect } from 'react'
import { useAuthGuard } from '@/hooks/use-auth-guard'
import { useApiFetch } from '@/hooks/use-fetch'
import { FullPageSkeleton } from '@/components/auth/full-page-skeleton'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { Award, Download, BookOpen, Calendar } from 'lucide-react'

type Certificate = {
  id: string
  studentId: string
  courseId: string
  r2Key: string
  issuedAt: string
  studentName: string
  courseTitle: string
  courseDuration: number
  tutorName: string
}

function formatDuration(seconds: number): string {
  if (!seconds) return ''
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

export default function StudentCertificatesPage() {
  const { ready }    = useAuthGuard({ roles: ['STUDENT'] })
  const { apiFetch } = useApiFetch()
  const [certs, setCerts]   = useState<Certificate[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!ready) return
    void apiFetch<{ certificates: Certificate[] }>('/api/certificates').then((r) => {
      if (r.ok) setCerts(r.data.certificates)
      else toast.error(r.error)
      setLoading(false)
    })
  }, [ready, apiFetch])

  if (!ready) return <FullPageSkeleton />

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-gray-900">
          <Award className="h-6 w-6 text-amber-500" aria-hidden="true" />
          My Certificates
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          {loading ? 'Loading…' : `${certs.length} certificate${certs.length !== 1 ? 's' : ''} earned`}
        </p>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="rounded-2xl border border-gray-200 bg-white p-5">
              <Skeleton className="mb-3 h-10 w-10 rounded-full" />
              <Skeleton className="mb-2 h-5 w-full" />
              <Skeleton className="mb-4 h-4 w-3/4" />
              <Skeleton className="h-9 w-full rounded-lg" />
            </div>
          ))}
        </div>
      ) : certs.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 py-20 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-50">
            <Award className="h-8 w-8 text-amber-400" aria-hidden="true" />
          </div>
          <h3 className="text-base font-semibold text-gray-700">No certificates yet</h3>
          <p className="mt-1 max-w-xs text-sm text-gray-500">
            Complete all lessons in an enrolled course to earn your certificate.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {certs.map((cert) => (
            <div
              key={cert.id}
              className="relative overflow-hidden rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-5 shadow-sm"
            >
              <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-amber-200 opacity-30" aria-hidden="true" />

              <div className="relative mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
                <Award className="h-6 w-6 text-amber-600" aria-hidden="true" />
              </div>

              <h3 className="relative mb-1 text-sm font-bold text-gray-900 leading-snug line-clamp-2">
                {cert.courseTitle}
              </h3>
              <p className="relative text-xs text-gray-500 mb-1">
                by {cert.tutorName}
              </p>

              <div className="relative mt-2 flex flex-wrap gap-2 text-xs text-gray-500">
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" aria-hidden="true" />
                  {new Date(cert.issuedAt).toLocaleDateString('en-NG', {
                    year: 'numeric', month: 'short', day: 'numeric',
                  })}
                </span>
                {cert.courseDuration > 0 && (
                  <span className="flex items-center gap-1">
                    <BookOpen className="h-3 w-3" aria-hidden="true" />
                    {formatDuration(cert.courseDuration)}
                  </span>
                )}
              </div>

              <a
                href={`/api/certificates/${cert.id}/download`}
                className="relative mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-500 transition-colors"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                Download PDF
              </a>

              <p className="relative mt-2 text-center font-mono text-[10px] text-gray-400 truncate">
                ID: {cert.id}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}