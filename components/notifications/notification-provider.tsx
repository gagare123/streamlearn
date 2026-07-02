'use client'

import type { ReactNode } from 'react'

type Props = { children: ReactNode }

export function NotificationProvider({ children }: Props) {
  return <>{children}</>
}
