'use client'

import { useState, useEffect, useCallback, type FormEvent } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuthGuard } from '@/hooks/use-auth-guard'
import { useApiFetch } from '@/hooks/use-fetch'
import { FullPageSkeleton } from '@/components/auth/full-page-skeleton'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { formatNaira, formatDuration } from '@/lib/utils'
import {
  ArrowLeft, PlusCircle, ChevronDown, ChevronRight,
  Trash2, Globe, Video, FileText,
  CheckCircle, Clock, AlertCircle, Upload,
} from 'lucide-react'

type Lesson = {
  id: string
  title: string
  position: number
  muxAssetStatus: 'WAITING' | 'PREPARING' | 'READY' | 'ERRORED'
  muxPlaybackId: string | null
  durationSeconds: number
  isFreePreview: boolean
  attachmentR2Key: string | null
}

type Section = {
  id: string
  title: string
  position: number
  lessons: Lesson[]
}

type CourseDetail = {
  id: string
  title: string
  description: string | null
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
  level: string
  priceKobo: number
  tags: string[]
  totalLessons: number
  totalDurationSeconds: number
  totalEnrollments: number
  curriculum: Section[]
  tutor: { id: string; name: string }
}

function MuxStatusIcon({ status }: { status: Lesson['muxAssetStatus'] }) {
  switch (status) {
    case 'READY': return <CheckCircle className="h-4 w-4 text-green-500" aria-label="Ready" />
    case 'PREPARING': return <Clock className="h-4 w-4 text-amber-500 animate-pulse" aria-label="Processing" />
    case 'ERRORED': return <AlertCircle className="h-4 w-4 text-red-500" aria-label="Error" />
    case 'WAITING': return <Upload className="h-4 w-4 text-gray-400" aria-label="Awaiting upload" />
  }
}

const STATUS_BADGE: Record<string, 'success' | 'secondary' | 'outline'> = {
  PUBLISHED: 'success', DRAFT: 'secondary', ARCHIVED: 'outline',
}

