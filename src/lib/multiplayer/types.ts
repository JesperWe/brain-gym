import type { Question } from '@/app/(frontend)/glitch/types'

export interface PlayerPresenceData {
  playerId: string
  name: string
  avatar: string
  currentGame: string | null
  currentOpponent: string | null
  currentScore: number
  currentOpponentScore: number
  lastGame: {
    opponent: string
    score: number
    opponentScore: number
    won: boolean
  } | null
}

export interface GameInvite {
  type: 'invite'
  fromPlayerId: string
  fromName: string
  fromAvatar: string
  duration: number
}

export interface GameInviteResponse {
  type: 'invite-response'
  accepted: boolean
  fromPlayerId: string
  fromName: string
  fromAvatar: string
}

export interface GameQuestion {
  type: 'question'
  questionIndex: number
  question: Question
}

export interface GameAnswer {
  type: 'answer'
  playerId: string
  questionIndex: number
  selectedValue: number
  isCorrect: boolean
  points: number
  timestamp: number
}

export interface GameEnd {
  type: 'game-end'
}

export interface GameForfeit {
  type: 'game-forfeit'
  playerId: string
  playerName: string
  playerAvatar: string
}

export interface GameResult {
  type: 'game-result'
  player1Id: string
  player1Name: string
  player1Avatar: string
  player1Score: number
  player2Id: string
  player2Name: string
  player2Avatar: string
  player2Score: number
  channel: string
}

export type GameMessage = GameInvite | GameInviteResponse | GameQuestion | GameAnswer | GameEnd | GameForfeit | GameResult

export interface MultiplayerGameRecord {
  finishedAt: number
  opponent: string
  opponentAvatar: string
  opponentId: string
  score: number
  opponentScore: number
}
