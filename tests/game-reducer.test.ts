import { describe, it, expect } from 'vitest'
import {
  gameReducer,
  createInitialState,
  type GameState,
  type GameAction,
} from '@/app/(frontend)/glitch/game-reducer'
import type { Question, GameRecord } from '@/app/(frontend)/glitch/types'

// ── Helpers ──

const question: Question = {
  a: 6,
  b: 7,
  type: 'multiplication',
  answer: 42,
  options: [36, 42, 48, 54, 40, 35],
  isHardQuestion: false,
}

const hardQuestion: Question = {
  a: 13,
  b: 14,
  type: 'multiplication',
  answer: 182,
  options: [168, 182, 196, 156, 170, 184],
  isHardQuestion: true,
}

const record: GameRecord = {
  name: 'Test',
  avatar: '🦊',
  date: '2026-02-28',
  duration: 1,
  correct: 5,
  total: 10,
  percent: 50,
}

function gameState(overrides: Partial<GameState> = {}): GameState {
  return { ...createInitialState(false), ...overrides }
}

function inGame(overrides: Partial<GameState> = {}): GameState {
  return gameState({
    phase: 'game',
    questionPhase: 'waiting',
    currentQuestion: question,
    questionIndex: 1,
    gameEndTime: Date.now() + 60000,
    ...overrides,
  })
}

function apply(state: GameState, ...actions: GameAction[]): GameState {
  return actions.reduce((s, a) => gameReducer(s, a), state)
}

// ── Tests ──

describe('createInitialState', () => {
  it('single-player starts in setup phase', () => {
    const s = createInitialState(false)
    expect(s.phase).toBe('setup')
    expect(s.questionPhase).toBe('waiting')
    expect(s.correctCount).toBe(0)
    expect(s.gameHistory).toEqual([])
  })

  it('multiplayer starts in countdown phase', () => {
    const s = createInitialState(true)
    expect(s.phase).toBe('countdown')
  })
})

describe('START_GAME', () => {
  it('transitions setup → countdown', () => {
    const s = apply(gameState(), { type: 'START_GAME' })
    expect(s.phase).toBe('countdown')
    expect(s.countdownValue).toBe(3)
    expect(s.correctCount).toBe(0)
    expect(s.totalCount).toBe(0)
  })

  it('resets scores when starting a new game', () => {
    const s = apply(
      gameState({ phase: 'setup', correctCount: 5, totalCount: 10 }),
      { type: 'START_GAME' },
    )
    expect(s.correctCount).toBe(0)
    expect(s.totalCount).toBe(0)
    expect(s.opponentScore).toBe(0)
    expect(s.questionIndex).toBe(0)
  })

  it('is a no-op from non-setup phases', () => {
    const s = inGame()
    expect(apply(s, { type: 'START_GAME' })).toBe(s)
  })
})

describe('COUNTDOWN_TICK', () => {
  it('updates countdown value', () => {
    const s = apply(
      gameState({ phase: 'countdown' }),
      { type: 'COUNTDOWN_TICK', value: 2 },
    )
    expect(s.countdownValue).toBe(2)
  })

  it('is a no-op outside countdown', () => {
    const s = inGame()
    expect(apply(s, { type: 'COUNTDOWN_TICK', value: 1 })).toBe(s)
  })
})

describe('COUNTDOWN_DONE', () => {
  it('transitions countdown → game with endTime', () => {
    const endTime = Date.now() + 60000
    const s = apply(
      gameState({ phase: 'countdown' }),
      { type: 'COUNTDOWN_DONE', gameEndTime: endTime },
    )
    expect(s.phase).toBe('game')
    expect(s.gameEndTime).toBe(endTime)
  })

  it('is a no-op outside countdown', () => {
    const s = gameState({ phase: 'setup' })
    expect(apply(s, { type: 'COUNTDOWN_DONE', gameEndTime: 0 })).toBe(s)
  })
})

