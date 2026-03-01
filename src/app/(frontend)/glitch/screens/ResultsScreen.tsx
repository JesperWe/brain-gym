import type { GameRecord } from '../types'

interface ResultsScreenProps {
  isMultiplayer: boolean
  playerAvatar: string
  playerName: string
  opponentAvatar: string
  opponentName: string
  correctCount: number
  opponentScore: number
  gameHistory: GameRecord[]
  onPlayAgain: () => void
  onGoHome: () => void
}

export function ResultsScreen({
  isMultiplayer,
  playerAvatar,
  playerName,
  opponentAvatar,
  opponentName,
  correctCount,
  opponentScore,
  gameHistory,
  onPlayAgain,
  onGoHome,
}: ResultsScreenProps) {
  if (isMultiplayer) {
    const won = correctCount > opponentScore
    const tied = correctCount === opponentScore
    const resultEmoji = won ? '🏆' : tied ? '🤝' : '💪'

    return (
      <div className="glitch-game">
        <div className="w-full max-w-[520px] px-4 py-6">
          <h1 className="text-center text-3xl font-bold mb-6 text-white">
            {resultEmoji} {won ? 'You Win!' : tied ? "It's a Tie!" : 'Game Over!'}
          </h1>

          <div className="mp-results-container">
            <div className="mp-result-card">
              <div className="text-4xl mb-2">{playerAvatar}</div>
              <div className="text-lg font-semibold text-white mb-1">{playerName}</div>
              <div className="text-4xl font-extrabold text-glitch-accent">{correctCount}</div>
            </div>

            <div className="mp-vs-divider">VS</div>

            <div className="mp-result-card">
              <div className="text-4xl mb-2">{opponentAvatar || '🤖'}</div>
              <div className="text-lg font-semibold text-white mb-1">
                {opponentName || 'Opponent'}
              </div>
              <div className="text-4xl font-extrabold text-glitch-accent">{opponentScore}</div>
            </div>
          </div>

          <button
            className="btn-start block w-full p-4 border-none rounded-xl bg-linear-to-br from-glitch-accent-bold to-glitch-accent-purple text-white text-xl font-bold cursor-pointer transition-all mb-4 mt-6"
            onClick={onGoHome}
          >
            Back to Home
          </button>
        </div>
      </div>
    )
  }

  const latest = gameHistory[gameHistory.length - 1]
  if (!latest) return null

  let emoji: string
  if (latest.percent >= 90) emoji = '🏆'
  else if (latest.percent >= 70) emoji = '⭐'
  else if (latest.percent >= 50) emoji = '👍'
  else emoji = '💪'

  return (
    <div className="glitch-game">
      <div className="w-full max-w-[520px] px-4 py-6">
        <h1 className="text-center text-3xl font-bold mb-6 text-white">{emoji} Game Over!</h1>

        <div className="text-center px-4 py-8 bg-glass-8 rounded-3xl border border-glass-10 mb-5">
          <div className="text-5xl mb-2">{latest.avatar}</div>
          <div className="text-xl font-semibold mb-3">{latest.name}</div>
          <div className="text-6xl font-extrabold text-glitch-accent mb-1">{latest.percent}%</div>
          <div className="text-glitch-muted text-sm mb-1">
            {latest.correct} points from {latest.total} questions
          </div>
          <div className="text-glitch-muted text-sm mb-1">
            {latest.duration} minute{latest.duration > 1 ? 's' : ''} game
          </div>
        </div>

        <button
          className="btn-start block w-full p-4 border-none rounded-xl bg-linear-to-br from-glitch-accent-bold to-glitch-accent-purple text-white text-xl font-bold cursor-pointer transition-all mb-4"
          onClick={onPlayAgain}
        >
          Play Again!
        </button>

        <button
          className="block w-full p-3 border-2 border-glass-15 rounded-xl bg-transparent text-glitch-text text-base font-semibold cursor-pointer transition-all mb-4 hover:bg-glass-12"
          onClick={onGoHome}
        >
          Return to Home
        </button>

        {gameHistory.length > 0 && (
          <div className="bg-glass-8 rounded-2xl p-4 mb-4 backdrop-blur-sm border border-glass-10 max-h-[300px] overflow-y-auto">
            <label className="block text-sm font-semibold uppercase tracking-widest text-glitch-label mb-2.5">
              Game History
            </label>
            <div className="flex flex-col gap-1.5">
              {gameHistory
                .slice()
                .reverse()
                .map((g, i) => (
                  <div
                    key={i}
                    className={`flex items-center gap-2 px-2.5 py-2 rounded-md text-sm ${
                      i === 0 ? 'bg-glitch-accent/15 border border-glitch-accent/30' : 'bg-glass-4'
                    }`}
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
