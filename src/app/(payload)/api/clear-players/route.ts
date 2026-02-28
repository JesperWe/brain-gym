import * as Ably from 'ably'
import { getPayload } from 'payload'
import config from '@payload-config'
import { headers as getHeaders } from 'next/headers'

export async function POST() {
  const payload = await getPayload({ config })

  // Authenticate via Payload session cookie
  const headersList = await getHeaders()
  const { user } = await payload.auth({ headers: headersList })
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const apiKey = process.env.ABLY_API_KEY
  if (!apiKey) {
    return Response.json({ error: 'ABLY_API_KEY not configured' }, { status: 500 })
  }

  // Use Realtime client to access leaveClient() (not available on REST Presence)
  const realtime = new Ably.Realtime({ key: apiKey, autoConnect: false })
  realtime.connect()

  try {
    const channel = realtime.channels.get('glitch-players')

    // Wait for channel to attach
    await channel.attach()

    // Wait for presence sync to complete
    await channel.presence.get()

    const members = await channel.presence.get()
    for (const member of members) {
      await channel.presence.leaveClient(member.clientId)
    }

    return Response.json({ cleared: members.length })
  } finally {
    realtime.close()
  }
}
