'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import type { GameRecord, GameScreen, Question } from './types'
import { generateQuestion } from './questions'
import { Icon } from '@iconify/react'
import {
  resumeAudio,
  playTone,
  playCorrectSound,
  playWrongSound,
  playTimeoutSound,
  playTadaSound,
  playGameOverSound,
} from './sound'
import './glitch.css'

const AVATARS = ['🦊', '🐱', '🐶', '🐸', '🦁', '🐼', '🐨', '🐯', '🦄', '🐙', '🐝', '🦋']

export default function GlitchPage() {
  const [playerName, setPlayerName] = useState('')
  const [playerAvatar, setPlayerAvatar] = useState(AVATARS[0])
  const [gameDuration, setGameDuration] = useState(1)
  const [currentScreen, setCurrentScreen] = useState<GameScreen>('setup')
  const [gameHistory, setGameHistory] = useState<GameRecord[]>([])

  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null)
  const [correctCount, setCorrectCount] = useState(0)
  const [totalCount, setTotalCount] = useState(0)
  const [questionAnswered, setQuestionAnswered] = useState(false)
  const [showBonus, setShowBonus] = useState(false)
  const [countdownValue, setCountdownValue] = useState(3)
  const [timeDisplay, setTimeDisplay] = useState('')
  const [buttonStates, setButtonStates] = useState<Record<number, 'correct' | 'wrong' | undefined>>(
    {},
  )
  const [buttonsDisabled, setButtonsDisabled] = useState(false)

  const gameEndTimeRef = useRef(0)
  const questionStartTimeRef = useRef(0)
  const questionTimerRef = useRef<number | null>(null)
  const gameTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const countdownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const bonusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const timerBarRef = useRef<HTMLDivElement>(null)
  const questionAnsweredRef = useRef(false)
  const correctCountRef = useRef(0)
  const totalCountRef = useRef(0)
  const currentQuestionRef = useRef<Question | null>(null)
  const currentScreenRef = useRef<GameScreen>('setup')
  const gameHistoryRef = useRef<GameRecord[]>([])

  // Sync refs with state
  useEffect(() => {
    questionAnsweredRef.current = questionAnswered
  }, [questionAnswered])
  useEffect(() => {
    correctCountRef.current = correctCount
  }, [correctCount])
  useEffect(() => {
    totalCountRef.current = totalCount
  }, [totalCount])
  useEffect(() => {
    currentQuestionRef.current = currentQuestion
  }, [currentQuestion])
  useEffect(() => {
    currentScreenRef.current = currentScreen
  }, [currentScreen])
  useEffect(() => {
    gameHistoryRef.current = gameHistory
  }, [gameHistory])

  // Load history from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem('mathsHistory')
    if (stored) {
      const parsed = JSON.parse(stored)
      setGameHistory(parsed)
      gameHistoryRef.current = parsed
    }
  }, [])

  // Escape key handler
  useEffect(() => {
    function handleEsc(e: KeyboardEvent) {
      if (
        e.key === 'Escape' &&
        (currentScreenRef.current === 'game' || currentScreenRef.current === 'countdown')
      ) {
        quitGame()
      }
    }
    document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Game clock updater
  useEffect(() => {
    if (currentScreen !== 'game') return

    function updateClock() {
      const remaining = Math.max(0, gameEndTimeRef.current - Date.now())
      const mins = Math.floor(remaining / 60000)
      const secs = Math.floor((remaining % 60000) / 1000)
      setTimeDisplay(`⏱ ${mins}:${secs.toString().padStart(2, '0')}`)
      if (remaining > 0) {
        clockTimerRef.current = setTimeout(updateClock, 250)
      }
    }
    updateClock()

    return () => {
      if (clockTimerRef.current) clearTimeout(clockTimerRef.current)
    }
  }, [currentScreen, currentQuestion])

  function clearAllTimers() {
    if (questionTimerRef.current) cancelAnimationFrame(questionTimerRef.current)
    if (gameTimerRef.current) clearTimeout(gameTimerRef.current)
    if (clockTimerRef.current) clearTimeout(clockTimerRef.current)
    if (countdownTimerRef.current) clearTimeout(countdownTimerRef.current)
    if (bonusTimerRef.current) clearTimeout(bonusTimerRef.current)
    questionTimerRef.current = null
    gameTimerRef.current = null
    clockTimerRef.current = null
    countdownTimerRef.current = null
    bonusTimerRef.current = null
  }

  function quitGame() {
    clearAllTimers()
    setCurrentScreen('setup')
    setShowBonus(false)
  }

  function startGame() {
    resumeAudio()
    setCorrectCount(0)
    setTotalCount(0)
    correctCountRef.current = 0
    totalCountRef.current = 0
    setQuestionAnswered(false)
    questionAnsweredRef.current = false
    showCountdown()
  }

  function showCountdown() {
    setCurrentScreen('countdown')
    const steps = [3, 2, 1]
    let i = 0

    function showStep() {
      if (i >= steps.length) {
        countdownTimerRef.current = null
        // Start the actual game
        gameEndTimeRef.current = Date.now() + gameDuration * 60 * 1000
        setCurrentScreen('game')
        doNextQuestion()
        return
      }
      setCountdownValue(steps[i])
      playTone(440 + (3 - steps[i]) * 100, 0.15, 'sine', 0.2)
      i++
      countdownTimerRef.current = setTimeout(showStep, 1000)
    }

    showStep()
  }

  function doNextQuestion() {
    const q = generateQuestion()
    setCurrentQuestion(q)
    currentQuestionRef.current = q
    setQuestionAnswered(false)
    questionAnsweredRef.current = false
    setButtonStates({})
    setButtonsDisabled(false)
    questionStartTimeRef.current = Date.now()
    // Timer will be started via effect after render
    startQuestionTimerImmediate()
  }

  function startQuestionTimerImmediate() {
    if (questionTimerRef.current) cancelAnimationFrame(questionTimerRef.current)

    const startTime = Date.now()
    const duration = 5000

    function tick() {
      const bar = timerBarRef.current
      if (!bar) {
        // Bar not mounted yet, retry
        questionTimerRef.current = requestAnimationFrame(tick)
        return
      }

      const elapsed = Date.now() - startTime
      const pct = Math.max(0, 1 - elapsed / duration)
      bar.style.width = `${pct * 100}%`
      if (pct > 0.5) bar.style.background = 'var(--color-glitch-success)'
      else if (pct > 0.25) bar.style.background = 'var(--color-glitch-warning)'
      else bar.style.background = 'var(--color-glitch-error)'

      if (elapsed >= duration) {
        onTimeout()
        return
      }
      if (!questionAnsweredRef.current) {
        questionTimerRef.current = requestAnimationFrame(tick)
      }
    }
    questionTimerRef.current = requestAnimationFrame(tick)
  }

  function onTimeout() {
    if (questionAnsweredRef.current) return
    questionAnsweredRef.current = true
    setQuestionAnswered(true)
    const newTotal = totalCountRef.current + 1
    totalCountRef.current = newTotal
    setTotalCount(newTotal)
    playTimeoutSound()
    // Highlight correct answer
    const q = currentQuestionRef.current!
    const states: Record<number, 'correct' | 'wrong' | undefined> = {}
    states[q.answer] = 'correct'
    setButtonStates(states)
    setButtonsDisabled(true)
    scheduleNext(3000)
  }

  function onAnswer(value: number) {
    if (questionAnsweredRef.current) return
    questionAnsweredRef.current = true
    setQuestionAnswered(true)
    if (questionTimerRef.current) cancelAnimationFrame(questionTimerRef.current)

    const newTotal = totalCountRef.current + 1
    totalCountRef.current = newTotal
    setTotalCount(newTotal)

    const q = currentQuestionRef.current!
    const states: Record<number, 'correct' | 'wrong' | undefined> = {}

    if (value === q.answer) {
      const elapsed = Date.now() - questionStartTimeRef.current
      const isBonus = q.isHardQuestion && elapsed < 3000
      const points = isBonus ? 2 : 1
      const newCorrect = correctCountRef.current + points
      correctCountRef.current = newCorrect
      setCorrectCount(newCorrect)
      if (isBonus) {
        triggerBonus()
      } else {
        playCorrectSound()
      }
      states[value] = 'correct'
    } else {
      playWrongSound()
      states[value] = 'wrong'
      states[q.answer] = 'correct'
    }

    setButtonStates(states)
    setButtonsDisabled(true)
    scheduleNext()
  }

  function triggerBonus() {
    setShowBonus(true)
    playTadaSound()
    bonusTimerRef.current = setTimeout(() => {
      setShowBonus(false)
      bonusTimerRef.current = null
    }, 1500)
  }

  function scheduleNext(delay = 3000) {
    if (gameTimerRef.current) clearTimeout(gameTimerRef.current)
    gameTimerRef.current = setTimeout(() => {
      if (Date.now() >= gameEndTimeRef.current) {
        endGame()
      } else {
        doNextQuestion()
      }
    }, delay)
  }

  const endGame = useCallback(() => {
    clearAllTimers()
    playGameOverSound()

    const total = totalCountRef.current
    const correct = correctCountRef.current
    const percent = total === 0 ? 0 : Math.round((correct / total) * 100)
    const record: GameRecord = {
      name: playerName,
      avatar: playerAvatar,
      date: new Date().toLocaleString(),
      duration: gameDuration,
      correct,
      total,
      percent,
    }
    const newHistory = [...gameHistoryRef.current, record]
    gameHistoryRef.current = newHistory
    setGameHistory(newHistory)
    localStorage.setItem('mathsHistory', JSON.stringify(newHistory))

    setCurrentScreen('results')
  }, [playerName, playerAvatar, gameDuration])

  // Cleanup on unmount
  useEffect(() => {
    return () => clearAllTimers()
  }, [])

  // ── Setup Screen ──
  if (currentScreen === 'setup') {
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

          <div className="bg-glass-8 rounded-2xl p-4 mb-4 backdrop-blur-sm border border-glass-10">
            <label className="block text-sm font-semibold uppercase tracking-widest text-glitch-label mb-2.5">
              Your Name
            </label>
            <input
              type="text"
              className="glitch-input w-full px-4 py-3 border-2 border-glass-15 rounded-xl bg-glass-6 text-white text-lg outline-none transition-colors"
              placeholder="Enter your name..."
              value={playerName}
              maxLength={20}
              onChange={(e) => setPlayerName(e.target.value.trim())}
            />
          </div>

          <div className="bg-glass-8 rounded-2xl p-4 mb-4 backdrop-blur-sm border border-glass-10">
            <label className="block text-sm font-semibold uppercase tracking-widest text-glitch-label mb-2.5">
              Choose Your Avatar
            </label>
            <div className="grid grid-cols-6 gap-2">
              {AVATARS.map((a) => (
                <button
                  key={a}
                  className={`text-3xl p-2 border-2 rounded-xl cursor-pointer transition-all ${
                    a === playerAvatar
                      ? 'border-glitch-accent bg-glitch-accent/20 scale-110'
                      : 'border-transparent bg-glass-5 hover:bg-glass-12 hover:scale-110'
                  }`}
                  onClick={() => setPlayerAvatar(a)}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>

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
                  onClick={() => setGameDuration(d)}
                >
                  {d} min
                </button>
              ))}
            </div>
          </div>

          <button
            className="btn-start block w-full p-4 border-none rounded-xl bg-linear-to-br from-glitch-accent-bold to-glitch-accent-purple text-white text-xl font-bold cursor-pointer transition-all mb-4"
            disabled={playerName.length === 0}
            onClick={startGame}
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

  // ── Countdown Screen ──
  if (currentScreen === 'countdown') {
    return (
      <div className="glitch-game">
        <div
          className="w-full min-w-[500px] max-w-[520px] px-4 py-6 countdown-screen"
          key={countdownValue}
        >
          <div className="countdown-number">{countdownValue}</div>
        </div>
      </div>
    )
  }

  // ── Results Screen ──
  if (currentScreen === 'results') {
    const latest = gameHistory[gameHistory.length - 1]
    let emoji: string
    if (latest.percent >= 90) emoji = '🏆'
    else if (latest.percent >= 70) emoji = '⭐'
    else if (latest.percent >= 50) emoji = '👍'
    else emoji = '💪'

    return (
      <div className="glitch-game">
        <div className="w-full min-w-[500px] max-w-[520px] px-4 py-6">
          <h1 className="text-center text-3xl font-bold mb-6 text-white">{emoji} Game Over!</h1>

          <div className="text-center px-4 py-8 bg-glass-8 rounded-3xl border border-glass-10 mb-5">
            <div className="text-5xl mb-2">{latest.avatar}</div>
            <div className="text-xl font-semibold mb-3">{latest.name}</div>
            <div className="text-6xl font-extrabold text-glitch-accent mb-1">{latest.percent}%</div>
            <div className="text-glitch-muted text-sm mb-1">
              {latest.correct} correct out of {latest.total} questions
            </div>
            <div className="text-glitch-muted text-sm mb-1">
              {latest.duration} minute{latest.duration > 1 ? 's' : ''} game
            </div>
          </div>

          <button
            className="btn-start block w-full p-4 border-none rounded-xl bg-linear-to-br from-glitch-accent-bold to-glitch-accent-purple text-white text-xl font-bold cursor-pointer transition-all mb-4"
            onClick={() => setCurrentScreen('setup')}
          >
            Play Again!
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
                        i === 0
                          ? 'bg-glitch-accent/15 border border-glitch-accent/30'
                          : 'bg-glass-4'
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

  // ── Game Screen ──
  return (
    <div className="glitch-game">
      <div className="w-full min-w-[500px] max-w-[520px] px-4 py-6">
        <div className="flex justify-between items-center mb-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{playerAvatar}</span>
            <span className="font-semibold text-lg">{playerName}</span>
          </div>
          <button
            className="close-btn w-9 h-9 border-none rounded-full bg-glass-8 text-glitch-muted text-xl leading-none cursor-pointer transition-all flex items-center justify-center"
            onClick={quitGame}
            title="Quit game (Esc)"
          >
            &times;
          </button>
          <div className="flex gap-4 items-center">
            <span className="font-bold text-lg text-glitch-label">
              {correctCount}/{totalCount}
            </span>
            <span className="font-bold text-lg text-glitch-warning">{timeDisplay}</span>
          </div>
        </div>

        <div className="question-timer-track">
          <div ref={timerBarRef} className="question-timer-bar" />
        </div>

        {currentQuestion && (
          <>
            <div className="text-center mb-6 p-6 bg-glass-6 rounded-3xl border border-glass-10">
              <div className="text-4xl font-bold text-white tracking-wide flex items-center justify-center gap-3">
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

            <div className="grid grid-cols-3 gap-2.5">
              {currentQuestion.options.map((opt, i) => (
                <button
                  key={`${opt}-${i}`}
                  className={`option-btn py-4 border-2 border-glass-15 rounded-xl bg-glass-6 text-glitch-text text-xl font-bold cursor-pointer transition-all ${buttonStates[opt] || ''}`}
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
