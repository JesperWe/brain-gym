'use client'

import { useEffect } from 'react'

interface DeniedToastProps {
  name: string
  avatar: string
  onDismiss: () => void
}

export function DeniedToast({ name, avatar, onDismiss }: DeniedToastProps) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 2000)
    return () => clearTimeout(timer)
  }, [onDismiss])

  return (
    <div className="denied-toast">
      <span className="text-xl">{avatar}</span>
      <span className="text-sm font-semibold text-white">{name} turned down your challenge</span>
    </div>
  )
}
