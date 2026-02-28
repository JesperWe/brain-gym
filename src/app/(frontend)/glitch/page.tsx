'use client'

import { Suspense, useState, useEffect, useReducer, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import type { GameRecord } from './types'
import type { GameMessage, GameQuestion, GameAnswer, GameForfeit, GameResult, MultiplayerGameRecord, GameInvite, GameInviteResponse } from '@/lib/multiplayer/types'
import { generateQuestion } from './questions'
import { resumeAudio, playSound } from './sound'
import type * as Ably from 'ably'
import { getAblyClient } from '@/lib/multiplayer/ably-client'
import { updatePresence } from '@/lib/multiplayer/presence'
import { getHistoryChannel, saveGameRecord } from '@/lib/multiplayer/game-history'
import { gameReducer, createInitialState } from './game-reducer'
import type { GameState } from './game-reducer'
import { useGameTimers } from './use-game-timers'
import { useMultiplayer } from './use-multiplayer'
import { SetupScreen, CountdownScreen, ForfeitScreen, ResultsScreen, GameScreen } from './screens'
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

  // Player identity
  const [playerName, setPlayerName] = useState('')
  const [playerAvatar, setPlayerAvatar] = useState('🦊')
  const [playerId, setPlayerId] = useState('')
  const [gameDuration, setGameDuration] = useState(isMultiplayer ? mpDuration : 1)
  const [timeDisplay, setTimeDisplay] = useState('')

  // ── State machine ──
  const [state, dispatch] = useReducer(gameReducer, isMultiplayer, createInitialState)
  const stateRef = useRef<GameState>(state)
  useEffect(() => { stateRef.current = state })

  // ── Hooks ──
  const timers = useGameTimers()

  const mp = useMultiplayer({
    isMultiplayer,
    mpChannel,
    mpRole,
    mpOpponentId,
    mpOpponentName,
    mpOpponentAvatar,
    playerId,
    playerName,
    playerAvatar,
    stateRef,
    dispatch,
    clearAllTimers: timers.clearAllTimers,
    onMessage: handleGameMessage,
    onReady: () => {
      resumeAudio()
      timers.showCountdown({
        isMultiplayer,
        mpDuration,
        gameDuration,
        dispatch,
        onDone: doNextQuestion,
      })
    },
  })

  // Load player info and history from localStorage
  useEffect(() => {
    try {
      const player = localStorage.getItem('mathsPlayer')
      if (player) {
        const parsed = JSON.parse(player)
        if (parsed.name) setPlayerName(parsed.name)
        if (parsed.avatar) setPlayerAvatar(parsed.avatar)
        if (parsed.playerId) {
          setPlayerId(parsed.playerId)
          mp.playerIdRef.current = parsed.playerId
        }
      }
    } catch {}
    const stored = localStorage.getItem('mathsHistory')
    if (stored) {
      dispatch({ type: 'LOAD_HISTORY', history: JSON.parse(stored) })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keep presence alive during single-player games so other players can see us
  useEffect(() => {
    if (isMultiplayer || !playerId) return

    let channel: Ably.RealtimeChannel | null = null
    try {
      const client = getAblyClient(playerId)
      channel = client.channels.get('glitch-players')

      // Mark ourselves as in a solo game
      updatePresence(channel, {
        playerId,
        name: playerName,
        avatar: playerAvatar,
        currentGame: 'solo',
        currentOpponent: null,
        currentScore: 0,
        currentOpponentScore: 0,
        lastGame: null,
      }).catch(() => {})

      // Auto-deny any incoming challenges while in solo game
      const handler = (msg: Ably.InboundMessage) => {
        const data = msg.data as GameInvite & { toPlayerId?: string }
        if (data.type !== 'invite' || data.toPlayerId !== playerId) return
        const deny: GameInviteResponse & { toPlayerId: string } = {
          type: 'invite-response',
          accepted: false,
          fromPlayerId: playerId,
          fromName: playerName,
          fromAvatar: playerAvatar,
          toPlayerId: data.fromPlayerId,
        }
        channel?.publish('game-event', deny).catch(() => {})
      }
      channel.subscribe('game-event', handler)

      return () => {
        channel?.unsubscribe('game-event', handler)
        // Clear solo marker — home page will re-enter presence fresh
        if (channel) {
          updatePresence(channel, {
            playerId,
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
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerId])

  function handleGameMessage(msg: GameMessage) {
    switch (msg.type) {
      case 'question': {
        const gq = msg as GameQuestion
        if (mpRole === 'guest') {
          dispatch({ type: 'NEW_QUESTION', question: gq.question, questionIndex: gq.questionIndex })
          timers.startQuestionTimer(onTimeout)
        }
        break
      }
      case 'answer': {
        const ga = msg as GameAnswer
        if (ga.playerId !== mp.playerIdRef.current) {
          const s = stateRef.current

          dispatch({
            type: 'OPPONENT_ANSWER',
            selectedValue: ga.selectedValue,
            isCorrect: ga.isCorrect,
            points: ga.points || 1,
          })

          // If opponent correct and I was still waiting → lockout
          if (ga.isCorrect && s.questionPhase === 'waiting') {
            if (timers.questionTimerRef.current) cancelAnimationFrame(timers.questionTimerRef.current)
            mp.publish({
              type: 'answer',
              playerId: mp.playerIdRef.current,
              questionIndex: s.questionIndex,
              selectedValue: -1,
              isCorrect: false,
              points: 0,
              timestamp: Date.now(),
            })
          }

          // Update presence with opponent score
          const updated = stateRef.current
          mp.updateScore({
            currentGame: mpChannel,
            currentOpponentScore: updated.opponentScore,
          })
        }
        break
      }
      case 'game-end': {
        endGame()
        break
      }
      case 'game-forfeit': {
        const gf = msg as GameForfeit
        if (gf.playerId !== mp.playerIdRef.current) {
          mp.handleOpponentForfeit({ name: gf.playerName, avatar: gf.playerAvatar })
        }
        break
      }
    }
  }

  // Auto-advance when both answered
  useEffect(() => {
    if (state.phase !== 'game' || state.questionPhase !== 'both-answered') return

    const delay = isMultiplayer ? 1500 : (
      state.currentQuestion && state.buttonStates[state.currentQuestion.answer] === 'correct'
        && !Object.values(state.buttonStates).includes('wrong')
        ? 1500 : 3000
    )

    const timer = setTimeout(() => {
      const s = stateRef.current
      if (s.phase !== 'game') return
      if (Date.now() >= s.gameEndTime) {
        if (isMultiplayer && mpRole === 'host') {
          mp.publish({ type: 'game-end' })
        }
        endGame()
      } else if (!isMultiplayer || mpRole === 'host') {
        doNextQuestion()
      }
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
        timers.clockTimerRef.current = setTimeout(updateClock, 250)
      }
    }
    updateClock()

    return () => {
      if (timers.clockTimerRef.current) clearTimeout(timers.clockTimerRef.current)
    }
  }, [state.phase, state.currentQuestion])

  // ── Game actions ──

  function quitGame() {
    timers.clearAllTimers()
    if (isMultiplayer) {
      const forfeit: GameForfeit = {
        type: 'game-forfeit',
        playerId: mp.playerIdRef.current,
        playerName,
        playerAvatar,
      }
      if (mp.gameChannelRef.current) {
        mp.gameChannelRef.current.publish('game-event', forfeit).catch(() => {})
      }
      mp.updateScore({})
      window.location.href = '/'
      return
    }
    window.location.href = '/'
  }

  function startGame() {
    resumeAudio()
    dispatch({ type: 'START_GAME' })
    timers.showCountdown({
      isMultiplayer,
      mpDuration,
      gameDuration,
      dispatch,
      onDone: doNextQuestion,
    })
  }

  function doNextQuestion() {
    const q = generateQuestion()
    const s = stateRef.current
    const idx = s.questionIndex + 1

    dispatch({ type: 'NEW_QUESTION', question: q, questionIndex: idx })
    timers.startQuestionTimer(onTimeout)

    if (isMultiplayer && mpRole === 'host') {
      const gq: GameQuestion = { type: 'question', questionIndex: idx, question: q }
      mp.publish(gq)
    }
  }

  function onTimeout() {
    const s = stateRef.current
    if (s.questionPhase !== 'waiting' && s.questionPhase !== 'opponent-answered') return

    dispatch({ type: 'TIMEOUT', isMultiplayer })
    playSound('timeout')

    if (isMultiplayer) {
      mp.publish({
        type: 'answer',
        playerId: mp.playerIdRef.current,
        questionIndex: s.questionIndex,
        selectedValue: -1,
        isCorrect: false,
        points: 0,
        timestamp: Date.now(),
      })
    }
  }

  function onAnswer(value: number) {
    const s = stateRef.current
    if (s.questionPhase !== 'waiting' && s.questionPhase !== 'opponent-answered') return
    if (timers.questionTimerRef.current) cancelAnimationFrame(timers.questionTimerRef.current)

    const q = s.currentQuestion
    if (!q) return
    const isCorrect = value === q.answer
    const elapsed = Date.now() - s.questionStartTime
    const isBonus = q.isHardQuestion && elapsed < 3000
    const points = isCorrect ? (isBonus ? 2 : 1) : 0

    dispatch({ type: 'MY_ANSWER', value, isCorrect, points, isMultiplayer })

    if (isCorrect) {
      if (isBonus) timers.triggerBonus(dispatch)
      else playSound('correct')
    } else {
      playSound('wrong')
    }

    if (isMultiplayer) {
      mp.publish({
        type: 'answer',
        playerId: mp.playerIdRef.current,
        questionIndex: s.questionIndex,
        selectedValue: value,
        isCorrect,
        points,
        timestamp: Date.now(),
      })

      const updated = stateRef.current
      mp.updateScore({
        currentGame: mpChannel,
        currentScore: updated.correctCount,
      })
    }
  }

  function endGame() {
    const s = stateRef.current
    if (s.phase !== 'game') return

    timers.clearAllTimers()
    playSound('gameOver')

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

    if (isMultiplayer) {
      const mpRecord: MultiplayerGameRecord = {
        finishedAt: Date.now(),
        opponent: mpOpponentName || 'Opponent',
        opponentAvatar: mpOpponentAvatar || '🤖',
        opponentId: '',
        score: correct,
        opponentScore: s.opponentScore,
      }

      try {
        const client = getAblyClient(mp.playerIdRef.current)
        const historyChannel = getHistoryChannel(client)
        saveGameRecord(historyChannel, mp.playerIdRef.current, mpRecord).catch(() => {})
      } catch {}

      if (mpRole === 'host') {
        const result: GameResult = {
          type: 'game-result',
          gameId: crypto.randomUUID(),
          player1Id: mp.playerIdRef.current,
          player1Name: playerName,
          player1Avatar: playerAvatar,
          player1Score: correct,
          player2Id: mpOpponentId,
          player2Name: mpOpponentName,
          player2Avatar: mpOpponentAvatar,
          player2Score: s.opponentScore,
          channel: mpChannel,
        }
        mp.publish(result)
      }

      mp.updateScore({
        currentGame: mpChannel,
        lastGame: {
          opponent: mpRecord.opponent,
          score: mpRecord.score,
          opponentScore: mpRecord.opponentScore,
          won: mpRecord.score > mpRecord.opponentScore,
        },
      })
    }
  }

  // ── Render ──

  if (state.phase === 'setup') {
    return (
      <SetupScreen
        playerName={playerName}
        playerAvatar={playerAvatar}
        gameDuration={gameDuration}
        gameHistory={state.gameHistory}
        onSetDuration={setGameDuration}
        onStart={startGame}
      />
    )
  }

  if (state.phase === 'forfeit' && state.forfeitBy) {
    return <ForfeitScreen forfeitBy={state.forfeitBy} />
  }

  if (state.phase === 'countdown') {
    return <CountdownScreen countdownValue={state.countdownValue} />
  }

  if (state.phase === 'results') {
    return (
      <ResultsScreen
        isMultiplayer={isMultiplayer}
        playerAvatar={playerAvatar}
        playerName={playerName}
        opponentAvatar={mpOpponentAvatar}
        opponentName={mpOpponentName}
        correctCount={state.correctCount}
        opponentScore={state.opponentScore}
        gameHistory={state.gameHistory}
        onPlayAgain={() => dispatch({ type: 'RESET_TO_SETUP' })}
        onGoHome={() => { window.location.href = '/' }}
      />
    )
  }

  return (
    <GameScreen
      playerAvatar={playerAvatar}
      playerName={playerName}
      correctCount={state.correctCount}
      totalCount={state.totalCount}
      opponentScore={state.opponentScore}
      isMultiplayer={isMultiplayer}
      timeDisplay={timeDisplay}
      currentQuestion={state.currentQuestion}
      buttonStates={state.buttonStates}
      buttonsDisabled={state.buttonsDisabled}
      showBonus={state.showBonus}
      timerBarRef={timers.timerBarRef}
      onAnswer={onAnswer}
      onQuit={quitGame}
    />
  )
}
