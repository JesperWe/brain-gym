'use client'

import { Suspense, useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import type { GameRecord, GameScreen, Question } from './types'
import type { PlayerPresenceData, MultiplayerGameRecord, GameQuestion, GameAnswer, GameEnd, GameForfeit, GameResult, GameMessage } from '@/lib/multiplayer/types'
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

  const [playerName, setPlayerName] = useState('')
  const [playerAvatar, setPlayerAvatar] = useState('🦊')
  const [playerId, setPlayerId] = useState('')
  const [gameDuration, setGameDuration] = useState(isMultiplayer ? mpDuration : 1)
  const [currentScreen, setCurrentScreen] = useState<GameScreen>(isMultiplayer ? 'countdown' : 'setup')
  const [gameHistory, setGameHistory] = useState<GameRecord[]>([])

  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null)
  const [correctCount, setCorrectCount] = useState(0)
  const [totalCount, setTotalCount] = useState(0)
  const [questionAnswered, setQuestionAnswered] = useState(false)
  const [showBonus, setShowBonus] = useState(false)
  const [countdownValue, setCountdownValue] = useState(3)
  const [timeDisplay, setTimeDisplay] = useState('')
  const [buttonStates, setButtonStates] = useState<Record<number, 'correct' | 'wrong' | 'opponent-wrong' | undefined>>({})
  const [buttonsDisabled, setButtonsDisabled] = useState(false)

  // Multiplayer state
  const [opponentName, setOpponentName] = useState(mpOpponentName)
  const [opponentAvatar, setOpponentAvatar] = useState(mpOpponentAvatar)
  const [opponentScore, setOpponentScore] = useState(0)
  const [questionIndex, setQuestionIndex] = useState(0)
  const [forfeitBy, setForfeitBy] = useState<{ name: string; avatar: string } | null>(null)

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
  const currentScreenRef = useRef<GameScreen>(isMultiplayer ? 'countdown' : 'setup')
  const gameHistoryRef = useRef<GameRecord[]>([])

  // Multiplayer refs
  const gameChannelRef = useRef<Ably.RealtimeChannel | null>(null)
  const playersChannelRef = useRef<Ably.RealtimeChannel | null>(null)
  const playerIdRef = useRef('')
  const opponentScoreRef = useRef(0)
  const questionIndexRef = useRef(0)
  const opponentAnsweredRef = useRef(false)
  const myAnsweredRef = useRef(false)

  // Build full presence data object (Ably replaces entirely on update)
  function buildPresence(overrides: Partial<PlayerPresenceData> = {}): PlayerPresenceData {
    return {
      playerId: playerIdRef.current,
      name: playerName,
      avatar: playerAvatar,
      currentGame: null,
      currentOpponent: null,
      currentScore: correctCountRef.current,
      currentOpponentScore: opponentScoreRef.current,
      lastGame: null,
      ...overrides,
    }
  }

  // Sync refs with state
  useEffect(() => { questionAnsweredRef.current = questionAnswered }, [questionAnswered])
  useEffect(() => { correctCountRef.current = correctCount }, [correctCount])
  useEffect(() => { totalCountRef.current = totalCount }, [totalCount])
  useEffect(() => { currentQuestionRef.current = currentQuestion }, [currentQuestion])
  useEffect(() => { currentScreenRef.current = currentScreen }, [currentScreen])
  useEffect(() => { gameHistoryRef.current = gameHistory }, [gameHistory])
  useEffect(() => { opponentScoreRef.current = opponentScore }, [opponentScore])
  useEffect(() => { questionIndexRef.current = questionIndex }, [questionIndex])

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
      setGameHistory(parsed)
      gameHistoryRef.current = parsed
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
        // Only react to the opponent leaving, ignore our own or other players
        if (member.clientId !== mpOpponentId) return
        if (currentScreenRef.current === 'game' || currentScreenRef.current === 'countdown') {
          clearAllTimers()
          setForfeitBy({ name: mpOpponentName || 'Opponent', avatar: mpOpponentAvatar || '🤖' })
          updatePresence(playersChannel, buildPresence()).catch(() => {})
          setTimeout(() => { window.location.href = '/' }, 2000)
        }
      }
      const handlePresenceUpdate = (member: Ably.PresenceMessage) => {
        // Only react to the opponent's updates, ignore our own or other players
        if (member.clientId !== mpOpponentId) return
        const data = member.data as PlayerPresenceData
        if (data.currentGame === null && (currentScreenRef.current === 'game' || currentScreenRef.current === 'countdown')) {
          clearAllTimers()
          setForfeitBy({ name: data.name || mpOpponentName || 'Opponent', avatar: data.avatar || mpOpponentAvatar || '🤖' })
          updatePresence(playersChannel, buildPresence()).catch(() => {})
          setTimeout(() => { window.location.href = '/' }, 2000)
        }
      }
      playersChannel.presence.subscribe('update', handlePresenceUpdate)
      playersChannel.presence.subscribe('leave', handlePresenceLeave)

      // If multiplayer, auto-start countdown
      if (currentScreenRef.current === 'countdown') {
        resumeAudio()
        showCountdown()
      }
    } catch {
      // Ably not available
    }

    return () => {
      if (unsubMessages) unsubMessages()
      if (playersChannelRef.current) {
        playersChannelRef.current.presence.unsubscribe('update', handlePresenceUpdate)
        playersChannelRef.current.presence.unsubscribe('leave', handlePresenceLeave)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMultiplayer, playerId, mpChannel])

  function handleGameMessage(msg: GameMessage) {
    switch (msg.type) {
      case 'question': {
        const gq = msg as GameQuestion
        // Only guest receives questions from host
        if (mpRole === 'guest') {
          setCurrentQuestion(gq.question)
          currentQuestionRef.current = gq.question
          setQuestionIndex(gq.questionIndex)
          questionIndexRef.current = gq.questionIndex
          setQuestionAnswered(false)
          questionAnsweredRef.current = false
          myAnsweredRef.current = false
          opponentAnsweredRef.current = false
          setButtonStates({})
          setButtonsDisabled(false)
          questionStartTimeRef.current = Date.now()
          startQuestionTimerImmediate()
        }
        break
      }
      case 'answer': {
        const ga = msg as GameAnswer
        // Only process opponent's answers
        if (ga.playerId !== playerIdRef.current) {
          opponentAnsweredRef.current = true
          if (ga.isCorrect) {
            // Opponent got it right
            const newOpScore = opponentScoreRef.current + (ga.points || 1)
            opponentScoreRef.current = newOpScore
            setOpponentScore(newOpScore)

            // If we haven't answered yet, opponent beat us
            if (!myAnsweredRef.current) {
              setButtonStates((prev) => ({ ...prev, [ga.selectedValue]: 'correct' }))
              setButtonsDisabled(true)
              questionAnsweredRef.current = true
              myAnsweredRef.current = true
              setQuestionAnswered(true)
              const newTotal = totalCountRef.current + 1
              totalCountRef.current = newTotal
              setTotalCount(newTotal)
              if (questionTimerRef.current) cancelAnimationFrame(questionTimerRef.current)

              // Tell opponent we're done (locked out)
              if (gameChannelRef.current) {
                publishMessage(gameChannelRef.current, {
                  type: 'answer',
                  playerId: playerIdRef.current,
                  questionIndex: questionIndexRef.current,
                  selectedValue: -1,
                  isCorrect: false,
                  points: 0,
                  timestamp: Date.now(),
                })
              }
            }
          } else {
            // Opponent answered wrong — show their wrong answer on our grid
            if (ga.selectedValue >= 0) {
              setButtonStates((prev) => ({ ...prev, [ga.selectedValue]: 'opponent-wrong' }))
            }
          }

          // Both done — advance
          maybeAdvance()

          // Update presence with opponent score
          if (playersChannelRef.current) {
            updatePresence(playersChannelRef.current, buildPresence({
              currentGame: mpChannel,
              currentOpponentScore: opponentScoreRef.current,
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
        // Only process opponent's forfeit
        if (gf.playerId !== playerIdRef.current) {
          clearAllTimers()
          setForfeitBy({ name: gf.playerName, avatar: gf.playerAvatar })
          // Update presence to clear game
          if (playersChannelRef.current) {
            updatePresence(playersChannelRef.current, buildPresence()).catch(() => {})
          }
          // Redirect to home after 2 seconds
          setTimeout(() => {
            window.location.href = '/'
          }, 2000)
        }
        break
      }
    }
  }

  function maybeAdvance() {
    // Both answered — advance to next question (host only publishes)
    if (myAnsweredRef.current && opponentAnsweredRef.current) {
      scheduleNext(1500)
    }
  }

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
    if (isMultiplayer) {
      // Publish forfeit so opponent is notified
      if (gameChannelRef.current) {
        const forfeit: GameForfeit = {
          type: 'game-forfeit',
          playerId: playerIdRef.current,
          playerName,
          playerAvatar,
        }
        gameChannelRef.current.publish('game-event', forfeit).catch(() => {})
      }
      // Update presence to clear game
      if (playersChannelRef.current) {
        updatePresence(playersChannelRef.current, buildPresence()).catch(() => {})
      }
      window.location.href = '/'
      return
    }
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
        const duration = isMultiplayer ? mpDuration : gameDuration
        gameEndTimeRef.current = Date.now() + duration * 60 * 1000
        setCurrentScreen('game')

        // Set game end timer
        if (isMultiplayer && mpRole === 'host') {
          const gameTimer = setTimeout(() => {
            // Publish game-end
            if (gameChannelRef.current) {
              publishMessage(gameChannelRef.current, { type: 'game-end' })
            }
            endGame()
          }, duration * 60 * 1000)
          gameTimerRef.current = gameTimer
        } else if (!isMultiplayer) {
          // Single player doesn't need a separate game end timer - handled by scheduleNext
        }

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
    const idx = questionIndexRef.current + 1
    questionIndexRef.current = idx
    setQuestionIndex(idx)

    setCurrentQuestion(q)
    currentQuestionRef.current = q
    setQuestionAnswered(false)
    questionAnsweredRef.current = false
    myAnsweredRef.current = false
    opponentAnsweredRef.current = false
    setButtonStates({})
    setButtonsDisabled(false)
    questionStartTimeRef.current = Date.now()
    startQuestionTimerImmediate()

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

  function startQuestionTimerImmediate() {
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
      if (!questionAnsweredRef.current) {
        questionTimerRef.current = requestAnimationFrame(tick)
      }
    }
    questionTimerRef.current = requestAnimationFrame(tick)
  }

  function onTimeout() {
    if (questionAnsweredRef.current) return
    questionAnsweredRef.current = true
    myAnsweredRef.current = true
    setQuestionAnswered(true)
    const newTotal = totalCountRef.current + 1
    totalCountRef.current = newTotal
    setTotalCount(newTotal)
    playTimeoutSound()
    const q = currentQuestionRef.current!
    const states: Record<number, 'correct' | 'wrong' | 'opponent-wrong' | undefined> = {}
    states[q.answer] = 'correct'
    setButtonStates((prev) => ({ ...prev, ...states }))
    setButtonsDisabled(true)

    if (isMultiplayer && gameChannelRef.current) {
      // Publish that we timed out (wrong answer)
      const ga: GameAnswer = {
        type: 'answer',
        playerId: playerIdRef.current,
        questionIndex: questionIndexRef.current,
        selectedValue: -1,
        isCorrect: false,
        points: 0,
        timestamp: Date.now(),
      }
      publishMessage(gameChannelRef.current, ga)
    }

    if (isMultiplayer) {
      maybeAdvance()
      // If opponent hasn't answered yet, wait for them
      if (!opponentAnsweredRef.current) {
        // They'll trigger advance when they answer
      }
    } else {
      scheduleNext(3000)
    }
  }

  function onAnswer(value: number) {
    if (questionAnsweredRef.current) return
    questionAnsweredRef.current = true
    myAnsweredRef.current = true
    setQuestionAnswered(true)
    if (questionTimerRef.current) cancelAnimationFrame(questionTimerRef.current)

    const newTotal = totalCountRef.current + 1
    totalCountRef.current = newTotal
    setTotalCount(newTotal)

    const q = currentQuestionRef.current!
    const states: Record<number, 'correct' | 'wrong' | 'opponent-wrong' | undefined> = {}

    let isCorrect = false
    let points = 0

    if (value === q.answer) {
      isCorrect = true
      const elapsed = Date.now() - questionStartTimeRef.current
      const isBonus = q.isHardQuestion && elapsed < 3000
      points = isBonus ? 2 : 1
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

    setButtonStates((prev) => ({ ...prev, ...states }))
    setButtonsDisabled(true)

    // Publish answer in multiplayer
    if (isMultiplayer && gameChannelRef.current) {
      const ga: GameAnswer = {
        type: 'answer',
        playerId: playerIdRef.current,
        questionIndex: questionIndexRef.current,
        selectedValue: value,
        isCorrect,
        points,
        timestamp: Date.now(),
      }
      publishMessage(gameChannelRef.current, ga)

      // Update presence with score
      if (playersChannelRef.current) {
        updatePresence(playersChannelRef.current, buildPresence({
          currentGame: mpChannel,
          currentScore: correctCountRef.current,
        })).catch(() => {})
      }

      maybeAdvance()
    } else {
      scheduleNext(value === q.answer ? 1500 : 3000)
    }
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
    if (gameTimerRef.current && !isMultiplayer) clearTimeout(gameTimerRef.current)

    const timer = setTimeout(() => {
      if (Date.now() >= gameEndTimeRef.current) {
        if (isMultiplayer && mpRole === 'host' && gameChannelRef.current) {
          publishMessage(gameChannelRef.current, { type: 'game-end' })
        }
        endGame()
      } else if (isMultiplayer && mpRole === 'host') {
        doNextQuestion()
      } else if (!isMultiplayer) {
        doNextQuestion()
      }
      // Guest waits for host to publish next question
    }, delay)

    if (!isMultiplayer) {
      if (gameTimerRef.current) clearTimeout(gameTimerRef.current)
      gameTimerRef.current = timer
    }
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
      duration: isMultiplayer ? mpDuration : gameDuration,
      correct,
      total,
      percent,
    }
    const newHistory = [...gameHistoryRef.current, record]
    gameHistoryRef.current = newHistory
    setGameHistory(newHistory)
    localStorage.setItem('mathsHistory', JSON.stringify(newHistory))

    // Save multiplayer record to LiveMap
    if (isMultiplayer) {
      const mpRecord: MultiplayerGameRecord = {
        finishedAt: Date.now(),
        opponent: opponentName || 'Opponent',
        opponentAvatar: opponentAvatar || '🤖',
        opponentId: '',
        score: correct,
        opponentScore: opponentScoreRef.current,
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
          player1Id: playerIdRef.current,
          player1Name: playerName,
          player1Avatar: playerAvatar,
          player1Score: correct,
          player2Id: mpOpponentId,
          player2Name: opponentName,
          player2Avatar: opponentAvatar,
          player2Score: opponentScoreRef.current,
          channel: mpChannel,
        }
        publishMessage(gameChannelRef.current, result)
      }

      // Update presence with lastGame
      if (playersChannelRef.current) {
        updatePresence(playersChannelRef.current, buildPresence({
          lastGame: {
            opponent: mpRecord.opponent,
            score: mpRecord.score,
            opponentScore: mpRecord.opponentScore,
            won: mpRecord.score > mpRecord.opponentScore,
          },
        })).catch(() => {})
      }
    }

    setCurrentScreen('results')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerName, playerAvatar, gameDuration, isMultiplayer, mpDuration, opponentName, opponentAvatar])

  // Publish forfeit on page unload (back button, tab close, etc.)
  useEffect(() => {
    if (!isMultiplayer) return

    function handleBeforeUnload() {
      // Best-effort: publish forfeit message before leaving
      if (gameChannelRef.current && currentScreenRef.current !== 'results') {
        const forfeit: GameForfeit = {
          type: 'game-forfeit',
          playerId: playerIdRef.current,
          playerName,
          playerAvatar,
        }
        // Use publish (fire-and-forget, may not complete)
        gameChannelRef.current.publish('game-event', forfeit).catch(() => {})
      }
      // Update presence to clear game
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

  // ── Forfeit overlay ──
  if (forfeitBy) {
    return (
      <div className="glitch-game">
        <div className="w-full min-w-[500px] max-w-[520px] px-4 py-6 text-center">
          <div className="text-6xl mb-4">{forfeitBy.avatar}</div>
          <h1 className="text-2xl font-bold text-white mb-2">{forfeitBy.name} gave up!</h1>
          <p className="text-glitch-muted">Returning to home...</p>
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

    if (isMultiplayer) {
      const myScore = correctCountRef.current
      const oppScore = opponentScoreRef.current
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
            onClick={() => setCurrentScreen('setup')}
          >
            Play Again!
          </button>

          <button
            className="block w-full p-3 border-2 border-glass-15 rounded-xl bg-transparent text-glitch-text text-base font-semibold cursor-pointer transition-all mb-4 hover:bg-glass-12"
            onClick={() => { window.location.href = '/' }}
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
