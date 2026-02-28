'use client'

import type { PlayerPresenceData } from '@/lib/multiplayer/types'

interface PlayerCardProps {
  player: PlayerPresenceData
  isSelf: boolean
  onClick?: () => void
}

export function PlayerCard({ player, isSelf, onClick }: PlayerCardProps) {
  const isPlaying = !!player.currentGame
  const lg = player.lastGame

  if (isSelf) {
    return (
      <div className="player-card player-card-self">
        <span className="text-2xl">{player.avatar}</span>
        <div className="flex flex-col min-w-0">
          <span className="font-semibold text-white text-sm truncate">{player.name} <span className="text-glitch-muted font-normal">(you)</span></span>
          {lg && (
            <span className="text-xs text-glitch-muted truncate">
              {lg.won ? '🏆' : '💪'} {lg.score}:{lg.opponentScore} vs {lg.opponent}
            </span>
          )}
        </div>
      </div>
    )
  }

  if (isPlaying) {
    const isSolo = player.currentGame === 'solo'
    return (
      <div className="player-card player-card-playing">
        <span className="text-2xl">{player.avatar}</span>
        <div className="flex flex-col min-w-0">
          <span className="font-semibold text-white text-sm truncate">{player.name}</span>
          <span className="text-xs text-glitch-muted truncate">
            {isSolo ? 'Playing solo' : `vs ${player.currentOpponent} — ${player.currentScore}:${player.currentOpponentScore}`}
          </span>
        </div>
      </div>
    )
  }

  return (
    <button className="player-card player-card-available" onClick={onClick}>
      <span className="text-2xl">{player.avatar}</span>
      <div className="flex flex-col min-w-0">
        <span className="font-semibold text-white text-sm truncate">{player.name}</span>
        {lg ? (
          <span className="text-xs text-glitch-muted truncate">
            {lg.won ? '🏆' : '💪'} {lg.score}:{lg.opponentScore} vs {lg.opponent}
          </span>
        ) : (
          <span className="text-xs text-glitch-success">Online</span>
        )}
      </div>
    </button>
  )
}
