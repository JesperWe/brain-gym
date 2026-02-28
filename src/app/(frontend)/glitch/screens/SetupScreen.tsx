import type { GameRecord } from '../types'
import { Icon } from '@iconify/react'

interface SetupScreenProps {
  playerName: string
  playerAvatar: string
  gameDuration: number
  gameHistory: GameRecord[]
  onSetDuration: (d: number) => void
  onStart: () => void
}

export function SetupScreen({
  playerName,
  playerAvatar,
  gameDuration,
  gameHistory,
  onSetDuration,
  onStart,
}: SetupScreenProps) {
  return (
    <div className="glitch-game">
      <div className="w-full min-w-[500px] max-w-[520px] px-4 py-6">
        <h1 className="text-center text-2xl font-bold mb-6 text-white">
          <Icon
            icon="noto:thinking-face"
            width="48"
            height="48"
            className="inline align-middle mr-2"
          />
          Glitch or Bonus?
        </h1>

        {playerName && (
          <div className="flex items-center justify-center gap-2 mb-4">
            <span className="text-3xl">{playerAvatar}</span>
            <span className="text-lg font-semibold text-white">{playerName}</span>
          </div>
        )}

        <div className="bg-glass-8 rounded-2xl p-4 mb-4 backdrop-blur-sm border border-glass-10">
          <label className="block text-sm font-semibold uppercase tracking-widest text-glitch-label mb-2.5">
            Game Length
          </label>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((d) => (
              <button
                key={d}
                className={`flex-1 py-2.5 border-2 rounded-xl text-base font-semibold cursor-pointer transition-all ${
                  d === gameDuration
                    ? 'border-glitch-accent bg-glitch-accent/25 text-white'
                    : 'border-glass-15 bg-glass-5 text-glitch-text hover:bg-glass-12'
                }`}
                onClick={() => onSetDuration(d)}
              >
                {d} min
              </button>
            ))}
          </div>
        </div>

        <button
          className="btn-start block w-full p-4 border-none rounded-xl bg-linear-to-br from-glitch-accent-bold to-glitch-accent-purple text-white text-xl font-bold cursor-pointer transition-all mb-4"
          disabled={playerName.length === 0}
          onClick={onStart}
        >
          Start Game!
        </button>

        {gameHistory.length > 0 && (
          <div className="bg-glass-8 rounded-2xl p-4 mb-4 backdrop-blur-sm border border-glass-10 max-h-[300px] overflow-y-auto">
            <label className="block text-sm font-semibold uppercase tracking-widest text-glitch-label mb-2.5">
              Previous Games
            </label>
            <div className="flex flex-col gap-1.5">
              {gameHistory
                .slice()
                .reverse()
                .map((g, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 px-2.5 py-2 bg-glass-4 rounded-md text-sm"
                  >
                    <span className="text-lg">{g.avatar}</span>
                    <span className="font-semibold flex-1">{g.name}</span>
                    <span className="text-glitch-muted">{g.duration}min</span>
                    <span className="text-glitch-muted">
                      {g.correct}/{g.total}
                    </span>
                    <span className="font-bold text-glitch-accent min-w-[40px] text-right">
                      {g.percent}%
                    </span>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
