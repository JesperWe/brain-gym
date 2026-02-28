import type * as Ably from 'ably'
import type { MultiplayerGameRecord } from './types'

const HISTORY_CHANNEL = 'glitch-history'

export function getHistoryChannel(client: Ably.Realtime): Ably.RealtimeChannel {
  return client.channels.get(HISTORY_CHANNEL, {
    modes: ['OBJECT_SUBSCRIBE', 'OBJECT_PUBLISH'],
  })
}

export async function saveGameRecord(
  channel: Ably.RealtimeChannel,
  playerId: string,
  record: MultiplayerGameRecord,
): Promise<void> {
  const root = await channel.object.get()
  const key = `games_${playerId}`
  const raw = root.get(key).compact() as string | undefined
  const existing: MultiplayerGameRecord[] = raw ? JSON.parse(raw) : []
  existing.push(record)
  await root.set(key, JSON.stringify(existing))
}

export async function getGameRecords(
  channel: Ably.RealtimeChannel,
  playerId: string,
): Promise<MultiplayerGameRecord[]> {
  const root = await channel.object.get()
  const key = `games_${playerId}`
  const raw = root.get(key).compact() as string | undefined
  if (!raw) return []
  try {
    return JSON.parse(raw) as MultiplayerGameRecord[]
  } catch {
    return []
  }
}

export function getLastGame(records: MultiplayerGameRecord[]): {
  opponent: string
  score: number
  opponentScore: number
  won: boolean
} | null {
  if (records.length === 0) return null
  const last = records[records.length - 1]
  return {
    opponent: last.opponent,
    score: last.score,
    opponentScore: last.opponentScore,
    won: last.score > last.opponentScore,
  }
}