describe('NEW_QUESTION', () => {
  it('sets question and resets question phase', () => {
    const s = apply(
      inGame({ questionPhase: 'both-answered', buttonsDisabled: true, buttonStates: { 42: 'correct' } }),
      { type: 'NEW_QUESTION', question: question, questionIndex: 2 },
    )
    expect(s.questionPhase).toBe('waiting')
    expect(s.currentQuestion).toBe(question)
    expect(s.questionIndex).toBe(2)
    expect(s.buttonStates).toEqual({})
    expect(s.buttonsDisabled).toBe(false)
  })

  it('is a no-op outside game phase', () => {
    const s = gameState({ phase: 'results' })
    expect(apply(s, { type: 'NEW_QUESTION', question: question, questionIndex: 1 })).toBe(s)
  })
})

describe('MY_ANSWER — single-player', () => {
  it('correct answer: goes to both-answered, increments score', () => {
    const s = apply(
      inGame(),
      { type: 'MY_ANSWER', value: 42, isCorrect: true, points: 1, isMultiplayer: false },
    )
    expect(s.questionPhase).toBe('both-answered')
    expect(s.correctCount).toBe(1)
    expect(s.totalCount).toBe(1)
    expect(s.buttonStates[42]).toBe('correct')
    expect(s.buttonsDisabled).toBe(true)
  })

  it('wrong answer: goes to both-answered, no score increment', () => {
    const s = apply(
      inGame(),
      { type: 'MY_ANSWER', value: 36, isCorrect: false, points: 0, isMultiplayer: false },
    )
    expect(s.questionPhase).toBe('both-answered')
    expect(s.correctCount).toBe(0)
    expect(s.totalCount).toBe(1)
    expect(s.buttonStates[36]).toBe('wrong')
    expect(s.buttonStates[42]).toBe('correct')
  })

  it('bonus points awarded for hard question', () => {
    const s = apply(
      inGame({ currentQuestion: hardQuestion }),
      { type: 'MY_ANSWER', value: 182, isCorrect: true, points: 2, isMultiplayer: false },
    )
    expect(s.correctCount).toBe(2)
  })

  it('is a no-op when already answered', () => {
    const s = inGame({ questionPhase: 'both-answered' })
    expect(apply(s, { type: 'MY_ANSWER', value: 42, isCorrect: true, points: 1, isMultiplayer: false })).toBe(s)
  })

  it('is a no-op when timed out', () => {
    const s = inGame({ questionPhase: 'timed-out' })
    expect(apply(s, { type: 'MY_ANSWER', value: 42, isCorrect: true, points: 1, isMultiplayer: false })).toBe(s)
  })
})

describe('MY_ANSWER — multiplayer', () => {
  it('goes to me-answered when opponent has not answered', () => {
    const s = apply(
      inGame(),
      { type: 'MY_ANSWER', value: 42, isCorrect: true, points: 1, isMultiplayer: true },
    )
    expect(s.questionPhase).toBe('me-answered')
    expect(s.correctCount).toBe(1)
  })

  it('goes to both-answered when opponent already answered', () => {
    const s = apply(
      inGame({ questionPhase: 'opponent-answered' }),
      { type: 'MY_ANSWER', value: 42, isCorrect: true, points: 1, isMultiplayer: true },
    )
    expect(s.questionPhase).toBe('both-answered')
  })
})

