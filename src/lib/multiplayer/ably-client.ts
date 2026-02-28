import * as Ably from 'ably'
import { LiveObjects } from 'ably/liveobjects'

let client: Ably.Realtime | null = null

export function getAblyClient(clientId: string): Ably.Realtime {
  if (client) return client

  const apiKey = process.env.NEXT_PUBLIC_ABLY_API_KEY
  if (!apiKey) {
    throw new Error('NEXT_PUBLIC_ABLY_API_KEY environment variable is not set')
  }

  client = new Ably.Realtime({ key: apiKey, clientId, plugins: { LiveObjects } })
  return client
}

export function disconnectAbly() {
  if (client) {
    client.close()
    client = null
  }
}
