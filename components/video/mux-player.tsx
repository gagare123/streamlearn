'use client'

import { useEffect, useRef, useCallback } from 'react'
import MuxPlayer from '@mux/mux-player-react'
import type MuxPlayerElement from '@mux/mux-player'

type Props = {
  playbackId: string
  lessonId: string
  resumeAt?: number
  onProgress?: (watchedSeconds: number, isCompleted: boolean) => void
  className?: string
}

const PROGRESS_REPORT_INTERVAL_MS = 10_000
const COMPLETION_THRESHOLD = 0.9

export function StreamLearnPlayer({
  playbackId,
  lessonId,
  resumeAt = 0,
  onProgress,
  className,
}: Props) {
  const playerRef = useRef<MuxPlayerElement>(null)
  const reportTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastReportedRef = useRef<number>(0)
  const abortRef = useRef<AbortController | null>(null)

  const reportProgress = useCallback(
    async (watchedSeconds: number, isCompleted: boolean) => {
      if (Math.abs(watchedSeconds - lastReportedRef.current) < 2 && !isCompleted) return
      lastReportedRef.current = watchedSeconds

      if (abortRef.current) abortRef.current.abort()
      abortRef.current = new AbortController()

      try {
        await fetch('/api/progress', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          signal: abortRef.current.signal,
          body: JSON.stringify({ lessonId, watchedSeconds, isCompleted }),
        })
        onProgress?.(watchedSeconds, isCompleted)
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          console.warn('[player] Failed to report progress:', err.message)
        }
      }
    },
    [lessonId, onProgress],
  )

  function startReporter() {
    if (reportTimerRef.current) return
    reportTimerRef.current = setInterval(() => {
      const player = playerRef.current
      if (!player) return
      const current = player.currentTime ?? 0
      const duration = player.duration ?? 0
      const isCompleted = duration > 0 && current / duration >= COMPLETION_THRESHOLD
      void reportProgress(Math.floor(current), isCompleted)
    }, PROGRESS_REPORT_INTERVAL_MS)
  }

  function stopReporter() {
    if (reportTimerRef.current) {
      clearInterval(reportTimerRef.current)
      reportTimerRef.current = null
    }
  }

  function handlePlay() { startReporter() }

  function handlePause() {
    stopReporter()
    const player = playerRef.current
    if (!player) return
    const current = Math.floor(player.currentTime ?? 0)
    const duration = player.duration ?? 0
    const isCompleted = duration > 0 && current / duration >= COMPLETION_THRESHOLD
    void reportProgress(current, isCompleted)
  }

  function handleEnded() {
    stopReporter()
    const player = playerRef.current
    if (!player) return
    const duration = Math.floor(player.duration ?? 0)
    void reportProgress(duration, true)
  }

  function handleSeeked() {
    const player = playerRef.current
    if (!player) return
    const current = Math.floor(player.currentTime ?? 0)
    void reportProgress(current, false)
  }

  function handleLoadedMetadata() {
    const player = playerRef.current
    if (!player || resumeAt <= 0) return
    const duration = player.duration ?? 0
    if (duration > 0 && resumeAt < duration * 0.95) {
      player.currentTime = resumeAt
    }
  }

  useEffect(() => {
    return () => {
      stopReporter()
      if (abortRef.current) abortRef.current.abort()
    }
  }, [])

  return (
    <div className={className}>
      <MuxPlayer
        ref={playerRef as React.Ref<MuxPlayerElement>}
        playbackId={playbackId}
        autoPlay={false}
        preload="metadata"
        defaultHiddenCaptions={false}
        thumbnailTime={0}
        onPlay={handlePlay}
        onPause={handlePause}
        onEnded={handleEnded}
        onSeeked={handleSeeked}
        onLoadedMetadata={handleLoadedMetadata}
        style={{
          width: '100%',
          aspectRatio: '16/9',
          '--controls': 'auto',
          '--media-object-fit': 'contain',
          '--media-background-color': '#000000',
        }}
      />
    </div>
  )
}