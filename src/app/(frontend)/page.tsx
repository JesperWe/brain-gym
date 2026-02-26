'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Pencil } from 'lucide-react'
import { Icon } from '@iconify/react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'

const AVATARS = ['🦊', '🐱', '🐶', '🐸', '🦁', '🐼', '🐨', '🐯', '🦄', '🐙', '🐝', '🦋']

interface PlayerInfo {
  name: string
  avatar: string
}

function loadPlayer(): PlayerInfo | null {
  try {
    const raw = localStorage.getItem('mathsPlayer')
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed.name && parsed.avatar) return parsed
  } catch {}
  return null
}

function savePlayer(info: PlayerInfo) {
  localStorage.setItem('mathsPlayer', JSON.stringify(info))
}

export default function HomePage() {
  const [player, setPlayer] = useState<PlayerInfo | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [draftName, setDraftName] = useState('')
  const [draftAvatar, setDraftAvatar] = useState(AVATARS[0])
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const saved = loadPlayer()
    setPlayer(saved)
    if (!saved) {
      setDialogOpen(true)
    }
    setMounted(true)
  }, [])

  function openEdit() {
    setDraftName(player?.name ?? '')
    setDraftAvatar(player?.avatar ?? AVATARS[0])
    setDialogOpen(true)
  }

  function handleSave() {
    const trimmed = draftName.trim()
    if (!trimmed) return
    const info: PlayerInfo = { name: trimmed, avatar: draftAvatar }
    savePlayer(info)
    setPlayer(info)
    setDialogOpen(false)
  }

  if (!mounted) return null

  return (
    <div
      className="flex min-h-svh flex-col items-center justify-center gap-8 p-6"
      style={{
        fontFamily: 'var(--font-glitch)',
        background: 'linear-gradient(135deg, var(--color-glitch-bg-dark), var(--color-glitch-bg-mid), var(--color-glitch-bg-dark))',
        color: 'var(--color-glitch-text)',
      }}
    >
      <div className="flex flex-col items-center gap-3 text-center">
        <Icon icon="noto:thinking-face" width="64" height="64" />
        <h1 className="text-4xl font-bold tracking-tight text-white">Maths Glitch</h1>
        <p className="max-w-md text-glitch-muted">
          Test your mental maths with timed multiplication and division
          challenges. How fast can you go?
        </p>
      </div>

      {player && (
        <button
          onClick={openEdit}
          className="group flex items-center gap-3 rounded-2xl bg-glass-8 backdrop-blur-sm border border-glass-10 px-5 py-3 transition-all hover:bg-glass-12"
        >
          <span className="text-3xl">{player.avatar}</span>
          <span className="text-lg font-semibold text-white">{player.name}</span>
          <Pencil className="size-4 text-glitch-muted opacity-0 transition-opacity group-hover:opacity-100" />
        </button>
      )}

      <button
        className="block px-8 py-4 border-none rounded-xl bg-linear-to-br from-glitch-accent-bold to-glitch-accent-purple text-white text-xl font-bold cursor-pointer transition-all hover:translate-y-[-2px] hover:shadow-[0_6px_20px_rgba(99,102,241,0.4)] disabled:opacity-40 disabled:cursor-not-allowed"
        disabled={!player}
        onClick={() => { if (player) window.location.href = '/glitch' }}
      >
        Glitch or Bonus
      </button>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open && player) setDialogOpen(false)
        }}
      >
        <DialogContent
          className="sm:max-w-md border-glass-15 bg-glitch-bg-dark text-glitch-text"
          onInteractOutside={(e) => { if (!player) e.preventDefault() }}
        >
          <DialogHeader>
            <DialogTitle className="text-white">{player ? 'Edit Profile' : 'Welcome!'}</DialogTitle>
            <DialogDescription className="text-glitch-muted">
              {player
                ? 'Change your name or pick a different avatar.'
                : 'Choose a name and avatar to get started.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <label htmlFor="player-name" className="text-sm font-semibold uppercase tracking-widest text-glitch-label">
                Name
              </label>
              <Input
                id="player-name"
                placeholder="Enter your name..."
                maxLength={20}
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSave() }}
                autoFocus
                className="border-glass-15 bg-glass-6 text-white placeholder:text-glitch-placeholder focus-visible:ring-glitch-accent"
              />
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-semibold uppercase tracking-widest text-glitch-label">Avatar</label>
              <div className="grid grid-cols-6 gap-2">
                {AVATARS.map((a) => (
                  <button
                    key={a}
                    type="button"
                    className={`rounded-xl border-2 p-2 text-2xl transition-all cursor-pointer ${
                      a === draftAvatar
                        ? 'border-glitch-accent bg-glitch-accent/20 scale-110'
                        : 'border-transparent bg-glass-5 hover:bg-glass-12 hover:scale-110'
                    }`}
                    onClick={() => setDraftAvatar(a)}
                  >
                    {a}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <button
              className="px-6 py-2.5 border-none rounded-xl bg-linear-to-br from-glitch-accent-bold to-glitch-accent-purple text-white text-base font-bold cursor-pointer transition-all hover:translate-y-[-1px] hover:shadow-[0_4px_16px_rgba(99,102,241,0.4)] disabled:opacity-40 disabled:cursor-not-allowed"
              onClick={handleSave}
              disabled={!draftName.trim()}
            >
              Save
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