describe('OPPONENT_ANSWER', () => {
  it('opponent wrong while I am waiting → opponent-answered', () => {
    const s = apply(
      inGame(),
      { type: 'OPPONENT_ANSWER', selectedValue: 36, isCorrect: false, points: 0 },
    )
    expect(s.questionPhase).toBe('opponent-answered')
    expect(s.opponentScore).toBe(0)
    expect(s.buttonStates[36]).toBe('opponent-wrong')
    expect(s.buttonsDisabled).toBe(false) // I can still answer
  })

  it('opponent correct while I am waiting → lockout (both-answered)', () => {
    const s = apply(
      inGame(),
      { type: 'OPPONENT_ANSWER', selectedValue: 42, isCorrect: true, points: 1 },
    )
    expect(s.questionPhase).toBe('both-answered')
    expect(s.opponentScore).toBe(1)
    expect(s.totalCount).toBe(1) // locked out counts as question
    expect(s.buttonStates[42]).toBe('correct')
    expect(s.buttonsDisabled).toBe(true)
  })

  it('opponent answers after I answered → both-answered', () => {
    const s = apply(
      inGame({ questionPhase: 'me-answered' }),
      { type: 'OPPONENT_ANSWER', selectedValue: 42, isCorrect: true, points: 1 },
    )
    expect(s.questionPhase).toBe('both-answered')
    expect(s.opponentScore).toBe(1)
  })

  it('opponent answers after I timed out → both-answered', () => {
    const s = apply(
      inGame({ questionPhase: 'timed-out', totalCount: 1 }),
      { type: 'OPPONENT_ANSWER', selectedValue: 36, isCorrect: false, points: 0 },
    )
    expect(s.questionPhase).toBe('both-answered')
  })

  it('is a no-op when already both-answered', () => {
    const s = inGame({ questionPhase: 'both-answered' })
    expect(apply(s, { type: 'OPPONENT_ANSWER', selectedValue: 42, isCorrect: true, points: 1 })).toBe(s)
  })

  it('is a no-op outside game phase', () => {
    const s = gameState({ phase: 'results' })
    expect(apply(s, { type: 'OPPONENT_ANSWER', selectedValue: 42, isCorrect: true, points: 1 })).toBe(s)
  })

  it('opponent wrong with selectedValue -1 does not mark buttons', () => {
    const s = apply(
      inGame({ questionPhase: 'me-answered' }),
      { type: 'OPPONENT_ANSWER', selectedValue: -1, isCorrect: false, points: 0 },
    )
    expect(s.questionPhase).toBe('both-answered')
    expect(Object.keys(s.buttonStates)).toHaveLength(0)
  })
})

describe('TIMEOUT', () => {
  it('single-player: waiting → both-answered', () => {
    const s = apply(
      inGame(),
      { type: 'TIMEOUT', isMultiplayer: false },
    )
    expect(s.questionPhase).toBe('both-answered')
    expect(s.totalCount).toBe(1)
    expect(s.buttonStates[42]).toBe('correct')
    expect(s.buttonsDisabled).toBe(true)
  })

  it('multiplayer: waiting → timed-out', () => {
    const s = apply(
      inGame(),
      { type: 'TIMEOUT', isMultiplayer: true },
    )
    expect(s.questionPhase).toBe('timed-out')
    expect(s.totalCount).toBe(1)
  })

  it('multiplayer: opponent-answered → both-answered', () => {
    const s = apply(
      inGame({ questionPhase: 'opponent-answered' }),
      { type: 'TIMEOUT', isMultiplayer: true },
    )
    expect(s.questionPhase).toBe('both-answered')
  })

  it('is a no-op when already answered', () => {
    const s = inGame({ questionPhase: 'me-answered' })
    expect(apply(s, { type: 'TIMEOUT', isMultiplayer: true })).toBe(s)
  })

  it('is a no-op when already both-answered', () => {
    const s = inGame({ questionPhase: 'both-answered' })
    expect(apply(s, { type: 'TIMEOUT', isMultiplayer: false })).toBe(s)
  })
})

describe('END_GAME', () => {
  it('transitions game → results and appends record', () => {
    const s = apply(
      inGame({ gameHistory: [] }),
      { type: 'END_GAME', record },
    )
    expect(s.phase).toBe('results')
    expect(s.gameHistory).toHaveLength(1)
    expect(s.gameHistory[0]).toBe(record)
  })

  it('appends to existing history', () => {
    const existing: GameRecord = { ...record, correct: 3, percent: 30 }
    const s = apply(
      inGame({ gameHistory: [existing] }),
      { type: 'END_GAME', record },
    )
    expect(s.gameHistory).toHaveLength(2)
    expect(s.gameHistory[0]).toBe(existing)
    expect(s.gameHistory[1]).toBe(record)
  })

  it('is a no-op from results (prevents double endGame)', () => {
    const s = gameState({ phase: 'results', gameHistory: [record] })
    const result = apply(s, { type: 'END_GAME', record })
    expect(result).toBe(s)
    expect(result.gameHistory).toHaveLength(1)
  })

  it('is a no-op from setup', () => {
    const s = gameState({ phase: 'setup' })
    expect(apply(s, { type: 'END_GAME', record })).toBe(s)
  })

  it('is a no-op from forfeit', () => {
    const s = gameState({ phase: 'forfeit' })
    expect(apply(s, { type: 'END_GAME', record })).toBe(s)
  })
})

