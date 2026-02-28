import type { GameRecord, Question } from './types'

// ── Game phase (top level) ──
export type GamePhase = 'setup' | 'countdown' | 'game' | 'results' | 'forfeit'

// ── Question phase (within game) ──
export type QuestionPhase =
  | 'waiting'          // displayed, no one answered
  | 'me-answered'      // I answered, waiting for opponent
  | 'opponent-answered' // opponent answered wrong, I haven't
  | 'both-answered'    // both done (or single-player answered)
  | 'timed-out'        // I timed out, waiting for opponent

export interface GameState {
  phase: GamePhase
  questionPhase: QuestionPhase
  correctCount: number
  totalCount: number
  opponentScore: number
  questionIndex: number
  currentQuestion: Question | null
  questionStartTime: number
  countdownValue: number
  buttonStates: Record<number, 'correct' | 'wrong' | 'opponent-wrong'>
  buttonsDisabled: boolean
  showBonus: boolean
  gameEndTime: number
  gameHistory: GameRecord[]
  forfeitBy: { name: string; avatar: string } | null
}

export type GameAction =
  | { type: 'START_GAME' }
  | { type: 'COUNTDOWN_TICK'; value: number }
  | { type: 'COUNTDOWN_DONE'; gameEndTime: number }
  | { type: 'NEW_QUESTION'; question: Question; questionIndex: number }
  | { type: 'MY_ANSWER'; value: number; isCorrect: boolean; points: number; isMultiplayer: boolean }
  | { type: 'OPPONENT_ANSWER'; selectedValue: number; isCorrect: boolean; points: number }
  | { type: 'TIMEOUT'; isMultiplayer: boolean }
  | { type: 'END_GAME'; record: GameRecord }
  | { type: 'FORFEIT'; by: { name: string; avatar: string } }
  | { type: 'RESET_TO_SETUP' }
  | { type: 'SHOW_BONUS' }
  | { type: 'HIDE_BONUS' }
  | { type: 'LOAD_HISTORY'; history: GameRecord[] }

export function createInitialState(isMultiplayer: boolean): GameState {
  return {
    phase: isMultiplayer ? 'countdown' : 'setup',
    questionPhase: 'waiting',
    correctCount: 0,
    totalCount: 0,
    opponentScore: 0,
    questionIndex: 0,
    currentQuestion: null,
    questionStartTime: 0,
    countdownValue: 3,
    buttonStates: {},
    buttonsDisabled: false,
    showBonus: false,
    gameEndTime: 0,
    gameHistory: [],
    forfeitBy: null,
  }
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'START_GAME': {
      if (state.phase !== 'setup') return state
      return {
        ...state,
        phase: 'countdown',
        correctCount: 0,
        totalCount: 0,
        opponentScore: 0,
        questionIndex: 0,
        countdownValue: 3,
        questionPhase: 'waiting',
        showBonus: false,
      }
    }

    case 'COUNTDOWN_TICK': {
      if (state.phase !== 'countdown') return state
      return { ...state, countdownValue: action.value }
    }

    case 'COUNTDOWN_DONE': {
      if (state.phase !== 'countdown') return state
      return { ...state, phase: 'game', gameEndTime: action.gameEndTime }
    }

    case 'NEW_QUESTION': {
      if (state.phase !== 'game') return state
      return {
        ...state,
        questionPhase: 'waiting',
        currentQuestion: action.question,
        questionIndex: action.questionIndex,
        questionStartTime: Date.now(),
        buttonStates: {},
        buttonsDisabled: false,
      }
    }

    case 'MY_ANSWER': {
      if (state.phase !== 'game') return state
      if (state.questionPhase !== 'waiting' && state.questionPhase !== 'opponent-answered') return state

      const q = state.currentQuestion!
      const newButtonStates = { ...state.buttonStates }
      if (action.isCorrect) {
        newButtonStates[action.value] = 'correct'
      } else {
        newButtonStates[action.value] = 'wrong'
        newButtonStates[q.answer] = 'correct'
      }

      const wasOpponentDone = state.questionPhase === 'opponent-answered'
      // Single-player: always go to both-answered (no opponent to wait for)
      const nextQuestionPhase = !action.isMultiplayer || wasOpponentDone ? 'both-answered' : 'me-answered'

      return {
        ...state,
        questionPhase: nextQuestionPhase,
        correctCount: state.correctCount + action.points,
        totalCount: state.totalCount + 1,
        buttonStates: newButtonStates,
        buttonsDisabled: true,
      }
    }

    case 'OPPONENT_ANSWER': {
      if (state.phase !== 'game') return state
      // Can receive opponent answer while: waiting, me-answered, or timed-out
      if (
        state.questionPhase !== 'waiting' &&
        state.questionPhase !== 'me-answered' &&
        state.questionPhase !== 'timed-out'
      ) return state

      const newOpScore = state.opponentScore + (action.isCorrect ? (action.points || 1) : 0)
      const newButtonStates = { ...state.buttonStates }

      // Opponent correct and I haven't answered → lockout (counts as both done)
      if (action.isCorrect && state.questionPhase === 'waiting') {
        newButtonStates[action.selectedValue] = 'correct'
        return {
          ...state,
          questionPhase: 'both-answered',
          opponentScore: newOpScore,
          totalCount: state.totalCount + 1, // locked out counts as a question
          buttonStates: newButtonStates,
          buttonsDisabled: true,
        }
      }

      // Opponent wrong → show on grid
      if (!action.isCorrect && action.selectedValue >= 0) {
        newButtonStates[action.selectedValue] = 'opponent-wrong'
      }

      const iAmDone = state.questionPhase === 'me-answered' || state.questionPhase === 'timed-out'
      return {
        ...state,
        questionPhase: iAmDone ? 'both-answered' : 'opponent-answered',
        opponentScore: newOpScore,
        buttonStates: newButtonStates,
      }
    }

    case 'TIMEOUT': {
      if (state.phase !== 'game') return state
      if (state.questionPhase !== 'waiting' && state.questionPhase !== 'opponent-answered') return state

      const q = state.currentQuestion!
      const wasOpponentDone = state.questionPhase === 'opponent-answered'
      // Single-player: always go to both-answered
      const nextPhase = !action.isMultiplayer || wasOpponentDone ? 'both-answered' : 'timed-out'

      return {
        ...state,
        questionPhase: nextPhase,
        totalCount: state.totalCount + 1,
        buttonStates: { ...state.buttonStates, [q.answer]: 'correct' },
        buttonsDisabled: true,
      }
    }

    case 'END_GAME': {
      if (state.phase !== 'game') return state
      return {
        ...state,
        phase: 'results',
        gameHistory: [...state.gameHistory, action.record],
      }
    }

    case 'FORFEIT': {
      if (state.phase !== 'game' && state.phase !== 'countdown') return state
      return {
        ...state,
        phase: 'forfeit',
        forfeitBy: action.by,
      }
    }

    case 'RESET_TO_SETUP': {
      return {
        ...state,
        phase: 'setup',
        questionPhase: 'waiting',
        showBonus: false,
        forfeitBy: null,
      }
    }

    case 'SHOW_BONUS':
      return { ...state, showBonus: true }

    case 'HIDE_BONUS':
      return { ...state, showBonus: false }

    case 'LOAD_HISTORY':
      return { ...state, gameHistory: action.history }

    default:
      return state
  }
}
