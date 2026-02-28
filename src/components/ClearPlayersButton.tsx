'use client'

import { useState } from 'react'
import { PopupList } from '@payloadcms/ui'

export function ClearPlayersButton() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'done'>('idle')
  const [message, setMessage] = useState('')

  async function handleClick() {
    if (!confirm('Clear all current Ably players?')) return

    setStatus('loading')
    try {
      const res = await fetch('/api/clear-players', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setMessage(data.error || 'Failed')
        setStatus('idle')
        return
      }
      setMessage(`Cleared ${data.cleared} player${data.cleared === 1 ? '' : 's'}`)
      setStatus('done')
      setTimeout(() => {
        setStatus('idle')
        setMessage('')
      }, 3000)
    } catch {
      setMessage('Request failed')
      setStatus('idle')
    }
  }

  return (
    <PopupList.ButtonGroup>
      <PopupList.Button onClick={handleClick} disabled={status === 'loading'}>
        {status === 'loading' ? 'Clearing...' : status === 'done' ? message : 'Clear Ably Players'}
      </PopupList.Button>
    </PopupList.ButtonGroup>
  )
}
