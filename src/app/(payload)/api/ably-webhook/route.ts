import { createHmac, timingSafeEqual } from 'crypto'
import { getPayload } from 'payload'
import config from '@payload-config'

function verifySignature(body: string, signature: string | null, keyHeader: string | null): boolean {
  if (!signature || !keyHeader) return false

  const apiKey = process.env.ABLY_API_KEY
  if (!apiKey) return false

  // ABLY_API_KEY format is "appId.keyId:keySecret"
  // X-Ably-Key header contains just the keyId (without appId prefix)
  const [keyName, keySecret] = apiKey.split(':')
  if (!keyName || !keySecret) return false

  // Verify the key header matches our key (header may be just keyId or full appId.keyId)
  if (keyHeader !== keyName && !keyName.endsWith(`.${keyHeader}`)) return false

  const computed = createHmac('sha256', keySecret).update(body).digest('base64')

  try {
    return timingSafeEqual(Buffer.from(computed), Buffer.from(signature))
  } catch {
    return false
  }
}

interface PresenceMessage {
  action: number | string
  clientId: string
  data: string | Record<string, unknown>
}

interface AblyWebhookItem {
  source: string
  timestamp: number
  data: {
    channelId?: string
    presence?: PresenceMessage[]
    messages?: Array<{
      data: string | Record<string, unknown>
      clientId?: string
    }>
  }
}

async function upsertPlayer(
  payload: Awaited<ReturnType<typeof getPayload>>,
  clientId: string,
  name: string,
  avatar: string,
) {
  const existing = await payload.find({
    collection: 'players',
    where: { ablyClientId: { equals: clientId } },
    limit: 1,
  })

  if (existing.docs.length > 0) {
    await payload.update({
      collection: 'players',
      id: existing.docs[0].id,
      data: { name, avatar, lastSeenAt: new Date().toISOString() },
    })
    return existing.docs[0].id
  } else {
    const created = await payload.create({
      collection: 'players',
      data: { ablyClientId: clientId, name, avatar, lastSeenAt: new Date().toISOString() },
    })
    return created.id
  }
}

export async function POST(request: Request) {
  const body = await request.text()

  const signature = request.headers.get('x-ably-signature')
  const keyHeader = request.headers.get('x-ably-key')

  console.log('[ably-webhook] Received request, body length:', body.length)

  if (!verifySignature(body, signature, keyHeader)) {
    console.log('[ably-webhook] Signature verification FAILED')
    return new Response('Forbidden', { status: 403 })
  }
  console.log('[ably-webhook] Signature verification OK')

  let parsed: { items?: AblyWebhookItem[] }
  try {
    parsed = JSON.parse(body)
  } catch {
    return new Response('Bad Request', { status: 400 })
  }

  const items = parsed.items || []
  const payload = await getPayload({ config })

  for (const item of items) {
    try {
      console.log('[ably-webhook] Item:', JSON.stringify({ source: item.source, channelId: item.data.channelId }))
      if (item.source === 'channel.presence' && item.data.channelId === 'glitch-players') {
        for (const pm of item.data.presence || []) {
          const action = pm.action
          console.log(`[ably-webhook] Presence action: ${JSON.stringify(action)} (type: ${typeof action}), clientId: ${pm.clientId}`)
          if (action === 1 || action === 2 || action === 'enter' || action === 'update' || action === 'present') {
            const data = typeof pm.data === 'string' ? JSON.parse(pm.data) : pm.data
            const name = data?.name || pm.clientId
            const avatar = data?.avatar || '🤖'
            console.log(`[ably-webhook] Upserting player: clientId=${pm.clientId}, name=${name}, avatar=${avatar}`)
            await upsertPlayer(payload, pm.clientId, name, avatar)
          }
        }
      }

      if (item.source === 'channel.message') {
        for (const msg of item.data.messages || []) {
          const data = typeof msg.data === 'string' ? JSON.parse(msg.data) : msg.data
          if (data?.type === 'game-result') {
            const p1Id = await upsertPlayer(
              payload,
              data.player1Id,
              data.player1Name,
              data.player1Avatar,
            )
            const p2Id = await upsertPlayer(
              payload,
              data.player2Id,
              data.player2Name,
              data.player2Avatar,
            )

            await payload.create({
              collection: 'games',
              data: {
                player1: p1Id,
                player2: p2Id,
                player1Score: data.player1Score,
                player2Score: data.player2Score,
                endedAt: new Date().toISOString(),
                channel: data.channel || item.data.channelId || '',
              },
            })
          }
        }
      }
    } catch (err) {
      console.error('[ably-webhook] Error processing item:', err)
    }
  }

  return new Response('OK', { status: 200 })
}
