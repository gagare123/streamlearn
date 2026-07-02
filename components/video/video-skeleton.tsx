import { Skeleton } from '@/components/ui/skeleton'

// ── Full lesson page skeleton ──────────────────────────────────────────────

export function LessonPageSkeleton() {
  return (
    <div className="flex gap-6" aria-hidden="true" aria-label="Loading lesson">
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        {/* Player */}
        <Skeleton className="aspect-video w-full rounded-xl" />
        {/* Title */}
        <Skeleton className="h-7 w-72 rounded-md" />
        {/* Description */}
        <div className="space-y-2">
          <Skeleton className="h-4 w-full rounded" />
          <Skeleton className="h-4 w-5/6 rounded" />
          <Skeleton className="h-4 w-3/4 rounded" />
        </div>
        {/* Nav buttons */}
        <div className="flex justify-between border-t border-gray-100 pt-4">
          <Skeleton className="h-9 w-28 rounded-lg" />
          <Skeleton className="h-9 w-32 rounded-lg" />
        </div>
      </div>
      {/* Sidebar */}
      <div className="hidden w-80 shrink-0 flex-col gap-0 rounded-xl border border-gray-200 bg-white lg:flex">
        <div className="border-b border-gray-100 p-4 space-y-2">
          <Skeleton className="h-4 w-32 rounded" />
          <Skeleton className="h-2 w-full rounded-full" />
        </div>
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="mx-4 my-2 h-9 rounded-md" />
        ))}
      </div>
    </div>
  )
}

// ── Player-only skeleton (used while video metadata loads) ─────────────────

export function PlayerSkeleton() {
  return (
    <Skeleton
      className="aspect-video w-full rounded-xl"
      aria-label="Video loading"
    />
  )
}