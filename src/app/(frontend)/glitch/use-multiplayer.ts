import { useRef, useEffect } from 'react'
import type { PlayerPresenceData, GameMessage, GameQuestion, GameAnswer, GameForfeit } from '@/lib/multiplayer/types'
import { getAblyClient } from '@/lib/multiplayer/ably-client'
import { updatePresence } from '@/lib/multiplayer/presence'
import { publishMessage, subscribeMessages } from '@/lib/multiplayer/game-channel'
import type { GameState, GameAction } from './game-reducer'
import type * as Ably from 'ably'

export interface UseMultiplayerOptions {
  isMultiplayer: boolean
  mpChannel: string
  mpRole: 'host' | 'guest' | null
  mpOpponentId: string
  mpOpponentName: string
  mpOpponentAvatar: string
  playerId: string
  playerName: string
  playerAvatar: string
  stateRef: React.MutableRefObject<GameState>
  dispatch: React.Dispatch<GameAction>
  clearAllTimers: () => void
  onMessage: (msg: GameMessage) => void
  onReady: () => void
}

export interface UseMultiplayerReturn {
  gameChannelRef: React.MutableRefObject<Ably.RealtimeChannel | null>
  playersChannelRef: React.MutableRefObject<Ably.RealtimeChannel | null>
  playerIdRef: React.MutableRefObject<string>
  buildPresence: (overrides?: Partial<PlayerPresenceData>) => PlayerPresenceData
  publish: (msg: GameMessage) => void
  updateScore: (overrides: Partial<PlayerPresenceData>) => void
  handleOpponentForfeit: (by: { name: string; avatar: string }) => void
}

export function useMultiplayer(opts: UseMultiplayerOptions): UseMultiplayerReturn {
  const gameChannelRef = useRef<Ably.RealtimeChannel | null>(null)
  const playersChannelRef = useRef<Ably.RealtimeChannel | null>(null)
  const playerIdRef = useRef(opts.playerId)

  // Keep playerIdRef in sync
  useEffect(() => { playerIdRef.current = opts.playerId }, [opts.playerId])

  function buildPresence(overrides: Partial<PlayerPresenceData> = {}): PlayerPresenceData {
    const s = opts.stateRef.current
    return {
      playerId: playerIdRef.current,
      name: opts.playerName,
      avatar: opts.playerAvatar,
      currentGame: null,
      currentOpponent: null,
      currentScore: s.correctCount,
      currentOpponentScore: s.opponentScore,
      lastGame: null,
      ...overrides,
    }
  }

  function publish(msg: GameMessage) {
    if (gameChannelRef.current) {
      publishMessage(gameChannelRef.current, msg)
    }
  }

  function updateScore(overrides: Partial<PlayerPresenceData>) {
    if (playersChannelRef.current) {
      updatePresence(playersChannelRef.current, buildPresence(overrides)).catch(() => {})
    }
  }

  function handleOpponentForfeit(by: { name: string; avatar: string }) {
    opts.clearAllTimers()
    opts.dispatch({ type: 'FORFEIT', by })
    updateScore({})
    setTimeout(() => { window.location.href = '/' }, 2000)
  }

  // Channel setup effect
  useEffect(() => {
    if (!opts.isMultiplayer || !opts.playerId || !opts.mpChannel) return

    let unsubMessages: (() => void) | null = null

    try {
      const client = getAblyClient(opts.playerId)
      const channel = client.channels.get(opts.mpChannel)
      gameChannelRef.current = channel
      const playersChannel = client.channels.get('glitch-players')
      playersChannelRef.current = playersChannel

      // Update presence to show we're in a game
      updatePresence(playersChannel, buildPresence({
        currentGame: opts.mpChannel,
        currentOpponent: opts.mpOpponentName,
        currentScore: 0,
        currentOpponentScore: 0,
      })).catch(() => {})

      unsubMessages = subscribeMessages(channel, (msg) => {
        opts.onMessage(msg)
      })

      // Monitor opponent presence — fallback if forfeit message didn't arrive
      const handlePresenceLeave = (member: Ably.PresenceMessage) => {
        if (member.clientId !== opts.mpOpponentId) return
        const s = opts.stateRef.current
        if (s.phase === 'game' || s.phase === 'countdown') {
          handleOpponentForfeit({ name: opts.mpOpponentName || 'Opponent', avatar: opts.mpOpponentAvatar || '🤖' })
        }
      }
      const handlePresenceUpdate = (member: Ably.PresenceMessage) => {
        if (member.clientId !== opts.mpOpponentId) return
        const data = member.data as PlayerPresenceData
        const s = opts.stateRef.current
        if (data.currentGame === null && (s.phase === 'game' || s.phase === 'countdown')) {
          handleOpponentForfeit({ name: data.name || opts.mpOpponentName || 'Opponent', avatar: data.avatar || opts.mpOpponentAvatar || '🤖' })
        }
      }
      playersChannel.presence.subscribe('update', handlePresenceUpdate)
      playersChannel.presence.subscribe('leave', handlePresenceLeave)

      // If multiplayer, auto-start countdown
      if (opts.stateRef.current.phase === 'countdown') {
        opts.onReady()
      }
    } catch {
      // Ably not available
    }

    return () => {
      if (unsubMessages) unsubMessages()
      if (playersChannelRef.current) {
        playersChannelRef.current.presence.unsubscribe('update')
        playersChannelRef.current.presence.unsubscribe('leave')
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.isMultiplayer, opts.playerId, opts.mpChannel])

  // Publish forfeit on page unload
  useEffect(() => {
    if (!opts.isMultiplayer) return

    function handleBeforeUnload() {
      const s = opts.stateRef.current
      if (gameChannelRef.current && s.phase !== 'results') {
        const forfeit: GameForfeit = {
          type: 'game-forfeit',
          playerId: playerIdRef.current,
          playerName: opts.playerName,
          playerAvatar: opts.playerAvatar,
        }
        gameChannelRef.current.publish('game-event', forfeit).catch(() => {})
      }
      if (playersChannelRef.current) {
        updatePresence(playersChannelRef.current, buildPresence()).catch(() => {})
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [opts.isMultiplayer, opts.playerName, opts.playerAvatar])

  return {
    gameChannelRef,
    playersChannelRef,
    playerIdRef,
    buildPresence,
    publish,
    updateScore,
    handleOpponentForfeit,
  }
}
