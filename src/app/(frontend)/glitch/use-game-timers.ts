import { useRef, useEffect } from 'react'
import type { GameAction } from './game-reducer'
import { playTone, playTadaSound } from './sound'

export function useGameTimers() {
  const questionTimerRef = useRef<number | null>(null)
  const gameTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const countdownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const bonusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const timerBarRef = useRef<HTMLDivElement>(null)

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

  function startQuestionTimer(onTimeout: () => void) {
    if (questionTimerRef.current) cancelAnimationFrame(questionTimerRef.current)

    const startTime = Date.now()
    const duration = 5000

    function tick() {
      const bar = timerBarRef.current
      if (!bar) {
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
      // No state check needed: tick runs until 5s or cancelled by onAnswer/lockout
      questionTimerRef.current = requestAnimationFrame(tick)
    }
    questionTimerRef.current = requestAnimationFrame(tick)
  }

  function showCountdown(opts: {
    isMultiplayer: boolean
    mpDuration: number
    gameDuration: number
    dispatch: React.Dispatch<GameAction>
    onDone: () => void
  }) {
    const steps = [3, 2, 1]
    let i = 0

    function showStep() {
      if (i >= steps.length) {
        countdownTimerRef.current = null
        const duration = opts.isMultiplayer ? opts.mpDuration : opts.gameDuration
        const gameEndTime = Date.now() + duration * 60 * 1000
        opts.dispatch({ type: 'COUNTDOWN_DONE', gameEndTime })
        opts.onDone()
        return
      }
      opts.dispatch({ type: 'COUNTDOWN_TICK', value: steps[i] })
      playTone(440 + (3 - steps[i]) * 100, 0.15, 'sine', 0.2)
      i++
      countdownTimerRef.current = setTimeout(showStep, 1000)
    }

    showStep()
  }

  function triggerBonus(dispatch: React.Dispatch<GameAction>) {
    dispatch({ type: 'SHOW_BONUS' })
    playTadaSound()
    bonusTimerRef.current = setTimeout(() => {
      dispatch({ type: 'HIDE_BONUS' })
      bonusTimerRef.current = null
    }, 1500)
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => clearAllTimers()
  }, [])

  return {
    timerBarRef,
    questionTimerRef,
    clockTimerRef,
    clearAllTimers,
    startQuestionTimer,
    showCountdown,
    triggerBonus,
  }
}
