import type * as Ably from 'ably'
import type { PlayerPresenceData } from './types'

export async function enterPresence(channel: Ably.RealtimeChannel, data: PlayerPresenceData) {
  await channel.presence.enter(data)
}

export async function leavePresence(channel: Ably.RealtimeChannel) {
  await channel.presence.leave()
}

export async function updatePresence(channel: Ably.RealtimeChannel, data: PlayerPresenceData) {
  await channel.presence.update(data)
}

export function subscribePresence(
  channel: Ably.RealtimeChannel,
  callback: (members: Ably.PresenceMessage[]) => void,
) {
  const refresh = async () => {
    const members = await channel.presence.get()
    callback(members)
  }

  channel.presence.subscribe(['enter', 'leave', 'update'], refresh)
  // Initial fetch
  refresh()

  return () => {
    channel.presence.unsubscribe()
  }
}
