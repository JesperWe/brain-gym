'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil } from 'lucide-react'
import { Icon } from '@iconify/react'
import type * as Ably from 'ably'

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

import { getAblyClient, disconnectAbly } from '@/lib/multiplayer/ably-client'
import {
  enterPresence,
  subscribePresence,
  updatePresence,
} from '@/lib/multiplayer/presence'
import { getGameChannelName } from '@/lib/multiplayer/game-channel'
import { getHistoryChannel, getGameRecords, getLastGame } from '@/lib/multiplayer/game-history'
import type { PlayerPresenceData, GameInvite, GameInviteResponse } from '@/lib/multiplayer/types'

import { resumeAudio, playSound } from './glitch/sound'
import { PlayerCard } from './components/PlayerCard'
import { InviteDialog } from './components/InviteDialog'
import { DeniedToast } from './components/DeniedToast'

const AVATARS = ['🦊', '🐱', '🐶', '🐸', '🦁', '🐼', '🐨', '🐯', '🦄', '🐙', '🐝', '🦋']

const PLAYERS_CHANNEL = 'glitch-players'

interface PlayerInfo {
  name: string
  avatar: string
  playerId: string
}

function loadPlayer(): PlayerInfo | null {
  try {
    const raw = localStorage.getItem('mathsPlayer')
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed.name && parsed.avatar && parsed.playerId) return parsed
    // Migrate old player data without playerId
    if (parsed.name && parsed.avatar) {
      const migrated = { ...parsed, playerId: crypto.randomUUID() }
      localStorage.setItem('mathsPlayer', JSON.stringify(migrated))
      return migrated
    }
  } catch {}
  return null
}

function savePlayer(info: PlayerInfo) {
  localStorage.setItem('mathsPlayer', JSON.stringify(info))
}

