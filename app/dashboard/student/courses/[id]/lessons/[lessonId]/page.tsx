'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuthGuard } from '@/hooks/use-auth-guard'
import { useApiFetch } from '@/hooks/use-fetch'
import { FullPageSkeleton } from '@/components/auth/full-page-skeleton'
import { StreamLearnPlayer } from '@/components/video/mux-player'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { formatDuration } from '@/lib/utils'
import {
  ChevronLeft, ChevronRight, CheckCircle,
   PlayCircle, FileText, ArrowLeft,
} from 'lucide-react'

type LessonDetail = {
  id: string
  title: string
  description: string | null
  muxPlaybackId: string | null
  muxAssetStatus: string
  durationSeconds: number
  isFreePreview: boolean
  attachmentR2Key: string | null
}

type SectionWithLessons = {
  id: string
  title: string
  lessons: Array<{
    id: string
    title: string
    durationSeconds: number
    muxAssetStatus: string
    progress?: { watchedSeconds: number; isCompleted: boolean }
  }>
}

type EnrollmentDetail = {
  id: string
  progress: { completedLessons: number; totalLessons: number; percentComplete: number }
  curriculum: SectionWithLessons[]
}

export default function LessonViewerPage() {
  const { ready } = useAuthGuard({ roles: ['STUDENT'] })
  const { apiFetch } = useApiFetch()
  const params = useParams()
  const router = useRouter()

  const courseId  = params['id'] as string
  const lessonId  = params['lessonId'] as string

  const [lesson, setLesson] = useState<LessonDetail | null>(null)
  const [enrollment, setEnrollment] = useState<EnrollmentDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [localCompleted, setLocalCompleted] = useState(false)

  

  const fetchData = useCallback(async () => {
    const [lessonResult, enrollmentsResult] = await Promise.all([
      apiFetch<{ lesson: LessonDetail }>(`/api/lessons/${lessonId}`),
      apiFetch<{ enrollments: Array<{ id: string; course: { id: string }; status: string; progress: EnrollmentDetail['progress'] }> }>(
        '/api/enrollments',
      ),
    ])

    if (lessonResult.ok) setLesson(lessonResult.data.lesson)
    else { toast.error('Lesson not found'); router.push(`/dashboard/student/courses/${courseId}`); return }

    if (enrollmentsResult.ok) {
      const found = enrollmentsResult.data.enrollments.find((e) => e.course.id === courseId)
      if (found) {
        const detail = await apiFetch<{ enrollment: EnrollmentDetail }>(`/api/enrollments/${found.id}`)
        if (detail.ok) {
          setEnrollment(detail.data.enrollment)
          const lessonProgress = detail.data.enrollment.curriculum
            .flatMap((s) => s.lessons)
            .find((l) => l.id === lessonId)
          if (lessonProgress?.progress?.isCompleted) setLocalCompleted(true)
        }
      }
    }

    setLoading(false)
  }, [apiFetch, courseId, lessonId, router])

  useEffect(() => {
    if (ready) void fetchData()
  }, [ready, fetchData])

  const allLessons = enrollment?.curriculum.flatMap((s) => s.lessons) ?? []
  const currentIndex = allLessons.findIndex((l) => l.id === lessonId)
  const prevLesson = currentIndex > 0 ? allLessons[currentIndex - 1] : null
  const nextLesson = currentIndex < allLessons.length - 1 ? allLessons[currentIndex + 1] : null

  function handleProgress(watchedSeconds: number, isCompleted: boolean) {
    if (isCompleted && !localCompleted) {
      setLocalCompleted(true)
      toast.success('Lesson complete! 🎉')
    }
  }

  if (!ready) return <FullPageSkeleton />

  if (loading) {
    return (
      <div className="flex h-full gap-6">
        <div className="flex-1 space-y-4">
          <Skeleton className="aspect-video w-full rounded-xl" />
          <Skeleton className="h-7 w-80" />
          <Skeleton className="h-4 w-full max-w-2xl" />
        </div>
      </div>
    )
  }

  if (!lesson?.muxPlaybackId) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-50">
          <PlayCircle className="h-7 w-7 text-amber-400" aria-hidden="true" />
        </div>
        <h2 className="text-base font-semibold text-gray-900">Video processing…</h2>
        <p className="mt-1 text-sm text-gray-500">
          {lesson?.muxAssetStatus === 'ERRORED'
            ? 'This video encountered a processing error. Please contact the tutor.'
            : 'Mux is transcoding this video. Check back in a few minutes.'
          }
        </p>
        <Link href={`/dashboard/student/courses/${courseId}`} className="mt-5 text-sm text-indigo-600 hover:underline">
          Back to course
        </Link>
      </div>
    )
  }

  const savedProgress = enrollment?.curriculum
    .flatMap((s) => s.lessons)
    .find((l) => l.id === lessonId)
    ?.progress

  return (
    <div className="flex h-full min-h-0 gap-0 lg:gap-6">
      {/* Main content */}
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <div className="flex items-center gap-3">
          <Link href={`/dashboard/student/courses/${courseId}`} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Course
          </Link>
        </div>

        <div className="relative overflow-hidden rounded-xl bg-black shadow-lg">
          <StreamLearnPlayer
            playbackId={lesson.muxPlaybackId}
            lessonId={lessonId}
            resumeAt={savedProgress?.watchedSeconds ?? 0}
            onProgress={handleProgress}
          />
        </div>

        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h1 className="text-xl font-bold text-gray-900">{lesson.title}</h1>
              {(localCompleted || savedProgress?.isCompleted) && (
                <Badge variant="success" className="gap-1 text-xs">
                  <CheckCircle className="h-3 w-3" aria-hidden="true" />
                  Completed
                </Badge>
              )}
            </div>
            {lesson.durationSeconds > 0 && (
              <p className="text-sm text-gray-500">{formatDuration(lesson.durationSeconds)}</p>
            )}
          </div>
        </div>

              {/* PDF download button */}
      {lesson.attachmentR2Key && (
        <div className="flex flex-wrap items-center gap-3 border-t border-gray-100 pt-4">
          <a
            href={`/api/lessons/${lessonId}/attachment`}
            download
            className="inline-flex items-center gap-2 rounded-lg border-2 border-blue-300 bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-700 hover:bg-blue-100 transition-colors"
          >
            <FileText className="h-4 w-4" aria-hidden="true" />
            Download PDF Materials
          </a>
        </div>
      )}
              {/* Prev / Next */}
        <div className="flex items-center justify-between border-t border-gray-100 pt-4">
          {prevLesson ? (
            <Link href={`/dashboard/student/courses/${courseId}/lessons/${prevLesson.id}`}
              className="flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
              <ChevronLeft className="h-4 w-4" /> Previous
            </Link>
          ) : <div />}
          {nextLesson ? (
            <Link href={`/dashboard/student/courses/${courseId}/lessons/${nextLesson.id}`}
              className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors">
              Next lesson <ChevronRight className="h-4 w-4" />
            </Link>
          ) : (
            <Link href={`/dashboard/student/courses/${courseId}`}
              className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-500 transition-colors">
              <CheckCircle className="h-4 w-4" /> Finish course
            </Link>
          )}
        </div>
      </div>

      {/* Sidebar */}
      {enrollment && (
        <aside className="hidden flex-col lg:flex w-80 shrink-0 overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="border-b border-gray-100 p-4">
            <p className="text-sm font-semibold text-gray-900 mb-1.5">Course Progress</p>
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>{enrollment.progress.completedLessons}/{enrollment.progress.totalLessons} lessons</span>
              <span className="font-medium text-indigo-600">{enrollment.progress.percentComplete}%</span>
            </div>
            <Progress value={enrollment.progress.percentComplete} className="h-1.5" />
          </div>
          <div className="flex-1 overflow-y-auto">
            {enrollment.curriculum.map((section) => (
              <div key={section.id}>
                <p className="sticky top-0 bg-gray-50 px-4 py-2 text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100">
                  {section.title}
                </p>
                <ul className="divide-y divide-gray-100">
                  {section.lessons.map((l) => {
                    const isActive = l.id === lessonId
                    const isDone = (l.id === lessonId ? localCompleted : false) || l.progress?.isCompleted
                    return (
                      <li key={l.id}>
                        <Link href={`/dashboard/student/courses/${courseId}/lessons/${l.id}`}
                          className={[
                            'flex items-center gap-3 px-4 py-3 text-sm transition-colors',
                            isActive ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-600 hover:bg-gray-50',
                          ].join(' ')}>
                          <div className="shrink-0">
                            {isDone ? <CheckCircle className="h-4 w-4 text-green-500" /> : <PlayCircle className={`h-4 w-4 ${isActive ? 'text-indigo-500' : 'text-gray-300'}`} />}
                          </div>
                          <span className="flex-1 line-clamp-2 leading-snug">{l.title}</span>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </div>
        </aside>
      )}
    </div>
  )
}
