import type { RefObject } from 'react'
import type { Question } from '../types'

interface GameScreenProps {
  playerAvatar: string
  playerName: string
  correctCount: number
  totalCount: number
  opponentScore: number
  isMultiplayer: boolean
  timeDisplay: string
  currentQuestion: Question | null
  buttonStates: Record<number, 'correct' | 'wrong' | 'opponent-wrong'>
  buttonsDisabled: boolean
  showBonus: boolean
  timerBarRef: RefObject<HTMLDivElement | null>
  onAnswer: (value: number) => void
  onQuit: () => void
}

export function GameScreen({
  playerAvatar,
  playerName,
  correctCount,
  totalCount,
  opponentScore,
  isMultiplayer,
  timeDisplay,
  currentQuestion,
  buttonStates,
  buttonsDisabled,
  showBonus,
  timerBarRef,
  onAnswer,
  onQuit,
}: GameScreenProps) {
  return (
    <div className="glitch-game">
      <div className="w-full max-w-[520px] px-4 py-6">
        <div className="flex justify-between items-center mb-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{playerAvatar}</span>
            <span className="font-semibold text-lg">{playerName}</span>
          </div>
          <button
            className="close-btn w-9 h-9 border-none rounded-full bg-glass-8 text-glitch-muted text-xl leading-none cursor-pointer transition-all flex items-center justify-center"
            onClick={onQuit}
            title="Quit game (Esc)"
          >
            &times;
          </button>
          <div className="flex gap-4 items-center">
            <span className="font-bold text-lg text-glitch-label">
              {correctCount}/{totalCount}
              {isMultiplayer && (
                <span className="text-glitch-muted ml-2">vs {opponentScore}</span>
              )}
            </span>
            <span className="font-bold text-lg text-glitch-warning">{timeDisplay}</span>
          </div>
        </div>

        <div className="question-timer-track">
          <div ref={timerBarRef} className="question-timer-bar" />
        </div>

        {currentQuestion && (
          <>
            <div className="text-center mb-4 sm:mb-6 p-4 sm:p-6 bg-glass-6 rounded-3xl border border-glass-10">
              <div className="text-3xl sm:text-4xl font-bold text-white tracking-wide flex items-center justify-center gap-3">
                {currentQuestion.type === 'multiplication' ? (
                  <>
                    {currentQuestion.a} &middot; {currentQuestion.b}
                  </>
                ) : (
                  <span className="division">
                    <span className="dividend">{currentQuestion.a}</span>
                    <span className="divisor">{currentQuestion.b}</span>
                  </span>
                )}
                {' = ?'}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-1.5 sm:gap-2.5">
              {currentQuestion.options.map((opt, i) => (
                <button
                  key={`${opt}-${i}`}
                  className={`option-btn py-3 sm:py-4 border-2 border-glass-15 rounded-xl bg-glass-6 text-glitch-text text-lg sm:text-xl font-bold cursor-pointer transition-all ${buttonStates[opt] || ''}`}
                  disabled={buttonsDisabled}
                  onClick={() => onAnswer(opt)}
                >
                  {opt}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {showBonus && (
        <div className="bonus-star-overlay">
          <div className="bonus-star">⭐</div>
          <div className="bonus-text">+2</div>
        </div>
      )}
    </div>
  )
}