describe('FORFEIT', () => {
  it('transitions game → forfeit', () => {
    const by = { name: 'Alice', avatar: '🦊' }
    const s = apply(inGame(), { type: 'FORFEIT', by })
    expect(s.phase).toBe('forfeit')
    expect(s.forfeitBy).toEqual(by)
  })

  it('transitions countdown → forfeit', () => {
    const by = { name: 'Bob', avatar: '🐻' }
    const s = apply(
      gameState({ phase: 'countdown' }),
      { type: 'FORFEIT', by },
    )
    expect(s.phase).toBe('forfeit')
    expect(s.forfeitBy).toEqual(by)
  })

  it('is a no-op from results', () => {
    const s = gameState({ phase: 'results' })
    expect(apply(s, { type: 'FORFEIT', by: { name: 'X', avatar: '🤖' } })).toBe(s)
  })

  it('is a no-op from setup', () => {
    const s = gameState()
    expect(apply(s, { type: 'FORFEIT', by: { name: 'X', avatar: '🤖' } })).toBe(s)
  })
})

describe('RESET_TO_SETUP', () => {
  it('transitions any phase → setup', () => {
    const s = apply(
      gameState({ phase: 'results', showBonus: true, forfeitBy: { name: 'X', avatar: '🤖' } }),
      { type: 'RESET_TO_SETUP' },
    )
    expect(s.phase).toBe('setup')
    expect(s.questionPhase).toBe('waiting')
    expect(s.showBonus).toBe(false)
    expect(s.forfeitBy).toBeNull()
  })

  it('preserves game history', () => {
    const s = apply(
      gameState({ phase: 'results', gameHistory: [record] }),
      { type: 'RESET_TO_SETUP' },
    )
    expect(s.gameHistory).toHaveLength(1)
  })
})

describe('SHOW_BONUS / HIDE_BONUS', () => {
  it('toggles showBonus', () => {
    let s = apply(inGame(), { type: 'SHOW_BONUS' })
    expect(s.showBonus).toBe(true)
    s = apply(s, { type: 'HIDE_BONUS' })
    expect(s.showBonus).toBe(false)
  })
})

describe('LOAD_HISTORY', () => {
  it('sets game history', () => {
    const history = [record]
    const s = apply(gameState(), { type: 'LOAD_HISTORY', history })
    expect(s.gameHistory).toBe(history)
  })
})

// ── Integration scenarios ──

describe('Single-player full game flow', () => {
  it('setup → countdown → game → answer → next question → end', () => {
    let s = createInitialState(false)
    expect(s.phase).toBe('setup')

    s = apply(s, { type: 'START_GAME' })
    expect(s.phase).toBe('countdown')

    s = apply(s,
      { type: 'COUNTDOWN_TICK', value: 2 },
      { type: 'COUNTDOWN_TICK', value: 1 },
      { type: 'COUNTDOWN_DONE', gameEndTime: Date.now() + 60000 },
    )
    expect(s.phase).toBe('game')

    s = apply(s, { type: 'NEW_QUESTION', question: question, questionIndex: 1 })
    expect(s.questionPhase).toBe('waiting')

    // Answer correctly
    s = apply(s, { type: 'MY_ANSWER', value: 42, isCorrect: true, points: 1, isMultiplayer: false })
    expect(s.questionPhase).toBe('both-answered')
    expect(s.correctCount).toBe(1)

    // Next question
    s = apply(s, { type: 'NEW_QUESTION', question: question, questionIndex: 2 })
    expect(s.questionPhase).toBe('waiting')
    expect(s.questionIndex).toBe(2)

    // Answer wrong
    s = apply(s, { type: 'MY_ANSWER', value: 36, isCorrect: false, points: 0, isMultiplayer: false })
    expect(s.questionPhase).toBe('both-answered')
    expect(s.correctCount).toBe(1)
    expect(s.totalCount).toBe(2)

    // End game
    s = apply(s, { type: 'END_GAME', record })
    expect(s.phase).toBe('results')

    // Play again
    s = apply(s, { type: 'RESET_TO_SETUP' })
    expect(s.phase).toBe('setup')
    expect(s.gameHistory).toHaveLength(1)
  })
})

