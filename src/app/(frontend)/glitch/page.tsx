'use client'

import { Suspense, useState, useEffect, useRef, useReducer } from 'react'
import { useSearchParams } from 'next/navigation'
import type { GameRecord, Question } from './types'
import type { PlayerPresenceData, MultiplayerGameRecord, GameQuestion, GameAnswer, GameForfeit, GameResult, GameMessage } from '@/lib/multiplayer/types'
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
import { getAblyClient } from '@/lib/multiplayer/ably-client'
import { updatePresence } from '@/lib/multiplayer/presence'
import { publishMessage, subscribeMessages } from '@/lib/multiplayer/game-channel'
import { getHistoryChannel, saveGameRecord } from '@/lib/multiplayer/game-history'
import { gameReducer, createInitialState } from './game-reducer'
import type { GameState } from './game-reducer'
import type * as Ably from 'ably'
import './glitch.css'

export default function GlitchPage() {
  return (
    <Suspense fallback={null}>
      <GlitchPageInner />
    </Suspense>
  )
}

function GlitchPageInner() {
  const searchParams = useSearchParams()
  const isMultiplayer = searchParams.get('multiplayer') === 'true'
  const mpChannel = searchParams.get('channel') || ''
  const mpDuration = parseInt(searchParams.get('duration') || '1', 10)
  const mpRole = searchParams.get('role') as 'host' | 'guest' | null
  const mpOpponentName = searchParams.get('opponentName') || ''
  const mpOpponentAvatar = searchParams.get('opponentAvatar') || ''
  const mpOpponentId = searchParams.get('opponentId') || ''

  // Player identity (not part of game state machine)
  const [playerName, setPlayerName] = useState('')
  const [playerAvatar, setPlayerAvatar] = useState('🦊')
  const [playerId, setPlayerId] = useState('')
  const [gameDuration, setGameDuration] = useState(isMultiplayer ? mpDuration : 1)
  const [timeDisplay, setTimeDisplay] = useState('')

  // Multiplayer display state (from URL params, not game flow)
  const [opponentName] = useState(mpOpponentName)
  const [opponentAvatar] = useState(mpOpponentAvatar)

  // ── State machine ──
  const [state, dispatch] = useReducer(gameReducer, isMultiplayer, createInitialState)
  const stateRef = useRef<GameState>(state)
  useEffect(() => { stateRef.current = state })

  // Timer/DOM/channel refs (not game state)
  const questionTimerRef = useRef<number | null>(null)
  const gameTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const countdownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const bonusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const timerBarRef = useRef<HTMLDivElement>(null)
  const gameChannelRef = useRef<Ably.RealtimeChannel | null>(null)
  const playersChannelRef = useRef<Ably.RealtimeChannel | null>(null)
  const playerIdRef = useRef('')

  // Build full presence data object (Ably replaces entirely on update)
  function buildPresence(overrides: Partial<PlayerPresenceData> = {}): PlayerPresenceData {
    const s = stateRef.current
    return {
      playerId: playerIdRef.current,
      name: playerName,
      avatar: playerAvatar,
      currentGame: null,
      currentOpponent: null,
      currentScore: s.correctCount,
      currentOpponentScore: s.opponentScore,
      lastGame: null,
      ...overrides,
    }
  }

  // Load player info and history from localStorage on mount
  useEffect(() => {
    try {
      const player = localStorage.getItem('mathsPlayer')
      if (player) {
        const parsed = JSON.parse(player)
        if (parsed.name) setPlayerName(parsed.name)
        if (parsed.avatar) setPlayerAvatar(parsed.avatar)
        if (parsed.playerId) {
          setPlayerId(parsed.playerId)
          playerIdRef.current = parsed.playerId
        }
      }
    } catch {}
    const stored = localStorage.getItem('mathsHistory')
    if (stored) {
      const parsed = JSON.parse(stored)
      dispatch({ type: 'LOAD_HISTORY', history: parsed })
    }
  }, [])

  // Setup multiplayer channel
  useEffect(() => {
    if (!isMultiplayer || !playerId || !mpChannel) return

    let unsubMessages: (() => void) | null = null

    try {
      const client = getAblyClient(playerId)
      const channel = client.channels.get(mpChannel)
      gameChannelRef.current = channel
      const playersChannel = client.channels.get('glitch-players')
      playersChannelRef.current = playersChannel

      // Update presence to show we're in a game
      updatePresence(playersChannel, buildPresence({
        currentGame: mpChannel,
        currentOpponent: mpOpponentName,
        currentScore: 0,
        currentOpponentScore: 0,
      })).catch(() => {})

      unsubMessages = subscribeMessages(channel, (msg) => {
        handleGameMessage(msg)
      })

      // Monitor opponent presence — fallback if forfeit message didn't arrive
      const handlePresenceLeave = (member: Ably.PresenceMessage) => {
        if (member.clientId !== mpOpponentId) return
        const s = stateRef.current
        if (s.phase === 'game' || s.phase === 'countdown') {
          clearAllTimers()
          dispatch({ type: 'FORFEIT', by: { name: mpOpponentName || 'Opponent', avatar: mpOpponentAvatar || '🤖' } })
          updatePresence(playersChannel, buildPresence()).catch(() => {})
          setTimeout(() => { window.location.href = '/' }, 2000)
        }
      }
      const handlePresenceUpdate = (member: Ably.PresenceMessage) => {
        if (member.clientId !== mpOpponentId) return
        const data = member.data as PlayerPresenceData
        const s = stateRef.current
        if (data.currentGame === null && (s.phase === 'game' || s.phase === 'countdown')) {
          clearAllTimers()
          dispatch({ type: 'FORFEIT', by: { name: data.name || mpOpponentName || 'Opponent', avatar: data.avatar || mpOpponentAvatar || '🤖' } })
          updatePresence(playersChannel, buildPresence()).catch(() => {})
          setTimeout(() => { window.location.href = '/' }, 2000)
        }
      }
      playersChannel.presence.subscribe('update', handlePresenceUpdate)
      playersChannel.presence.subscribe('leave', handlePresenceLeave)

      // If multiplayer, auto-start countdown
      if (stateRef.current.phase === 'countdown') {
        resumeAudio()
        showCountdown()
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
  }, [isMultiplayer, playerId, mpChannel])

  function handleGameMessage(msg: GameMessage) {
    switch (msg.type) {
      case 'question': {
        const gq = msg as GameQuestion
        if (mpRole === 'guest') {
          dispatch({ type: 'NEW_QUESTION', question: gq.question, questionIndex: gq.questionIndex })
          startQuestionTimer()
        }
        break
      }
      case 'answer': {
        const ga = msg as GameAnswer
        if (ga.playerId !== playerIdRef.current) {
          const s = stateRef.current

          dispatch({
            type: 'OPPONENT_ANSWER',
            selectedValue: ga.selectedValue,
            isCorrect: ga.isCorrect,
            points: ga.points || 1,
          })

          // If opponent correct and I was still waiting → lockout: cancel timer + publish lockout answer
          if (ga.isCorrect && s.questionPhase === 'waiting') {
            if (questionTimerRef.current) cancelAnimationFrame(questionTimerRef.current)
            if (gameChannelRef.current) {
              publishMessage(gameChannelRef.current, {
                type: 'answer',
                playerId: playerIdRef.current,
                questionIndex: s.questionIndex,
                selectedValue: -1,
                isCorrect: false,
                points: 0,
                timestamp: Date.now(),
              })
            }
          }

          // Update presence with opponent score
          if (playersChannelRef.current) {
            const updated = stateRef.current
            updatePresence(playersChannelRef.current, buildPresence({
              currentGame: mpChannel,
              currentOpponentScore: updated.opponentScore,
            })).catch(() => {})
          }
        }
        break
      }
      case 'game-end': {
        endGame()
        break
      }
      case 'game-forfeit': {
        const gf = msg as GameForfeit
        if (gf.playerId !== playerIdRef.current) {
          clearAllTimers()
          dispatch({ type: 'FORFEIT', by: { name: gf.playerName, avatar: gf.playerAvatar } })
          if (playersChannelRef.current) {
            updatePresence(playersChannelRef.current, buildPresence()).catch(() => {})
          }
          setTimeout(() => { window.location.href = '/' }, 2000)
        }
        break
      }
    }
  }

  // Auto-advance when both answered
  useEffect(() => {
    if (state.phase !== 'game' || state.questionPhase !== 'both-answered') return

    const delay = isMultiplayer ? 1500 : (
      // Single-player: shorter delay for correct, longer for wrong/timeout
      state.currentQuestion && state.buttonStates[state.currentQuestion.answer] === 'correct'
        && !Object.values(state.buttonStates).includes('wrong')
        ? 1500 : 3000
    )

    const timer = setTimeout(() => {
      const s = stateRef.current
      if (s.phase !== 'game') return // guard: game may have ended
      if (Date.now() >= s.gameEndTime) {
        if (isMultiplayer && mpRole === 'host' && gameChannelRef.current) {
          publishMessage(gameChannelRef.current, { type: 'game-end' })
        }
        endGame()
      } else if (!isMultiplayer || mpRole === 'host') {
        doNextQuestion()
      }
      // Guest waits for host to publish next question
    }, delay)

    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.questionPhase, state.questionIndex])

  // Escape key handler
  useEffect(() => {
    function handleEsc(e: KeyboardEvent) {
      const s = stateRef.current
      if (e.key === 'Escape' && (s.phase === 'game' || s.phase === 'countdown')) {
        quitGame()
      }
    }
    document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Game clock updater
  useEffect(() => {
    if (state.phase !== 'game') return

    function updateClock() {
      const remaining = Math.max(0, stateRef.current.gameEndTime - Date.now())
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
  }, [state.phase, state.currentQuestion])

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
    if (isMultiplayer) {
      if (gameChannelRef.current) {
        const forfeit: GameForfeit = {
          type: 'game-forfeit',
          playerId: playerIdRef.current,
          playerName,
          playerAvatar,
        }
        gameChannelRef.current.publish('game-event', forfeit).catch(() => {})
      }
      if (playersChannelRef.current) {
        updatePresence(playersChannelRef.current, buildPresence()).catch(() => {})
      }
      window.location.href = '/'
      return
    }
    dispatch({ type: 'RESET_TO_SETUP' })
  }

  function startGame() {
    resumeAudio()
    dispatch({ type: 'START_GAME' })
    showCountdown()
  }

  function showCountdown() {
    const steps = [3, 2, 1]
    let i = 0

    function showStep() {
      if (i >= steps.length) {
        countdownTimerRef.current = null
        const duration = isMultiplayer ? mpDuration : gameDuration
        const gameEndTime = Date.now() + duration * 60 * 1000
        dispatch({ type: 'COUNTDOWN_DONE', gameEndTime })
        doNextQuestion()
        return
      }
      dispatch({ type: 'COUNTDOWN_TICK', value: steps[i] })
      playTone(440 + (3 - steps[i]) * 100, 0.15, 'sine', 0.2)
      i++
      countdownTimerRef.current = setTimeout(showStep, 1000)
    }

    showStep()
  }

  function doNextQuestion() {
    const q = generateQuestion()
    const s = stateRef.current
    const idx = s.questionIndex + 1

    dispatch({ type: 'NEW_QUESTION', question: q, questionIndex: idx })
    startQuestionTimer()

    // If host in multiplayer, publish question
    if (isMultiplayer && mpRole === 'host' && gameChannelRef.current) {
      const gq: GameQuestion = {
        type: 'question',
        questionIndex: idx,
        question: q,
      }
      publishMessage(gameChannelRef.current, gq)
    }
  }

  function startQuestionTimer() {
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

  function onTimeout() {
    const s = stateRef.current
    if (s.questionPhase !== 'waiting' && s.questionPhase !== 'opponent-answered') return

    dispatch({ type: 'TIMEOUT', isMultiplayer })
    playTimeoutSound()

    if (isMultiplayer && gameChannelRef.current) {
      publishMessage(gameChannelRef.current, {
        type: 'answer',
        playerId: playerIdRef.current,
        questionIndex: s.questionIndex,
        selectedValue: -1,
        isCorrect: false,
        points: 0,
        timestamp: Date.now(),
      })
    }
    // Advance is handled by the useEffect on questionPhase === 'both-answered'
  }

  function onAnswer(value: number) {
    const s = stateRef.current
    if (s.questionPhase !== 'waiting' && s.questionPhase !== 'opponent-answered') return
    if (questionTimerRef.current) cancelAnimationFrame(questionTimerRef.current)

    const q = s.currentQuestion!
    const isCorrect = value === q.answer
    const elapsed = Date.now() - s.questionStartTime
    const isBonus = q.isHardQuestion && elapsed < 3000
    const points = isCorrect ? (isBonus ? 2 : 1) : 0

    dispatch({ type: 'MY_ANSWER', value, isCorrect, points, isMultiplayer })

    // Sound effects
    if (isCorrect) {
      if (isBonus) triggerBonus()
      else playCorrectSound()
    } else {
      playWrongSound()
    }

    // Publish answer in multiplayer
    if (isMultiplayer && gameChannelRef.current) {
      publishMessage(gameChannelRef.current, {
        type: 'answer',
        playerId: playerIdRef.current,
        questionIndex: s.questionIndex,
        selectedValue: value,
        isCorrect,
        points,
        timestamp: Date.now(),
      })

      // Update presence with score
      if (playersChannelRef.current) {
        const updated = stateRef.current
        updatePresence(playersChannelRef.current, buildPresence({
          currentGame: mpChannel,
          currentScore: updated.correctCount,
        })).catch(() => {})
      }
    }
    // Advance is handled by the useEffect on questionPhase === 'both-answered'
  }

  function triggerBonus() {
    dispatch({ type: 'SHOW_BONUS' })
    playTadaSound()
    bonusTimerRef.current = setTimeout(() => {
      dispatch({ type: 'HIDE_BONUS' })
      bonusTimerRef.current = null
    }, 1500)
  }

  function endGame() {
    const s = stateRef.current
    if (s.phase !== 'game') return // guard handled by reducer too, but skip side effects

    clearAllTimers()
    playGameOverSound()

    const total = s.totalCount
    const correct = s.correctCount
    const percent = total === 0 ? 0 : Math.round((correct / total) * 100)
    const record: GameRecord = {
      name: playerName,
      avatar: playerAvatar,
      date: new Date().toLocaleString(),
      duration: isMultiplayer ? mpDuration : gameDuration,
      correct,
      total,
      percent,
    }

    dispatch({ type: 'END_GAME', record })
    localStorage.setItem('mathsHistory', JSON.stringify([...s.gameHistory, record]))

    // Save multiplayer record to LiveMap
    if (isMultiplayer) {
      const mpRecord: MultiplayerGameRecord = {
        finishedAt: Date.now(),
        opponent: opponentName || 'Opponent',
        opponentAvatar: opponentAvatar || '🤖',
        opponentId: '',
        score: correct,
        opponentScore: s.opponentScore,
      }

      try {
        const client = getAblyClient(playerIdRef.current)
        const historyChannel = getHistoryChannel(client)
        saveGameRecord(historyChannel, playerIdRef.current, mpRecord).catch(() => {})
      } catch {}

      // Host publishes game-result for the webhook to record in Payload
      if (mpRole === 'host' && gameChannelRef.current) {
        const result: GameResult = {
          type: 'game-result',
          gameId: crypto.randomUUID(),
          player1Id: playerIdRef.current,
          player1Name: playerName,
          player1Avatar: playerAvatar,
          player1Score: correct,
          player2Id: mpOpponentId,
          player2Name: opponentName,
          player2Avatar: opponentAvatar,
          player2Score: s.opponentScore,
          channel: mpChannel,
        }
        publishMessage(gameChannelRef.current, result)
      }

      // Update presence with lastGame — keep currentGame set so opponent
      // doesn't mistake this for a forfeit
      if (playersChannelRef.current) {
        updatePresence(playersChannelRef.current, buildPresence({
          currentGame: mpChannel,
          lastGame: {
            opponent: mpRecord.opponent,
            score: mpRecord.score,
            opponentScore: mpRecord.opponentScore,
            won: mpRecord.score > mpRecord.opponentScore,
          },
        })).catch(() => {})
      }
    }
  }

  // Publish forfeit on page unload (back button, tab close, etc.)
  useEffect(() => {
    if (!isMultiplayer) return

    function handleBeforeUnload() {
      const s = stateRef.current
      if (gameChannelRef.current && s.phase !== 'results') {
        const forfeit: GameForfeit = {
          type: 'game-forfeit',
          playerId: playerIdRef.current,
          playerName,
          playerAvatar,
        }
        gameChannelRef.current.publish('game-event', forfeit).catch(() => {})
      }
      if (playersChannelRef.current) {
        playersChannelRef.current.presence.update({
          playerId: playerIdRef.current,
          name: playerName,
          avatar: playerAvatar,
          currentGame: null,
          currentOpponent: null,
          currentScore: 0,
          currentOpponentScore: 0,
          lastGame: null,
        }).catch(() => {})
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [isMultiplayer, playerName, playerAvatar])

  // Cleanup on unmount
  useEffect(() => {
    return () => clearAllTimers()
  }, [])

  // ── Setup Screen ──
  if (state.phase === 'setup') {
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

          {state.gameHistory.length > 0 && (
            <div className="bg-glass-8 rounded-2xl p-4 mb-4 backdrop-blur-sm border border-glass-10 max-h-[300px] overflow-y-auto">
              <label className="block text-sm font-semibold uppercase tracking-widest text-glitch-label mb-2.5">
                Previous Games
              </label>
              <div className="flex flex-col gap-1.5">
                {state.gameHistory
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

  // ── Forfeit overlay ──
  if (state.phase === 'forfeit' && state.forfeitBy) {
    return (
      <div className="glitch-game">
        <div className="w-full min-w-[500px] max-w-[520px] px-4 py-6 text-center">
          <div className="text-6xl mb-4">{state.forfeitBy.avatar}</div>
          <h1 className="text-2xl font-bold text-white mb-2">{state.forfeitBy.name} gave up!</h1>
          <p className="text-glitch-muted">Returning to home...</p>
        </div>
      </div>
    )
  }

  // ── Countdown Screen ──
  if (state.phase === 'countdown') {
    return (
      <div className="glitch-game">
        <div
          className="w-full min-w-[500px] max-w-[520px] px-4 py-6 countdown-screen"
          key={state.countdownValue}
        >
          <div className="countdown-number">{state.countdownValue}</div>
        </div>
      </div>
    )
  }

  // ── Results Screen ──
  if (state.phase === 'results') {
    const latest = state.gameHistory[state.gameHistory.length - 1]

    if (isMultiplayer) {
      const myScore = state.correctCount
      const oppScore = state.opponentScore
      const won = myScore > oppScore
      const tied = myScore === oppScore
      const resultEmoji = won ? '🏆' : tied ? '🤝' : '💪'

      return (
        <div className="glitch-game">
          <div className="w-full min-w-[500px] max-w-[520px] px-4 py-6">
            <h1 className="text-center text-3xl font-bold mb-6 text-white">
              {resultEmoji} {won ? 'You Win!' : tied ? 'It\'s a Tie!' : 'Game Over!'}
            </h1>

            <div className="mp-results-container">
              <div className="mp-result-card">
                <div className="text-4xl mb-2">{playerAvatar}</div>
                <div className="text-lg font-semibold text-white mb-1">{playerName}</div>
                <div className="text-4xl font-extrabold text-glitch-accent">{myScore}</div>
              </div>

              <div className="mp-vs-divider">VS</div>

              <div className="mp-result-card">
                <div className="text-4xl mb-2">{opponentAvatar || '🤖'}</div>
                <div className="text-lg font-semibold text-white mb-1">{opponentName || 'Opponent'}</div>
                <div className="text-4xl font-extrabold text-glitch-accent">{oppScore}</div>
              </div>
            </div>

            <button
              className="btn-start block w-full p-4 border-none rounded-xl bg-linear-to-br from-glitch-accent-bold to-glitch-accent-purple text-white text-xl font-bold cursor-pointer transition-all mb-4 mt-6"
              onClick={() => { window.location.href = '/' }}
            >
              Back to Home
            </button>
          </div>
        </div>
      )
    }

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
            onClick={() => dispatch({ type: 'RESET_TO_SETUP' })}
          >
            Play Again!
          </button>

          <button
            className="block w-full p-3 border-2 border-glass-15 rounded-xl bg-transparent text-glitch-text text-base font-semibold cursor-pointer transition-all mb-4 hover:bg-glass-12"
            onClick={() => { window.location.href = '/' }}
          >
            Return to Home
          </button>

          {state.gameHistory.length > 0 && (
            <div className="bg-glass-8 rounded-2xl p-4 mb-4 backdrop-blur-sm border border-glass-10 max-h-[300px] overflow-y-auto">
              <label className="block text-sm font-semibold uppercase tracking-widest text-glitch-label mb-2.5">
                Game History
              </label>
              <div className="flex flex-col gap-1.5">
                {state.gameHistory
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
              {state.correctCount}/{state.totalCount}
              {isMultiplayer && (
                <span className="text-glitch-muted ml-2">vs {state.opponentScore}</span>
              )}
            </span>
            <span className="font-bold text-lg text-glitch-warning">{timeDisplay}</span>
          </div>
        </div>

        <div className="question-timer-track">
          <div ref={timerBarRef} className="question-timer-bar" />
        </div>

        {state.currentQuestion && (
          <>
            <div className="text-center mb-6 p-6 bg-glass-6 rounded-3xl border border-glass-10">
              <div className="text-4xl font-bold text-white tracking-wide flex items-center justify-center gap-3">
                {state.currentQuestion.type === 'multiplication' ? (
                  <>
                    {state.currentQuestion.a} &middot; {state.currentQuestion.b}
                  </>
                ) : (
                  <span className="division">
                    <span className="dividend">{state.currentQuestion.a}</span>
                    <span className="divisor">{state.currentQuestion.b}</span>
                  </span>
                )}
                {' = ?'}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              {state.currentQuestion.options.map((opt, i) => (
                <button
                  key={`${opt}-${i}`}
                  className={`option-btn py-4 border-2 border-glass-15 rounded-xl bg-glass-6 text-glitch-text text-xl font-bold cursor-pointer transition-all ${state.buttonStates[opt] || ''}`}
                  disabled={state.buttonsDisabled}
                  onClick={() => onAnswer(opt)}
                >
                  {opt}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {state.showBonus && (
        <div className="bonus-star-overlay">
          <div className="bonus-star">⭐</div>
          <div className="bonus-text">+2</div>
        </div>
      )}
    </div>
  )
}
