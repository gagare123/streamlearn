'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthGuard } from '@/hooks/use-auth-guard'
import { FullPageSkeleton } from '@/components/auth/full-page-skeleton'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { toast } from 'sonner'
import { nairaToKobo } from '@/lib/utils'
import { ArrowLeft, BookOpen } from 'lucide-react'
import Link from 'next/link'

type FieldErrors = Partial<Record<string, string[]>>

export default function NewCoursePage() {
  const { ready } = useAuthGuard({ roles: ['TUTOR', 'ADMIN'] })
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')

  if (!ready) return <FullPageSkeleton />

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setFieldErrors({})

    const form = new FormData(e.currentTarget)
    const priceNaira = parseFloat(form.get('priceNaira') as string || '0')

    try {
      const res = await fetch('/api/courses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          title: form.get('title'),
          description: form.get('description') || undefined,
          priceKobo: nairaToKobo(priceNaira),
          level: form.get('level'),
          tags,
        }),
      })

      const data = await res.json() as {
        success: boolean
        error?: string
        fields?: FieldErrors
        data?: { course: { id: string } }
      }

      if (!res.ok || !data.success) {
        if (data.fields) setFieldErrors(data.fields)
        else toast.error(data.error ?? 'Failed to create course')
        return
      }

      toast.success('Course created! Now add sections and lessons.')
      router.push(`/dashboard/tutor/courses/${data.data!.course.id}`)
    } catch {
      toast.error('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  function addTag() {
    const t = tagInput.trim().toLowerCase()
    if (t && !tags.includes(t) && tags.length < 10) {
      setTags([...tags, t])
      setTagInput('')
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/dashboard/tutor/courses"
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          My Courses
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Create New Course</h1>
        <p className="mt-1 text-sm text-gray-500">
          Fill in the details below. You can add lessons after creation.
        </p>
      </div>

      <form onSubmit={handleSubmit} noValidate>
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Main fields */}
          <div className="space-y-5 lg:col-span-2">
            <Card className="border border-gray-200 shadow-none">
              <CardHeader>
                <CardTitle className="text-base">Course Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Title */}
                <div>
                  <label htmlFor="title" className="mb-1.5 block text-sm font-medium text-gray-700">
                    Title <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="title"
                    name="title"
                    type="text"
                    required
                    disabled={loading}
                    placeholder="e.g. Introduction to Data Science with Python"
                    className={inputCls(!!fieldErrors['title']?.length)}
                  />
                  {fieldErrors['title']?.map((e) => (
                    <p key={e} className="mt-1 text-xs text-red-600">{e}</p>
                  ))}
                </div>

                {/* Description */}
                <div>
                  <label htmlFor="description" className="mb-1.5 block text-sm font-medium text-gray-700">
                    Description
                  </label>
                  <textarea
                    id="description"
                    name="description"
                    rows={5}
                    disabled={loading}
                    placeholder="Describe what students will learn, who it's for, and what topics are covered…"
                    className="w-full resize-y rounded-lg border border-gray-300 px-3 py-2 text-sm placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60"
                  />
                </div>

                {/* Tags */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">
                    Tags <span className="text-gray-400 font-normal">(up to 10)</span>
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }}
                      placeholder="Type a tag and press Enter"
                      className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      disabled={loading || tags.length >= 10}
                    />
                    <button
                      type="button"
                      onClick={addTag}
                      disabled={loading || tags.length >= 10 || !tagInput.trim()}
                      className="rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
                    >
                      Add
                    </button>
                  </div>
                  {tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {tags.map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-medium text-indigo-700"
                        >
                          {tag}
                          <button
                            type="button"
                            onClick={() => setTags(tags.filter((t) => t !== tag))}
                            className="text-indigo-500 hover:text-indigo-800"
                            aria-label={`Remove tag ${tag}`}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar settings */}
          <div className="space-y-5">
            <Card className="border border-gray-200 shadow-none">
              <CardHeader>
                <CardTitle className="text-base">Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Level */}
                <div>
                  <label htmlFor="level" className="mb-1.5 block text-sm font-medium text-gray-700">
                    Difficulty Level
                  </label>
                  <select
                    id="level"
                    name="level"
                    disabled={loading}
                    defaultValue="BEGINNER"
                    className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm focus:border-indigo-500 focus:outline-none disabled:opacity-60"
                  >
                    <option value="BEGINNER">Beginner</option>
                    <option value="INTERMEDIATE">Intermediate</option>
                    <option value="ADVANCED">Advanced</option>
                  </select>
                </div>

                {/* Price */}
                <div>
                  <label htmlFor="priceNaira" className="mb-1.5 block text-sm font-medium text-gray-700">
                    Price (₦)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">₦</span>
                    <input
                      id="priceNaira"
                      name="priceNaira"
                      type="number"
                      min="0"
                      step="100"
                      defaultValue="0"
                      disabled={loading}
                      className="h-10 w-full rounded-lg border border-gray-300 pl-7 pr-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60"
                    />
                  </div>
                  <p className="mt-1 text-xs text-gray-400">Set to 0 for a free course</p>
                </div>
              </CardContent>
            </Card>

            {/* Info */}
            <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-4">
              <div className="flex items-start gap-3">
                <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" aria-hidden="true" />
                <div>
                  <p className="text-sm font-semibold text-indigo-800">What happens next?</p>
                  <p className="mt-1 text-xs text-indigo-700 leading-relaxed">
                    After creating the course, you'll add sections and upload video lessons. A course needs at least 1 lesson before it can be published.
                  </p>
                </div>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60 transition-colors"
            >
              {loading ? (
                <>
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Creating…
                </>
              ) : 'Create Course'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}

function inputCls(err: boolean) {
  return [
    'flex h-10 w-full rounded-lg border bg-white px-3 py-2 text-sm placeholder:text-gray-400',
    'focus:outline-none focus:ring-2 focus:ring-indigo-500',
    'disabled:opacity-60',
    err ? 'border-red-400' : 'border-gray-300',
  ].join(' ')
}