describe('Multiplayer full game flow', () => {
  it('host: countdown → answer → opponent answers → next question → end', () => {
    let s = createInitialState(true)
    expect(s.phase).toBe('countdown')

    s = apply(s, { type: 'COUNTDOWN_DONE', gameEndTime: Date.now() + 60000 })
    s = apply(s, { type: 'NEW_QUESTION', question: question, questionIndex: 1 })

    // I answer correctly
    s = apply(s, { type: 'MY_ANSWER', value: 42, isCorrect: true, points: 1, isMultiplayer: true })
    expect(s.questionPhase).toBe('me-answered')

    // Opponent answers wrong
    s = apply(s, { type: 'OPPONENT_ANSWER', selectedValue: 36, isCorrect: false, points: 0 })
    expect(s.questionPhase).toBe('both-answered')

    // Next question
    s = apply(s, { type: 'NEW_QUESTION', question: question, questionIndex: 2 })

    // Opponent answers correctly first
    s = apply(s, { type: 'OPPONENT_ANSWER', selectedValue: 42, isCorrect: true, points: 1 })
    expect(s.questionPhase).toBe('both-answered') // lockout
    expect(s.opponentScore).toBe(1)

    // End game
    s = apply(s, { type: 'END_GAME', record })
    expect(s.phase).toBe('results')

    // Double endGame is no-op
    const s2 = apply(s, { type: 'END_GAME', record })
    expect(s2).toBe(s)
    expect(s2.gameHistory).toHaveLength(1)
  })

  it('guest: opponent answers wrong, then I answer', () => {
    let s = inGame()

    // Opponent answers wrong
    s = apply(s, { type: 'OPPONENT_ANSWER', selectedValue: 36, isCorrect: false, points: 0 })
    expect(s.questionPhase).toBe('opponent-answered')
    expect(s.buttonStates[36]).toBe('opponent-wrong')

    // I answer correctly
    s = apply(s, { type: 'MY_ANSWER', value: 42, isCorrect: true, points: 1, isMultiplayer: true })
    expect(s.questionPhase).toBe('both-answered')
    expect(s.correctCount).toBe(1)
  })

  it('timeout then opponent answers → both-answered', () => {
    let s = inGame()

    // I time out
    s = apply(s, { type: 'TIMEOUT', isMultiplayer: true })
    expect(s.questionPhase).toBe('timed-out')

    // Opponent answers
    s = apply(s, { type: 'OPPONENT_ANSWER', selectedValue: 42, isCorrect: true, points: 1 })
    expect(s.questionPhase).toBe('both-answered')
    expect(s.opponentScore).toBe(1)
  })

  it('forfeit during game', () => {
    let s = inGame()
    s = apply(s, { type: 'FORFEIT', by: { name: 'Alice', avatar: '🦊' } })
    expect(s.phase).toBe('forfeit')

    // Cannot end game after forfeit
    const s2 = apply(s, { type: 'END_GAME', record })
    expect(s2).toBe(s)
  })
})

