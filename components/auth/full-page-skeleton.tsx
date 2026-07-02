import { Skeleton } from '@/components/ui/skeleton'

/**
 * Full-page skeleton shown while auth state is loading.
 * Used in all guarded dashboard pages instead of a spinner.
 */
export function FullPageSkeleton() {
  return (
    <div className="flex min-h-screen flex-col" aria-hidden="true" aria-label="Loading">
      {/* Fake header */}
      <div className="flex h-14 items-center justify-between border-b bg-white px-6">
        <Skeleton className="h-6 w-32 rounded-md" />
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded-full" />
          <Skeleton className="hidden h-4 w-28 rounded sm:block" />
        </div>
      </div>

      <div className="flex flex-1">
        {/* Fake sidebar */}
        <div className="hidden w-60 flex-col gap-2 border-r bg-white p-4 lg:flex">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-9 w-full rounded-md" />
          ))}
        </div>

        {/* Fake main content */}
        <main className="flex-1 p-6 lg:p-8">
          {/* Page title */}
          <Skeleton className="mb-6 h-7 w-48 rounded-md" />

          {/* Stats row */}
          <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="rounded-lg border bg-white p-4">
                <Skeleton className="mb-2 h-4 w-20 rounded" />
                <Skeleton className="h-7 w-16 rounded" />
              </div>
            ))}
          </div>

          {/* Content cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="rounded-lg border bg-white p-4">
                <Skeleton className="mb-3 h-36 w-full rounded-md" />
                <Skeleton className="mb-2 h-4 w-3/4 rounded" />
                <Skeleton className="h-3 w-1/2 rounded" />
              </div>
            ))}
          </div>
        </main>
      </div>
    </div>
  )
}