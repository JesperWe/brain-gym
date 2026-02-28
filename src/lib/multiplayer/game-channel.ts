import type * as Ably from 'ably'
import type { GameMessage } from './types'

export function getGameChannelName(name1: string, name2: string): string {
  return `${name1} - ${name2}`
}

export function getGameChannel(client: Ably.Realtime, channelName: string): Ably.RealtimeChannel {
  return client.channels.get(channelName)
}

export async function publishMessage(channel: Ably.RealtimeChannel, message: GameMessage) {
  await channel.publish('game-event', message)
}

export function subscribeMessages(
  channel: Ably.RealtimeChannel,
  callback: (message: GameMessage) => void,
) {
  channel.subscribe('game-event', (msg) => {
    callback(msg.data as GameMessage)
  })

  return () => {
    channel.unsubscribe('game-event')
  }
}