describe('Race condition guards', () => {
  it('double MY_ANSWER is impossible', () => {
    let s = inGame()
    s = apply(s, { type: 'MY_ANSWER', value: 42, isCorrect: true, points: 1, isMultiplayer: true })
    expect(s.questionPhase).toBe('me-answered')
    expect(s.correctCount).toBe(1)

    // Second answer is a no-op (me-answered is not a valid source for MY_ANSWER)
    const s2 = apply(s, { type: 'MY_ANSWER', value: 36, isCorrect: false, points: 0, isMultiplayer: true })
    expect(s2).toBe(s)
    expect(s2.correctCount).toBe(1)
  })

  it('double OPPONENT_ANSWER correct lockout is impossible', () => {
    let s = inGame()
    s = apply(s, { type: 'OPPONENT_ANSWER', selectedValue: 42, isCorrect: true, points: 1 })
    expect(s.questionPhase).toBe('both-answered')
    expect(s.opponentScore).toBe(1)

    // Second opponent answer is a no-op
    const s2 = apply(s, { type: 'OPPONENT_ANSWER', selectedValue: 42, isCorrect: true, points: 1 })
    expect(s2).toBe(s)
    expect(s2.opponentScore).toBe(1)
  })

  it('double TIMEOUT is impossible', () => {
    let s = inGame()
    s = apply(s, { type: 'TIMEOUT', isMultiplayer: true })
    expect(s.questionPhase).toBe('timed-out')
    expect(s.totalCount).toBe(1)

    // Second timeout is a no-op
    const s2 = apply(s, { type: 'TIMEOUT', isMultiplayer: true })
    expect(s2).toBe(s)
    expect(s2.totalCount).toBe(1)
  })

  it('double END_GAME is impossible', () => {
    let s = inGame()
    s = apply(s, { type: 'END_GAME', record })
    expect(s.phase).toBe('results')
    expect(s.gameHistory).toHaveLength(1)

    const s2 = apply(s, { type: 'END_GAME', record })
    expect(s2).toBe(s)
    expect(s2.gameHistory).toHaveLength(1)
  })

  it('FORFEIT after END_GAME is impossible', () => {
    let s = inGame()
    s = apply(s, { type: 'END_GAME', record })
    const s2 = apply(s, { type: 'FORFEIT', by: { name: 'X', avatar: '🤖' } })
    expect(s2).toBe(s)
    expect(s2.phase).toBe('results')
  })

  it('END_GAME after FORFEIT is impossible', () => {
    let s = inGame()
    s = apply(s, { type: 'FORFEIT', by: { name: 'X', avatar: '🤖' } })
    const s2 = apply(s, { type: 'END_GAME', record })
    expect(s2).toBe(s)
    expect(s2.phase).toBe('forfeit')
  })

  it('answer after lockout is impossible', () => {
    let s = inGame()
    // Opponent answers correctly → lockout
    s = apply(s, { type: 'OPPONENT_ANSWER', selectedValue: 42, isCorrect: true, points: 1 })
    expect(s.questionPhase).toBe('both-answered')

    // My answer is no-op
    const s2 = apply(s, { type: 'MY_ANSWER', value: 42, isCorrect: true, points: 1, isMultiplayer: true })
    expect(s2).toBe(s)
  })
})

describe('Consecutive wrong answers (regression: game stuck after 2nd wrong answer)', () => {
  it('single-player: can answer wrong multiple times in a row', () => {
    let s = inGame()

    // Q1: wrong → both-answered → new question → waiting
    s = apply(s, { type: 'MY_ANSWER', value: 36, isCorrect: false, points: 0, isMultiplayer: false })
    expect(s.questionPhase).toBe('both-answered')
    s = apply(s, { type: 'NEW_QUESTION', question: question, questionIndex: 2 })
    expect(s.questionPhase).toBe('waiting')

    // Q2: wrong → both-answered → new question → waiting
    s = apply(s, { type: 'MY_ANSWER', value: 48, isCorrect: false, points: 0, isMultiplayer: false })
    expect(s.questionPhase).toBe('both-answered')
    s = apply(s, { type: 'NEW_QUESTION', question: question, questionIndex: 3 })
    expect(s.questionPhase).toBe('waiting')

    // Q3: wrong → both-answered → new question → waiting
    s = apply(s, { type: 'MY_ANSWER', value: 54, isCorrect: false, points: 0, isMultiplayer: false })
    expect(s.questionPhase).toBe('both-answered')
    s = apply(s, { type: 'NEW_QUESTION', question: question, questionIndex: 4 })
    expect(s.questionPhase).toBe('waiting')

    // Q4: can still answer (game not stuck)
    s = apply(s, { type: 'MY_ANSWER', value: 42, isCorrect: true, points: 1, isMultiplayer: false })
    expect(s.questionPhase).toBe('both-answered')
    expect(s.correctCount).toBe(1)
    expect(s.totalCount).toBe(4)
  })

  it('multiplayer: can answer wrong multiple times in a row', () => {
    let s = inGame()

    // Q1: both answer wrong
    s = apply(s, { type: 'MY_ANSWER', value: 36, isCorrect: false, points: 0, isMultiplayer: true })
    expect(s.questionPhase).toBe('me-answered')
    s = apply(s, { type: 'OPPONENT_ANSWER', selectedValue: 48, isCorrect: false, points: 0 })
    expect(s.questionPhase).toBe('both-answered')

    // Q2
    s = apply(s, { type: 'NEW_QUESTION', question: question, questionIndex: 2 })
    expect(s.questionPhase).toBe('waiting')

    // Q2: both answer wrong again
    s = apply(s, { type: 'OPPONENT_ANSWER', selectedValue: 54, isCorrect: false, points: 0 })
    expect(s.questionPhase).toBe('opponent-answered')
    s = apply(s, { type: 'MY_ANSWER', value: 48, isCorrect: false, points: 0, isMultiplayer: true })
    expect(s.questionPhase).toBe('both-answered')

    // Q3
    s = apply(s, { type: 'NEW_QUESTION', question: question, questionIndex: 3 })
    expect(s.questionPhase).toBe('waiting')

    // Q3: can still answer (game not stuck)
    s = apply(s, { type: 'MY_ANSWER', value: 42, isCorrect: true, points: 1, isMultiplayer: true })
    expect(s.questionPhase).toBe('me-answered')
    expect(s.correctCount).toBe(1)
    expect(s.totalCount).toBe(3)
  })

  it('consecutive timeouts still allow new questions', () => {
    let s = inGame()

    // Q1: timeout
    s = apply(s, { type: 'TIMEOUT', isMultiplayer: false })
    expect(s.questionPhase).toBe('both-answered')
    s = apply(s, { type: 'NEW_QUESTION', question: question, questionIndex: 2 })
    expect(s.questionPhase).toBe('waiting')

    // Q2: timeout
    s = apply(s, { type: 'TIMEOUT', isMultiplayer: false })
    expect(s.questionPhase).toBe('both-answered')
    s = apply(s, { type: 'NEW_QUESTION', question: question, questionIndex: 3 })
    expect(s.questionPhase).toBe('waiting')

    // Q3: can still answer
    s = apply(s, { type: 'MY_ANSWER', value: 42, isCorrect: true, points: 1, isMultiplayer: false })
    expect(s.questionPhase).toBe('both-answered')
    expect(s.correctCount).toBe(1)
    expect(s.totalCount).toBe(3)
  })
})