export default function CourseEditorPage() {
  const { ready } = useAuthGuard({ roles: ['TUTOR', 'ADMIN'] })
  const { apiFetch } = useApiFetch()
  const params = useParams()
  const router = useRouter()
  const courseId = params['id'] as string

  const [course, setCourse] = useState<CourseDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set())
  const [addingSectionTitle, setAddingSectionTitle] = useState('')
  const [showAddSection, setShowAddSection] = useState(false)
  const [addingLesson, setAddingLesson] = useState<string | null>(null)
  const [newLessonTitle, setNewLessonTitle] = useState('')
  const [uploadingId, setUploadingId] = useState<string | null>(null)

  const fetchCourse = useCallback(async () => {
    const result = await apiFetch<{ course: CourseDetail }>(`/api/courses/${courseId}`)
    if (result.ok) {
      setCourse(result.data.course)
      setExpandedSections(new Set(result.data.course.curriculum.map((s) => s.id)))
    } else {
      toast.error(result.error)
    }
    setLoading(false)
  }, [apiFetch, courseId])

  useEffect(() => { if (ready) void fetchCourse() }, [ready, fetchCourse])

  async function handleAddSection(e: FormEvent) {
    e.preventDefault()
    if (!addingSectionTitle.trim()) return
    setSaving(true)
    const result = await apiFetch(`/api/courses/${courseId}/sections`, {
      method: 'POST',
      body: JSON.stringify({ title: addingSectionTitle.trim() }),
    })
    if (result.ok) {
      toast.success('Section added')
      setAddingSectionTitle('')
      setShowAddSection(false)
      void fetchCourse()
    } else {
      toast.error(result.error)
    }
    setSaving(false)
  }

  async function handleDeleteSection(sectionId: string) {
    if (!confirm('Delete this section and all its lessons? This cannot be undone.')) return
    setSaving(true)
    const res = await apiFetch(`/api/courses/${courseId}/sections`, {
      method: 'DELETE',
      body: JSON.stringify({ sectionId }),
    })
    if (res.ok) {
      toast.success('Section deleted')
      void fetchCourse()
    } else {
      toast.error(res.error || 'Failed to delete')
    }
    setSaving(false)
  }

  async function handleAddLesson(sectionId: string) {
    if (!newLessonTitle.trim()) return
    setSaving(true)
    const result = await apiFetch(`/api/courses/${courseId}/sections/${sectionId}/lessons`, {
      method: 'POST',
      body: JSON.stringify({ title: newLessonTitle.trim(), isFreePreview: false }),
    })
    if (result.ok) {
      toast.success('Lesson created')
      setNewLessonTitle('')
      setAddingLesson(null)
      void fetchCourse()
    } else {
      toast.error(result.error)
    }
    setSaving(false)
  }

  async function handleUploadVideo(lessonId: string) {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'video/*'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      setUploadingId(lessonId)
      toast.info('Preparing video upload...')
      const muxRes = await apiFetch<{ url: string; uploadId: string }>(
        `/api/lessons/${lessonId}/upload`,
        { method: 'POST' }
      )
      if (!muxRes.ok) {
        toast.error(muxRes.error || 'Failed to get upload URL')
        setUploadingId(null)
        return
      }
      toast.info('Uploading video to Mux...')
      const uploadRes = await fetch(muxRes.data.url, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      })
      if (!uploadRes.ok) {
        toast.error('Video upload failed')
        setUploadingId(null)
        return
      }
      toast.success('🎬 Video uploaded! Mux is processing...')
      setUploadingId(null)
      void fetchCourse()
    }
    input.click()
  }

  async function handleUploadAttachment(lessonId: string) {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.pdf,.pptx,.docx,.txt'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      setUploadingId(lessonId)

      // Step 1: Get pre-signed URL
      toast.info('📄 Preparing PDF upload...')
      const presignRes = await apiFetch<{ uploadUrl: string; key: string }>(
        '/api/upload/presign',
        {
          method: 'POST',
          body: JSON.stringify({
            contentType: file.type,
            target: 'lesson_attachment',
            resourceId: lessonId,
            fileSizeBytes: file.size,
          }),
        }
      )
      if (!presignRes.ok) {
        toast.error(presignRes.error || 'Failed to get upload URL')
        setUploadingId(null)
        return
      }

      // Step 2: Upload to R2
      toast.info('📄 Uploading file...')
      const uploadRes = await fetch(presignRes.data.uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      })
      if (!uploadRes.ok) {
        toast.error('❌ Upload failed — check R2 configuration')
        setUploadingId(null)
        return
      }

      // Step 3: Save to lesson
      toast.info('📄 Saving attachment...')
      const patchRes = await apiFetch(`/api/lessons/${lessonId}/attachment`, {
        method: 'PATCH',
        body: JSON.stringify({ r2Key: presignRes.data.key }),
      })
      if (patchRes.ok) {
        toast.success('📄 Attachment uploaded successfully!', {
          duration: 5000,
          description: 'Your PDF is now available for students to download.',
        })
        void fetchCourse()
      } else {
        toast.error(patchRes.error || 'Failed to save attachment')
      }
      setUploadingId(null)
    }
    input.click()
  }

  async function handleStatusChange(status: 'PUBLISHED' | 'DRAFT' | 'ARCHIVED') {
    setSaving(true)
    const result = await apiFetch(`/api/courses/${courseId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    })
    if (result.ok) {
      toast.success(`Course ${status.toLowerCase()} successfully`)
      void fetchCourse()
    } else {
      toast.error(result.error)
    }
    setSaving(false)
  }

  async function handleDeleteCourse() {
    if (!confirm('Delete this course and all its sections, lessons, and enrollments? This cannot be undone.')) return
    setSaving(true)
    const res = await apiFetch(`/api/courses/${courseId}`, { method: 'DELETE' })
    if (res.ok) {
      toast.success('Course deleted')
      router.push('/dashboard/tutor/courses')
    } else {
      toast.error(res.error || 'Failed to delete')
    }
    setSaving(false)
  }

  async function handleDeleteLesson(lessonId: string) {
    if (!confirm('Delete this lesson? This cannot be undone.')) return
    const result = await apiFetch(`/api/lessons/${lessonId}`, { method: 'DELETE' })
    if (result.ok) {
      toast.success('Lesson deleted')
      void fetchCourse()
    } else {
      toast.error(result.error)
    }
  }

  if (!ready) return <FullPageSkeleton />

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
        <div className="space-y-3">
          {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
        </div>
      </div>
    )
  }

  if (!course) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-gray-500">Course not found.</p>
        <Link href="/dashboard/tutor/courses" className="mt-4 text-sm text-indigo-600 hover:underline">
          Back to courses
        </Link>
      </div>
    )
  }

  const readyLessons = course.curriculum.flatMap((s) => s.lessons).filter((l) => l.muxAssetStatus === 'READY').length
  const canPublish = course.totalLessons > 0 && readyLessons > 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <Link href="/dashboard/tutor/courses" className="mb-2 flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            My Courses
          </Link>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-bold text-gray-900 truncate">{course.title}</h1>
            <Badge variant={STATUS_BADGE[course.status] ?? 'outline'}>{course.status}</Badge>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            {course.totalLessons} lesson{course.totalLessons !== 1 ? 's' : ''} ·{' '}
            {course.totalEnrollments} enrolled ·{' '}
            {course.priceKobo === 0 ? 'Free' : formatNaira(course.priceKobo)}
            {course.totalDurationSeconds > 0 && ` · ${formatDuration(course.totalDurationSeconds)}`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {course.status === 'DRAFT' && (
            <button onClick={() => handleStatusChange('PUBLISHED')} disabled={!canPublish || saving}
              className="flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold text-white hover:bg-green-500 disabled:opacity-50 transition-colors">
              <Globe className="h-4 w-4" /> Publish
            </button>
          )}
          {course.status === 'PUBLISHED' && (
            <button onClick={() => handleStatusChange('DRAFT')} disabled={saving}
              className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
              Unpublish
            </button>
          )}
        </div>
      </div>

      {/* Danger Zone */}
      <div className="rounded-xl border border-red-200 bg-red-50 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-red-800">Danger Zone</p>
            <p className="text-xs text-red-600 mt-0.5">Delete this course and all its content permanently.</p>
          </div>
          <button onClick={handleDeleteCourse} disabled={saving}
            className="flex items-center gap-1.5 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-100 disabled:opacity-50 transition-colors shrink-0">
            <Trash2 className="h-4 w-4" /> Delete Course
          </button>
        </div>
      </div>

      {/* Curriculum */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Curriculum</h2>
          <button onClick={() => setShowAddSection(true)}
            className="flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-500">
            <PlusCircle className="h-4 w-4" /> Add Section
          </button>
        </div>

        <div className="space-y-3">
          {course.curriculum.map((section) => {
            const isExpanded = expandedSections.has(section.id)
            return (
              <div key={section.id} className="overflow-hidden rounded-xl border border-gray-200 bg-white">
                <div className="flex w-full items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors">
                  <button type="button" onClick={() => setExpandedSections((prev) => {
                    const next = new Set(prev)
                    if (next.has(section.id)) next.delete(section.id)
                    else next.add(section.id)
                    return next
                  })} className="flex flex-1 items-center gap-3 text-left">
                    {isExpanded ? <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" /> : <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />}
                    <span className="flex-1 text-sm font-semibold text-gray-900">{section.title}</span>
                    <span className="text-xs text-gray-400">{section.lessons.length} lesson{section.lessons.length !== 1 ? 's' : ''}</span>
                  </button>
                  <button onClick={() => handleDeleteSection(section.id)} disabled={saving}
                    className="flex items-center gap-1 rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors shrink-0">
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </button>
                </div>

                {isExpanded && (
                  <div className="border-t border-gray-100">
                    {section.lessons.length === 0 ? (
                      <p className="px-10 py-3 text-xs text-gray-400">No lessons yet. Add one below.</p>
                    ) : (
                      <ul className="divide-y divide-gray-100">
                        {section.lessons.map((lesson) => (
                          <li key={lesson.id} className="flex items-center gap-3 px-10 py-3">
                            <MuxStatusIcon status={lesson.muxAssetStatus} />
                            <Video className="h-4 w-4 text-gray-400 shrink-0" />
                            <span className="flex-1 text-sm text-gray-700">{lesson.title}</span>
                            {lesson.attachmentR2Key && <FileText className="h-3.5 w-3.5 text-blue-500 shrink-0" />}
                            {lesson.isFreePreview && (
                              <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">Free preview</span>
                            )}
                            {lesson.durationSeconds > 0 && (
                              <span className="text-xs text-gray-400">{formatDuration(lesson.durationSeconds)}</span>
                            )}
                            <button onClick={() => handleUploadVideo(lesson.id)} disabled={uploadingId === lesson.id}
                              className="flex items-center gap-1 rounded-md border border-purple-200 px-2 py-1 text-xs font-medium text-purple-600 hover:bg-purple-50 transition-colors shrink-0"
                              title="Upload video">
                              <Upload className="h-3.5 w-3.5" /> Video
                            </button>
                            <button onClick={() => handleUploadAttachment(lesson.id)} disabled={uploadingId === lesson.id}
                              className="flex items-center gap-1 rounded-md border border-blue-200 px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 transition-colors shrink-0"
                              title="Upload PDF/slides">
                              <FileText className="h-3.5 w-3.5" /> PDF
                            </button>
                            <button onClick={() => handleDeleteLesson(lesson.id)}
                              className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}

                    {addingLesson === section.id ? (
                      <div className="border-t border-gray-100 px-10 py-3">
                        <div className="flex items-center gap-2">
                          <input type="text" value={newLessonTitle} onChange={(e) => setNewLessonTitle(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') void handleAddLesson(section.id) }}
                            placeholder="Lesson title…" autoFocus
                            className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                          <button onClick={() => void handleAddLesson(section.id)} disabled={saving || !newLessonTitle.trim()}
                            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50">
                            {saving ? '…' : 'Add'}
                          </button>
                          <button onClick={() => { setAddingLesson(null); setNewLessonTitle('') }}
                            className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div className="border-t border-gray-100 px-10 py-2">
                        <button onClick={() => { setAddingLesson(section.id); setNewLessonTitle('') }}
                          className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-500">
                          <PlusCircle className="h-3.5 w-3.5" /> Add Lesson
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}

          {showAddSection && (
            <form onSubmit={handleAddSection} className="rounded-xl border border-indigo-200 bg-indigo-50 p-4">
              <p className="mb-2 text-sm font-semibold text-indigo-800">New Section</p>
              <div className="flex gap-2">
                <input type="text" value={addingSectionTitle} onChange={(e) => setAddingSectionTitle(e.target.value)}
                  placeholder="Section title…" autoFocus
                  className="flex-1 rounded-lg border border-indigo-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                <button type="submit" disabled={saving || !addingSectionTitle.trim()}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50">
                  {saving ? '…' : 'Add'}
                </button>
                <button type="button" onClick={() => { setShowAddSection(false); setAddingSectionTitle('') }}
                  className="text-sm text-gray-500 hover:text-gray-700">Cancel</button>
              </div>
            </form>
          )}

          {course.curriculum.length === 0 && !showAddSection && (
            <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 py-12 text-center">
              <FileText className="mb-3 h-10 w-10 text-gray-300" />
              <p className="text-sm font-medium text-gray-700">No sections yet</p>
              <p className="mt-1 text-xs text-gray-400">Add a section to start building your curriculum</p>
              <button onClick={() => setShowAddSection(true)}
                className="mt-4 flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-500">
                <PlusCircle className="h-4 w-4" /> Add First Section
              </button>
            </div>
          )}
        </div>
      </div>

      {course.totalLessons > 0 && readyLessons < course.totalLessons && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm text-amber-800">
            <span className="font-semibold">⏳ {course.totalLessons - readyLessons} video{course.totalLessons - readyLessons !== 1 ? 's' : ''} processing.</span>{' '}
            Mux is transcoding your uploads. This usually takes 1–5 minutes. Refresh to check status.
          </p>
        </div>
      )}
    </div>
  )
}