export default function HomePage() {
  const router = useRouter()
  const [player, setPlayer] = useState<PlayerInfo | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [draftName, setDraftName] = useState('')
  const [draftAvatar, setDraftAvatar] = useState(AVATARS[0])
  const [mounted, setMounted] = useState(false)

  // Multiplayer state
  const [onlinePlayers, setOnlinePlayers] = useState<PlayerPresenceData[]>([])
  const [challengeTarget, setChallengeTarget] = useState<PlayerPresenceData | null>(null)
  const [challengeDuration, setChallengeDuration] = useState(1)
  const [waitingFor, setWaitingFor] = useState<string | null>(null)
  const [incomingInvite, setIncomingInvite] = useState<GameInvite | null>(null)
  const [deniedBy, setDeniedBy] = useState<{ name: string; avatar: string } | null>(null)

  const ablyChannelRef = useRef<Ably.RealtimeChannel | null>(null)
  const playerRef = useRef<PlayerInfo | null>(null)
  const challengeDurationRef = useRef(1)
  const knownPlayerIdsRef = useRef<Set<string>>(new Set())

  // Keep refs in sync
  useEffect(() => {
    playerRef.current = player
  }, [player])
  useEffect(() => {
    challengeDurationRef.current = challengeDuration
  }, [challengeDuration])

  // Load player on mount
  useEffect(() => {
    const saved = loadPlayer()
    setPlayer(saved)
    if (!saved) {
      setDialogOpen(true)
    }
    setMounted(true)
  }, [])

  // Reset stale state when page is restored from bfcache (e.g. browser back button)
  useEffect(() => {
    function handlePageShow(e: PageTransitionEvent) {
      if (e.persisted) {
        setWaitingFor(null)
        setChallengeTarget(null)
        setIncomingInvite(null)
      }
    }
    window.addEventListener('pageshow', handlePageShow)
    return () => window.removeEventListener('pageshow', handlePageShow)
  }, [])

  // Connect to Ably when player is set
  useEffect(() => {
    if (!player) return

    let unsubPresence: (() => void) | null = null
    let channel: Ably.RealtimeChannel | null = null

    try {
      const client = getAblyClient(player.playerId)
      channel = client.channels.get(PLAYERS_CHANNEL)
      ablyChannelRef.current = channel

      // Enter presence first with no lastGame, then update once LiveMap loads
      const presenceData: PlayerPresenceData = {
        playerId: player.playerId,
        name: player.name,
        avatar: player.avatar,
        currentGame: null,
        currentOpponent: null,
        currentScore: 0,
        currentOpponentScore: 0,
        lastGame: null,
      }

      enterPresence(channel, presenceData)

      // Load last game from LiveMap and update presence
      const historyChannel = getHistoryChannel(client)
      getGameRecords(historyChannel, player.playerId).then((records) => {
        const lastGame = getLastGame(records)
        if (lastGame && ablyChannelRef.current) {
          updatePresence(ablyChannelRef.current, {
            ...presenceData,
            lastGame,
          }).catch(() => {})
        }
      }).catch(() => {})

      unsubPresence = subscribePresence(channel, (members) => {
        const players: PlayerPresenceData[] = members.map((m) => {
          const d = m.data as PlayerPresenceData
          // Ensure playerId is set — fall back to Ably clientId
          if (!d.playerId) d.playerId = m.clientId
          return d
        })

        // Play sound when a new player joins (not on initial load or self)
        const me = playerRef.current
        const known = knownPlayerIdsRef.current
        if (known.size > 0) {
          for (const p of players) {
            if (!known.has(p.playerId) && p.playerId !== me?.playerId) {
              playSound('playerJoined')
              break
            }
          }
        }
        knownPlayerIdsRef.current = new Set(players.map((p) => p.playerId))

        setOnlinePlayers(players)
      })

      // Subscribe to messages for invites
      channel.subscribe('game-event', (msg) => {
        const data = msg.data as (GameInvite | GameInviteResponse) & { toPlayerId?: string }
        const me = playerRef.current
        if (!me) return

        // Ignore messages not targeted at us, or sent by us
        if (data.toPlayerId !== me.playerId) return
        if (data.fromPlayerId === me.playerId) return

        if (data.type === 'invite') {
          setIncomingInvite(data as GameInvite)
        }

        if (data.type === 'invite-response') {
          const response = data as GameInviteResponse
          if (response.accepted) {
            const channelName = getGameChannelName(me.name, response.fromName)
            const duration = challengeDurationRef.current
            router.push(`/glitch?multiplayer=true&channel=${encodeURIComponent(channelName)}&duration=${duration}&role=host&opponentName=${encodeURIComponent(response.fromName)}&opponentAvatar=${encodeURIComponent(response.fromAvatar)}&opponentId=${encodeURIComponent(response.fromPlayerId)}`)
          } else {
            setWaitingFor(null)
            setDeniedBy({ name: response.fromName, avatar: response.fromAvatar })
          }
        }
      })
    } catch {
      // Ably not configured — continue without multiplayer
    }

    return () => {
      if (unsubPresence) unsubPresence()
      if (channel) {
        channel.unsubscribe('game-event')
        // Don't explicitly leave presence — Ably keeps it alive during
        // page transitions (same clientId reconnects seamlessly).
        // Presence is auto-removed when the connection truly dies (tab close).
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player?.playerId])

  // Update presence when player name/avatar changes
  useEffect(() => {
    if (!player || !ablyChannelRef.current) return

    const client = getAblyClient(player.playerId)
    const historyChannel = getHistoryChannel(client)
    getGameRecords(historyChannel, player.playerId).then((records) => {
      const lastGame = getLastGame(records)
      if (ablyChannelRef.current) {
        updatePresence(ablyChannelRef.current, {
          playerId: player.playerId,
          name: player.name,
          avatar: player.avatar,
          currentGame: null,
          currentOpponent: null,
          currentScore: 0,
          currentOpponentScore: 0,
          lastGame,
        }).catch(() => {})
      }
    }).catch(() => {})
  }, [player?.name, player?.avatar, player?.playerId])

  function openEdit() {
    setDraftName(player?.name ?? '')
    setDraftAvatar(player?.avatar ?? AVATARS[0])
    setDialogOpen(true)
  }

  function handleSave() {
    const trimmed = draftName.trim()
    if (!trimmed) return
    const playerId = player?.playerId ?? crypto.randomUUID()
    const info: PlayerInfo = { name: trimmed, avatar: draftAvatar, playerId }
    savePlayer(info)
    setPlayer(info)
    setDialogOpen(false)
  }

  function handleChallenge(target: PlayerPresenceData) {
    setChallengeTarget(target)
  }

  function sendChallenge() {
    if (!challengeTarget || !player || !ablyChannelRef.current) return

    const invite: GameInvite & { toPlayerId: string } = {
      type: 'invite',
      fromPlayerId: player.playerId,
      fromName: player.name,
      fromAvatar: player.avatar,
      duration: challengeDuration,
      toPlayerId: challengeTarget.playerId,
    }

    ablyChannelRef.current
      .publish('game-event', invite)
      .catch(() => {})
    setWaitingFor(challengeTarget.name)
    setChallengeTarget(null)
  }

  async function handleAcceptInvite() {
    if (!incomingInvite || !player || !ablyChannelRef.current) return

    const response: GameInviteResponse & { toPlayerId: string } = {
      type: 'invite-response',
      accepted: true,
      fromPlayerId: player.playerId,
      fromName: player.name,
      fromAvatar: player.avatar,
      toPlayerId: incomingInvite.fromPlayerId,
    }

    // Wait for publish to complete before navigating away
    await ablyChannelRef.current.publish('game-event', response)

    const channelName = getGameChannelName(incomingInvite.fromName, player.name)
    const duration = incomingInvite.duration
    const oppName = incomingInvite.fromName
    const oppAvatar = incomingInvite.fromAvatar
    const oppId = incomingInvite.fromPlayerId
    setIncomingInvite(null)
    router.push(`/glitch?multiplayer=true&channel=${encodeURIComponent(channelName)}&duration=${duration}&role=guest&opponentName=${encodeURIComponent(oppName)}&opponentAvatar=${encodeURIComponent(oppAvatar)}&opponentId=${encodeURIComponent(oppId)}`)
  }

  async function handleDenyInvite() {
    if (!incomingInvite || !player || !ablyChannelRef.current) return

    const response: GameInviteResponse & { toPlayerId: string } = {
      type: 'invite-response',
      accepted: false,
      fromPlayerId: player.playerId,
      fromName: player.name,
      fromAvatar: player.avatar,
      toPlayerId: incomingInvite.fromPlayerId,
    }

    await ablyChannelRef.current.publish('game-event', response)
    setIncomingInvite(null)
  }

  // Play challenge sound on loop while incoming invite is active
  useEffect(() => {
    if (!incomingInvite) return
    resumeAudio()
    playSound('challenge')
    const interval = setInterval(() => playSound('challenge'), 3000)
    return () => clearInterval(interval)
  }, [incomingInvite])

  const selfFirst = [...onlinePlayers].sort((a, b) => {
    if (a.playerId === player?.playerId) return -1
    if (b.playerId === player?.playerId) return 1
    return 0
  })

  if (!mounted) return null

  return (
    <div
      className="flex min-h-svh flex-col items-center justify-center gap-8 p-6"
      style={{
        fontFamily: 'var(--font-glitch)',
        background:
          'linear-gradient(135deg, var(--color-glitch-bg-dark), var(--color-glitch-bg-mid), var(--color-glitch-bg-dark))',
        color: 'var(--color-glitch-text)',
      }}
    >
      {/* Denied toast */}
      {deniedBy && (
        <DeniedToast
          name={deniedBy.name}
          avatar={deniedBy.avatar}
          onDismiss={() => setDeniedBy(null)}
        />
      )}

      <div className="flex flex-col items-center gap-3 text-center">
        <Icon icon="noto:thinking-face" width="64" height="64" />
        <h1 className="text-4xl font-bold tracking-tight text-white">Maths Glitch</h1>
        <p className="max-w-md text-glitch-muted">
          Test your mental maths with timed multiplication and division challenges. How fast can you
          go?
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

      {/* Waiting state */}
      {waitingFor && (
        <div className="flex items-center gap-3 px-6 py-3 bg-glass-8 rounded-2xl border border-glass-10 animate-pulse">
          <span className="text-glitch-label">Waiting for {waitingFor}...</span>
        </div>
      )}

      {/* Online Players */}
      {player && selfFirst.length > 0 && !waitingFor && (
        <div className="w-full max-w-md">
          <label className="block text-sm font-semibold uppercase tracking-widest text-glitch-label mb-3 text-center">
            Challenge a friend!
          </label>
          <div className="grid grid-cols-2 gap-2.5">
            {selfFirst.map((p) => {
              const isSelf = p.playerId === player.playerId
              return (
                <PlayerCard
                  key={p.playerId}
                  player={p}
                  isSelf={isSelf}
                  onClick={isSelf ? undefined : () => handleChallenge(p)}
                />
              )
            })}
          </div>
        </div>
      )}

      {!waitingFor && (
        <button
          className="block px-8 py-4 border-none rounded-xl bg-linear-to-br from-glitch-accent-bold to-glitch-accent-purple text-white text-xl font-bold cursor-pointer transition-all hover:translate-y-[-2px] hover:shadow-[0_6px_20px_rgba(99,102,241,0.4)] disabled:opacity-40 disabled:cursor-not-allowed"
          disabled={!player}
          onClick={() => {
            if (player) router.push('/glitch')
          }}
        >
          Glitch! (Single player)
        </button>
      )}

      {/* Challenge duration selector */}
      {challengeTarget && (
        <Dialog open={true} onOpenChange={() => setChallengeTarget(null)}>
          <DialogContent className="sm:max-w-sm border-glass-15 bg-glitch-bg-dark text-glitch-text">
            <DialogHeader>
              <DialogTitle className="text-white text-center">
                Challenge {challengeTarget.avatar} {challengeTarget.name}
              </DialogTitle>
              <DialogDescription className="text-glitch-muted text-center">
                Choose game length
              </DialogDescription>
            </DialogHeader>

            <div className="flex gap-2 py-2">
              {[1, 2, 3, 4, 5].map((d) => (
                <button
                  key={d}
                  className={`flex-1 py-2.5 border-2 rounded-xl text-base font-semibold cursor-pointer transition-all ${
                    d === challengeDuration
                      ? 'border-glitch-accent bg-glitch-accent/25 text-white'
                      : 'border-glass-15 bg-glass-5 text-glitch-text hover:bg-glass-12'
                  }`}
                  onClick={() => setChallengeDuration(d)}
                >
                  {d}m
                </button>
              ))}
            </div>

            <DialogFooter>
              <button
                className="w-full px-6 py-2.5 border-none rounded-xl bg-linear-to-br from-glitch-accent-bold to-glitch-accent-purple text-white text-base font-bold cursor-pointer transition-all hover:translate-y-[-1px] hover:shadow-[0_4px_16px_rgba(99,102,241,0.4)]"
                onClick={sendChallenge}
              >
                Send Challenge!
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Incoming invite */}
      {incomingInvite && (
        <InviteDialog
          open={true}
          fromName={incomingInvite.fromName}
          fromAvatar={incomingInvite.fromAvatar}
          duration={incomingInvite.duration}
          onAccept={handleAcceptInvite}
          onDeny={handleDenyInvite}
        />
      )}

      {/* Profile setup dialog */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open && player) setDialogOpen(false)
        }}
      >
        <DialogContent
          className="sm:max-w-md border-glass-15 bg-glitch-bg-dark text-glitch-text"
          onInteractOutside={(e) => {
            if (!player) e.preventDefault()
          }}
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
              <label
                htmlFor="player-name"
                className="text-sm font-semibold uppercase tracking-widest text-glitch-label"
              >
                Name
              </label>
              <Input
                id="player-name"
                placeholder="Enter your name..."
                maxLength={20}
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSave()
                }}
                autoFocus
                className="border-glass-15 bg-glass-6 text-white placeholder:text-glitch-placeholder focus-visible:ring-glitch-accent"
              />
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-semibold uppercase tracking-widest text-glitch-label">
                Avatar
              </label>
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