describe('Score accumulation', () => {
  it('accumulates across multiple questions', () => {
    let s = inGame()

    // Q1: correct (1 point)
    s = apply(s,
      { type: 'MY_ANSWER', value: 42, isCorrect: true, points: 1, isMultiplayer: false },
    )
    expect(s.correctCount).toBe(1)
    expect(s.totalCount).toBe(1)

    // Q2
    s = apply(s, { type: 'NEW_QUESTION', question: question, questionIndex: 2 })

    // Q2: wrong
    s = apply(s,
      { type: 'MY_ANSWER', value: 36, isCorrect: false, points: 0, isMultiplayer: false },
    )
    expect(s.correctCount).toBe(1)
    expect(s.totalCount).toBe(2)

    // Q3
    s = apply(s, { type: 'NEW_QUESTION', question: hardQuestion, questionIndex: 3 })

    // Q3: bonus (2 points)
    s = apply(s,
      { type: 'MY_ANSWER', value: 182, isCorrect: true, points: 2, isMultiplayer: false },
    )
    expect(s.correctCount).toBe(3)
    expect(s.totalCount).toBe(3)
  })

  it('opponent score accumulates correctly', () => {
    let s = inGame()

    // Opponent correct → lockout
    s = apply(s, { type: 'OPPONENT_ANSWER', selectedValue: 42, isCorrect: true, points: 1 })
    expect(s.opponentScore).toBe(1)

    s = apply(s, { type: 'NEW_QUESTION', question: question, questionIndex: 2 })

    // I answer, then opponent answers wrong
    s = apply(s, { type: 'MY_ANSWER', value: 42, isCorrect: true, points: 1, isMultiplayer: true })
    s = apply(s, { type: 'OPPONENT_ANSWER', selectedValue: 36, isCorrect: false, points: 0 })
    expect(s.opponentScore).toBe(1) // unchanged

    s = apply(s, { type: 'NEW_QUESTION', question: question, questionIndex: 3 })

    // Opponent correct again → lockout
    s = apply(s, { type: 'OPPONENT_ANSWER', selectedValue: 42, isCorrect: true, points: 2 })
    expect(s.opponentScore).toBe(3)
  })
})
