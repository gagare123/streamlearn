'use client'

import { useState, useEffect } from 'react'
import { useAuthGuard } from '@/hooks/use-auth-guard'
import { useApiFetch } from '@/hooks/use-fetch'
import { FullPageSkeleton } from '@components/auth/full-page-skeleton'
import { Skeleton } from '@components/ui/skeleton'
import { toast } from 'sonner'
import { Award, Download, BookOpen, Calendar } from 'lucide-react'

type Certificate = {
  id: string
  student_id: string
  course_id: string
  r2_key: string
  issued_at: string
  course_title: string
  tutor_name: string
  total_duration_seconds: number
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
  const [certs, setCerts]       = useState<Certificate[]>([])
  const [loading, setLoading]   = useState(true)
  const [downloading, setDown]  = useState<string | null>(null)

  useEffect(() => {
    if (!ready) return
    void apiFetch<{ certificates: Certificate[] }>('/api/certificates').then((r) => {
      if (r.ok) setCerts(r.data.certificates)
      else toast.error(r.error)
      setLoading(false)
    })
  }, [ready, apiFetch])

  async function handleDownload(certId: string, courseTitle: string) {
    setDown(certId)
    try {
      const res = await fetch(`/api/certificates/${certId}/download`, { credentials: 'include' })
      if (!res.ok) { toast.error('Download failed'); return }

      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `StreamLearn-Certificate-${courseTitle.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '-').slice(0, 40)}.pdf`
      document.body.appendChild(a)
      a.click()
      URL.revokeObjectURL(url)
      document.body.removeChild(a)
      toast.success('Certificate downloaded!')
    } catch {
      toast.error('Download failed. Please try again.')
    } finally {
      setDown(null)
    }
  }

  if (!ready) return <FullPageSkeleton />

  return (
    <div className="space-y-6">
      {/* Header */}
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
              {/* Background decoration */}
              <div
                className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-amber-200 opacity-30"
                aria-hidden="true"
              />

              {/* Icon */}
              <div className="relative mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
                <Award className="h-6 w-6 text-amber-600" aria-hidden="true" />
              </div>

              {/* Course info */}
              <h3 className="relative mb-1 text-sm font-bold text-gray-900 leading-snug line-clamp-2">
                {cert.course_title}
              </h3>
              <p className="relative text-xs text-gray-500 mb-1">
                by {cert.tutor_name}
              </p>

              {/* Meta */}
              <div className="relative mt-2 flex flex-wrap gap-2 text-xs text-gray-500">
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" aria-hidden="true" />
                  {new Date(cert.issued_at).toLocaleDateString('en-NG', {
                    year: 'numeric', month: 'short', day: 'numeric',
                  })}
                </span>
                {cert.total_duration_seconds > 0 && (
                  <span className="flex items-center gap-1">
                    <BookOpen className="h-3 w-3" aria-hidden="true" />
                    {formatDuration(cert.total_duration_seconds)}
                  </span>
                )}
              </div>

              {/* Download */}
              <button
                onClick={() => void handleDownload(cert.id, cert.course_title)}
                disabled={downloading === cert.id}
                className="relative mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-500 disabled:opacity-60 transition-colors"
              >
                {downloading === cert.id ? (
                  <>
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Downloading…
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4" aria-hidden="true" />
                    Download PDF
                  </>
                )}
              </button>

              {/* Certificate ID */}
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