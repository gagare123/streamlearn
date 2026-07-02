import { cn } from '@/lib/utils'

// Skeleton loader — always prefer over spinners on 3G.
// Gives users visual feedback about the shape of incoming content.

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('skeleton', className)}
      aria-hidden="true"
      {...props}
    />
  )
}

// ── Preset skeletons ──────────────────────────────────────────────────────────

function SkeletonText({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          key={i}
          className={cn('h-4', i === lines - 1 && lines > 1 ? 'w-3/4' : 'w-full')}
        />
      ))}
    </div>
  )
}

function SkeletonCard() {
  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <Skeleton className="h-40 w-full rounded-md" />
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-3 w-1/2" />
      <div className="flex items-center gap-2 pt-1">
        <Skeleton className="h-6 w-6 rounded-full" />
        <Skeleton className="h-3 w-24" />
      </div>
    </div>
  )
}

function SkeletonAvatar({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizeClass = { sm: 'h-8 w-8', md: 'h-10 w-10', lg: 'h-14 w-14' }[size]
  return <Skeleton className={cn('rounded-full', sizeClass)} />
}

export { Skeleton, SkeletonText, SkeletonCard, SkeletonAvatar }