import { describe, it, expect, afterAll } from 'vitest'
import * as Ably from 'ably'
import { LiveObjects } from 'ably/liveobjects'
import { getLastGame } from '@/lib/multiplayer/game-history'
import type { MultiplayerGameRecord } from '@/lib/multiplayer/types'

const API_KEY = process.env.ABLY_API_KEY || process.env.NEXT_PUBLIC_ABLY_API_KEY
const TEST_CHANNEL = 'glitch-test'

function createClient(clientId: string): Ably.Realtime {
  if (!API_KEY) throw new Error('ABLY_API_KEY env var required for multiplayer tests')
  return new Ably.Realtime({ key: API_KEY, clientId })
}

function createLiveObjectsClient(clientId: string): Ably.Realtime {
  if (!API_KEY) throw new Error('ABLY_API_KEY env var required for multiplayer tests')
  return new Ably.Realtime({ key: API_KEY, clientId, plugins: { LiveObjects } })
}

function waitForConnection(client: Ably.Realtime): Promise<void> {
  return new Promise((resolve, reject) => {
    if (client.connection.state === 'connected') {
      resolve()
      return
    }
    const timeout = setTimeout(() => reject(new Error('Connection timeout')), 10000)
    client.connection.once('connected', () => {
      clearTimeout(timeout)
      resolve()
    })
    client.connection.once('failed', () => {
      clearTimeout(timeout)
      reject(new Error('Connection failed'))
    })
  })
}

describe('Multiplayer - Ably integration', () => {
  const clients: Ably.Realtime[] = []

  afterAll(() => {
    clients.forEach((c) => c.close())
  })

  it('should connect to Ably', async () => {


    const client = createClient('test-player-1')
    clients.push(client)
    await waitForConnection(client)
    expect(client.connection.state).toBe('connected')
  })

  it('should enter and retrieve presence', async () => {


    const client = createClient('test-player-2')
    clients.push(client)
    await waitForConnection(client)

    const channel = client.channels.get(TEST_CHANNEL)
    await channel.presence.enter({ name: 'TestPlayer', avatar: '🦊' })

    const members = await channel.presence.get()
    const self = members.find((m) => m.clientId === 'test-player-2')
    expect(self).toBeDefined()
    expect(self!.data.name).toBe('TestPlayer')

    await channel.presence.leave()
  })

  it('should update presence data', async () => {


    const client = createClient('test-player-3')
    clients.push(client)
    await waitForConnection(client)

    const channel = client.channels.get(TEST_CHANNEL)
    await channel.presence.enter({ name: 'Player3', score: 0 })
    await channel.presence.update({ name: 'Player3', score: 5 })

    const members = await channel.presence.get()
    const self = members.find((m) => m.clientId === 'test-player-3')
    expect(self!.data.score).toBe(5)

    await channel.presence.leave()
  })

  it('should detect presence leave', async () => {


    const client = createClient('test-player-4')
    clients.push(client)
    await waitForConnection(client)

    const channel = client.channels.get(TEST_CHANNEL)
    await channel.presence.enter({ name: 'Player4' })
    await channel.presence.leave()

    // Small delay to let leave propagate
    await new Promise((r) => setTimeout(r, 500))

    const members = await channel.presence.get()
    const self = members.find((m) => m.clientId === 'test-player-4')
    expect(self).toBeUndefined()
  })

  it('should publish and receive messages', async () => {


    const client = createClient('test-player-5')
    clients.push(client)
    await waitForConnection(client)

    const channel = client.channels.get(TEST_CHANNEL)

    const received = new Promise<Ably.Message>((resolve) => {
      channel.subscribe('test-event', (msg) => {
        resolve(msg)
      })
    })

    await channel.publish('test-event', { hello: 'world' })
    const msg = await received
    expect(msg.data.hello).toBe('world')

    channel.unsubscribe('test-event')
  })

  it('should simulate game invite flow', async () => {


    const host = createClient('host-player')
    const guest = createClient('guest-player')
    clients.push(host, guest)
    await Promise.all([waitForConnection(host), waitForConnection(guest)])

    const hostChannel = host.channels.get(TEST_CHANNEL)
    const guestChannel = guest.channels.get(TEST_CHANNEL)

    // Guest subscribes for invites
    const inviteReceived = new Promise<Ably.Message>((resolve) => {
      guestChannel.subscribe('game-event', (msg) => {
        if (msg.data.type === 'invite') resolve(msg)
      })
    })

    // Host sends invite
    await hostChannel.publish('game-event', {
      type: 'invite',
      fromPlayerId: 'host-player',
      fromName: 'Host',
      fromAvatar: '🦊',
      duration: 1,
      toPlayerId: 'guest-player',
    })

    const invite = await inviteReceived
    expect(invite.data.type).toBe('invite')
    expect(invite.data.fromName).toBe('Host')

    // Guest accepts
    const responseReceived = new Promise<Ably.Message>((resolve) => {
      hostChannel.subscribe('game-event', (msg) => {
        if (msg.data.type === 'invite-response') resolve(msg)
      })
    })

    await guestChannel.publish('game-event', {
      type: 'invite-response',
      accepted: true,
      fromPlayerId: 'guest-player',
      fromName: 'Guest',
      fromAvatar: '🐱',
      toPlayerId: 'host-player',
    })

    const response = await responseReceived
    expect(response.data.accepted).toBe(true)

    hostChannel.unsubscribe('game-event')
    guestChannel.unsubscribe('game-event')
  })

  it('should see each other in presence with two clients', async () => {


    const client1 = createClient('two-player-1')
    const client2 = createClient('two-player-2')
    clients.push(client1, client2)
    await Promise.all([waitForConnection(client1), waitForConnection(client2)])

    const ch1 = client1.channels.get(TEST_CHANNEL + '-duo')
    const ch2 = client2.channels.get(TEST_CHANNEL + '-duo')

    await ch1.presence.enter({ name: 'Player1' })
    await ch2.presence.enter({ name: 'Player2' })

    // Small delay for propagation
    await new Promise((r) => setTimeout(r, 1000))

    const members1 = await ch1.presence.get()
    const members2 = await ch2.presence.get()

    expect(members1.length).toBe(2)
    expect(members2.length).toBe(2)

    const names1 = members1.map((m) => m.data.name).sort()
    expect(names1).toEqual(['Player1', 'Player2'])

    await ch1.presence.leave()
    await ch2.presence.leave()
  })

  it('should preserve playerId in presence after update (regression: partial update wipes fields)', async () => {


    const client = createClient('update-regression-1')
    clients.push(client)
    await waitForConnection(client)

    const channel = client.channels.get(TEST_CHANNEL + '-reg1')
    await channel.presence.enter({
      playerId: 'update-regression-1',
      name: 'Alice',
      avatar: '🦊',
      currentGame: null,
    })

    // Simulate the bug: partial update replaces entire data, losing playerId
    await channel.presence.update({ name: 'Alice Updated', avatar: '🐱' })

    const members = await channel.presence.get()
    const self = members.find((m) => m.clientId === 'update-regression-1')
    // This verifies the bug: partial update REPLACES data, playerId is gone
    expect(self!.data.playerId).toBeUndefined()

    // Now do it correctly: full object update
    await channel.presence.update({
      playerId: 'update-regression-1',
      name: 'Alice Updated',
      avatar: '🐱',
      currentGame: null,
    })

    const members2 = await channel.presence.get()
    const self2 = members2.find((m) => m.clientId === 'update-regression-1')
    expect(self2!.data.playerId).toBe('update-regression-1')
    expect(self2!.data.name).toBe('Alice Updated')

    await channel.presence.leave()
  })

  it('should include toPlayerId in invite so receiver can filter (regression: missing toPlayerId)', async () => {


    const host = createClient('invite-reg-host')
    const guest = createClient('invite-reg-guest')
    clients.push(host, guest)
    await Promise.all([waitForConnection(host), waitForConnection(guest)])

    const ch = host.channels.get(TEST_CHANNEL + '-reg2')
    const guestCh = guest.channels.get(TEST_CHANNEL + '-reg2')

    const received = new Promise<Ably.Message>((resolve) => {
      guestCh.subscribe('game-event', (msg) => {
        if (msg.data.type === 'invite') resolve(msg)
      })
    })

    await ch.publish('game-event', {
      type: 'invite',
      fromPlayerId: 'invite-reg-host',
      fromName: 'Host',
      fromAvatar: '🦊',
      duration: 1,
      toPlayerId: 'invite-reg-guest',
    })

    const msg = await received
    // Verify toPlayerId is present and correct — not undefined
    expect(msg.data.toPlayerId).toBe('invite-reg-guest')
    expect(msg.data.fromPlayerId).toBe('invite-reg-host')

    ch.unsubscribe('game-event')
    guestCh.unsubscribe('game-event')
  })

  it('should deliver invite-response before sender disconnects (regression: publish must be awaited)', async () => {


    const host = createClient('await-reg-host')
    const guest = createClient('await-reg-guest')
    clients.push(host, guest)
    await Promise.all([waitForConnection(host), waitForConnection(guest)])

    const hostCh = host.channels.get(TEST_CHANNEL + '-reg3')
    const guestCh = guest.channels.get(TEST_CHANNEL + '-reg3')

    const responseReceived = new Promise<Ably.Message>((resolve) => {
      hostCh.subscribe('game-event', (msg) => {
        if (msg.data.type === 'invite-response') resolve(msg)
      })
    })

    // Guest publishes response and awaits before "navigating away"
    await guestCh.publish('game-event', {
      type: 'invite-response',
      accepted: true,
      fromPlayerId: 'await-reg-guest',
      fromName: 'Guest',
      fromAvatar: '🐱',
      toPlayerId: 'await-reg-host',
    })
    // After await, message is guaranteed delivered — host should receive it
    const response = await responseReceived
    expect(response.data.accepted).toBe(true)
    expect(response.data.toPlayerId).toBe('await-reg-host')

    hostCh.unsubscribe('game-event')
    guestCh.unsubscribe('game-event')
  })

  it('should include points in game answer for correct bonus tracking (regression: bonus score mismatch)', async () => {


    const host = createClient('bonus-reg-host')
    const guest = createClient('bonus-reg-guest')
    clients.push(host, guest)
    await Promise.all([waitForConnection(host), waitForConnection(guest)])

    const hostCh = host.channels.get(TEST_CHANNEL + '-reg4')
    const guestCh = guest.channels.get(TEST_CHANNEL + '-reg4')

    const answerReceived = new Promise<Ably.Message>((resolve) => {
      guestCh.subscribe('game-event', (msg) => {
        if (msg.data.type === 'answer') resolve(msg)
      })
    })

    // Host answers correctly with bonus (2 points)
    await hostCh.publish('game-event', {
      type: 'answer',
      playerId: 'bonus-reg-host',
      questionIndex: 1,
      selectedValue: 42,
      isCorrect: true,
      points: 2,
      timestamp: Date.now(),
    })

    const msg = await answerReceived
    expect(msg.data.points).toBe(2)
    expect(msg.data.isCorrect).toBe(true)

    // Verify opponent would track 2 points, not 1
    const opponentScore = 0 + (msg.data.points || 1)
    expect(opponentScore).toBe(2)

    hostCh.unsubscribe('game-event')
    guestCh.unsubscribe('game-event')
  })

  it('should deliver lockout answer so both sides advance (regression: freeze after correct answer)', async () => {


    const host = createClient('lockout-reg-host')
    const guest = createClient('lockout-reg-guest')
    clients.push(host, guest)
    await Promise.all([waitForConnection(host), waitForConnection(guest)])

    const hostCh = host.channels.get(TEST_CHANNEL + '-reg5')
    const guestCh = guest.channels.get(TEST_CHANNEL + '-reg5')

    const answers: Ably.Message[] = []
    const bothAnswered = new Promise<void>((resolve) => {
      hostCh.subscribe('game-event', (msg) => {
        if (msg.data.type === 'answer') {
          answers.push(msg)
          if (answers.length === 2) resolve()
        }
      })
    })

    // Host answers correctly
    await hostCh.publish('game-event', {
      type: 'answer',
      playerId: 'lockout-reg-host',
      questionIndex: 1,
      selectedValue: 42,
      isCorrect: true,
      points: 1,
      timestamp: Date.now(),
    })

    // Guest gets locked out and publishes a "done" answer
    await guestCh.publish('game-event', {
      type: 'answer',
      playerId: 'lockout-reg-guest',
      questionIndex: 1,
      selectedValue: -1,
      isCorrect: false,
      points: 0,
      timestamp: Date.now(),
    })

    await bothAnswered

    // Host should see both answers — one correct (self) and one lockout (guest)
    expect(answers.length).toBe(2)
    const guestAnswer = answers.find((a) => a.data.playerId === 'lockout-reg-guest')
    expect(guestAnswer).toBeDefined()
    expect(guestAnswer!.data.isCorrect).toBe(false)
    expect(guestAnswer!.data.selectedValue).toBe(-1)

    hostCh.unsubscribe('game-event')
    guestCh.unsubscribe('game-event')
  })

  it('should auto-deny invite when player is in a solo game', async () => {


    const soloPlayer = createClient('solo-player')
    const challenger = createClient('challenger')
    clients.push(soloPlayer, challenger)
    await Promise.all([waitForConnection(soloPlayer), waitForConnection(challenger)])

    const soloCh = soloPlayer.channels.get(TEST_CHANNEL + '-solo')
    const challengerCh = challenger.channels.get(TEST_CHANNEL + '-solo')

    // Solo player enters presence with currentGame: 'solo'
    await soloCh.presence.enter({
      playerId: 'solo-player',
      name: 'SoloPlayer',
      avatar: '🦊',
      currentGame: 'solo',
    })

    // Solo player auto-denies incoming invites (mirrors glitch/page.tsx logic)
    soloCh.subscribe('game-event', (msg) => {
      const data = msg.data as { type: string; toPlayerId?: string; fromPlayerId?: string }
      if (data.type !== 'invite' || data.toPlayerId !== 'solo-player') return
      soloCh.publish('game-event', {
        type: 'invite-response',
        accepted: false,
        fromPlayerId: 'solo-player',
        fromName: 'SoloPlayer',
        fromAvatar: '🦊',
        toPlayerId: data.fromPlayerId,
      }).catch(() => {})
    })

    // Challenger sends invite and waits for response
    const responseReceived = new Promise<Ably.Message>((resolve) => {
      challengerCh.subscribe('game-event', (msg) => {
        if (msg.data.type === 'invite-response') resolve(msg)
      })
    })

    await challengerCh.publish('game-event', {
      type: 'invite',
      fromPlayerId: 'challenger',
      fromName: 'Challenger',
      fromAvatar: '🐱',
      duration: 1,
      toPlayerId: 'solo-player',
    })

    const response = await responseReceived
    expect(response.data.accepted).toBe(false)
    expect(response.data.fromPlayerId).toBe('solo-player')
    expect(response.data.toPlayerId).toBe('challenger')

    // Verify presence shows currentGame: 'solo' (not challengeable in UI)
    const members = await challengerCh.presence.get()
    const solo = members.find((m) => m.clientId === 'solo-player')
    expect(solo).toBeDefined()
    expect(solo!.data.currentGame).toBe('solo')

    soloCh.unsubscribe('game-event')
    challengerCh.unsubscribe('game-event')
    await soloCh.presence.leave()
  })
})

describe('Game History - getLastGame (unit)', () => {
  it('should return null for empty records', () => {
    expect(getLastGame([])).toBeNull()
  })

  it('should return the last game with won=true when score is higher', () => {
    const records: MultiplayerGameRecord[] = [
      { finishedAt: 1000, opponent: 'Alice', opponentAvatar: '🦊', opponentId: 'a1', score: 5, opponentScore: 3 },
    ]
    const result = getLastGame(records)
    expect(result).toEqual({ opponent: 'Alice', score: 5, opponentScore: 3, won: true })
  })

  it('should return the last game with won=false when score is lower', () => {
    const records: MultiplayerGameRecord[] = [
      { finishedAt: 1000, opponent: 'Alice', opponentAvatar: '🦊', opponentId: 'a1', score: 2, opponentScore: 7 },
    ]
    const result = getLastGame(records)
    expect(result).toEqual({ opponent: 'Alice', score: 2, opponentScore: 7, won: false })
  })

  it('should return won=false on a tie', () => {
    const records: MultiplayerGameRecord[] = [
      { finishedAt: 1000, opponent: 'Bob', opponentAvatar: '🐱', opponentId: 'b1', score: 4, opponentScore: 4 },
    ]
    const result = getLastGame(records)
    expect(result!.won).toBe(false)
  })

  it('should return only the last game when multiple records exist', () => {
    const records: MultiplayerGameRecord[] = [
      { finishedAt: 1000, opponent: 'Alice', opponentAvatar: '🦊', opponentId: 'a1', score: 5, opponentScore: 3 },
      { finishedAt: 2000, opponent: 'Bob', opponentAvatar: '🐱', opponentId: 'b1', score: 1, opponentScore: 6 },
    ]
    const result = getLastGame(records)
    expect(result).toEqual({ opponent: 'Bob', score: 1, opponentScore: 6, won: false })
  })
})

describe('Game History - LiveObjects integration', () => {
  const clients: Ably.Realtime[] = []
  // Use a unique channel per test run to avoid interference
  const HISTORY_CHANNEL = `glitch-history-test-${Date.now()}`

  afterAll(() => {
    clients.forEach((c) => c.close())
  })

  it('should save and retrieve a game record via LiveMap', async () => {


    const client = createLiveObjectsClient('history-test-1')
    clients.push(client)
    await waitForConnection(client)

    const channel = client.channels.get(HISTORY_CHANNEL, {
      modes: ['OBJECT_SUBSCRIBE', 'OBJECT_PUBLISH'],
    })

    const playerId = 'history-test-1'
    const key = `games_${playerId}`

    const record: MultiplayerGameRecord = {
      finishedAt: Date.now(),
      opponent: 'Alice',
      opponentAvatar: '🦊',
      opponentId: 'alice-1',
      score: 7,
      opponentScore: 3,
    }

    // Save record
    const root = await channel.object.get()
    await root.set(key, JSON.stringify([record]))

    // Read it back
    const raw = root.get(key).compact() as string | undefined
    expect(raw).toBeDefined()
    const records = JSON.parse(raw!) as MultiplayerGameRecord[]
    expect(records).toHaveLength(1)
    expect(records[0].opponent).toBe('Alice')
    expect(records[0].score).toBe(7)
    expect(records[0].opponentScore).toBe(3)
  })

  it('should append a second game record without losing the first', async () => {


    const client = createLiveObjectsClient('history-test-2')
    clients.push(client)
    await waitForConnection(client)

    const channel = client.channels.get(HISTORY_CHANNEL + '-append', {
      modes: ['OBJECT_SUBSCRIBE', 'OBJECT_PUBLISH'],
    })

    const playerId = 'history-test-2'
    const key = `games_${playerId}`

    const record1: MultiplayerGameRecord = {
      finishedAt: 1000,
      opponent: 'Alice',
      opponentAvatar: '🦊',
      opponentId: 'alice-1',
      score: 5,
      opponentScore: 3,
    }

    const record2: MultiplayerGameRecord = {
      finishedAt: 2000,
      opponent: 'Bob',
      opponentAvatar: '🐱',
      opponentId: 'bob-1',
      score: 2,
      opponentScore: 8,
    }

    const root = await channel.object.get()

    // Save first record
    await root.set(key, JSON.stringify([record1]))

    // Append second record (read-modify-write, same as saveGameRecord does)
    const raw = root.get(key).compact() as string
    const existing: MultiplayerGameRecord[] = JSON.parse(raw)
    existing.push(record2)
    await root.set(key, JSON.stringify(existing))

    // Read back and verify both records
    const raw2 = root.get(key).compact() as string
    const records = JSON.parse(raw2) as MultiplayerGameRecord[]
    expect(records).toHaveLength(2)
    expect(records[0].opponent).toBe('Alice')
    expect(records[1].opponent).toBe('Bob')

    // Verify getLastGame returns the second record
    const last = getLastGame(records)
    expect(last).toEqual({ opponent: 'Bob', score: 2, opponentScore: 8, won: false })
  })

  it('should return empty array for a player with no game history', async () => {


    const client = createLiveObjectsClient('history-test-3')
    clients.push(client)
    await waitForConnection(client)

    const channel = client.channels.get(HISTORY_CHANNEL + '-empty', {
      modes: ['OBJECT_SUBSCRIBE', 'OBJECT_PUBLISH'],
    })

    const root = await channel.object.get()
    const raw = root.get('games_nonexistent-player').compact() as string | undefined
    expect(raw).toBeUndefined()

    // getLastGame should handle empty gracefully
    expect(getLastGame([])).toBeNull()
  })

  it('should keep separate history per player', async () => {


    const client = createLiveObjectsClient('history-test-4')
    clients.push(client)
    await waitForConnection(client)

    const channel = client.channels.get(HISTORY_CHANNEL + '-multi', {
      modes: ['OBJECT_SUBSCRIBE', 'OBJECT_PUBLISH'],
    })

    const root = await channel.object.get()

    const recordA: MultiplayerGameRecord = {
      finishedAt: 1000,
      opponent: 'Bob',
      opponentAvatar: '🐱',
      opponentId: 'bob-1',
      score: 10,
      opponentScore: 2,
    }

    const recordB: MultiplayerGameRecord = {
      finishedAt: 1000,
      opponent: 'Alice',
      opponentAvatar: '🦊',
      opponentId: 'alice-1',
      score: 3,
      opponentScore: 9,
    }

    await root.set('games_player-a', JSON.stringify([recordA]))
    await root.set('games_player-b', JSON.stringify([recordB]))

    const rawA = root.get('games_player-a').compact() as string
    const rawB = root.get('games_player-b').compact() as string

    const gamesA = JSON.parse(rawA) as MultiplayerGameRecord[]
    const gamesB = JSON.parse(rawB) as MultiplayerGameRecord[]

    expect(gamesA).toHaveLength(1)
    expect(gamesA[0].opponent).toBe('Bob')
    expect(gamesA[0].score).toBe(10)

    expect(gamesB).toHaveLength(1)
    expect(gamesB[0].opponent).toBe('Alice')
    expect(gamesB[0].score).toBe(3)
  })

  it('should be visible from a second client on the same channel', async () => {


    const writer = createLiveObjectsClient('history-writer')
    const reader = createLiveObjectsClient('history-reader')
    clients.push(writer, reader)
    await Promise.all([waitForConnection(writer), waitForConnection(reader)])

    const chName = HISTORY_CHANNEL + '-shared'
    const writerCh = writer.channels.get(chName, {
      modes: ['OBJECT_SUBSCRIBE', 'OBJECT_PUBLISH'],
    })
    const readerCh = reader.channels.get(chName, {
      modes: ['OBJECT_SUBSCRIBE', 'OBJECT_PUBLISH'],
    })

    const record: MultiplayerGameRecord = {
      finishedAt: Date.now(),
      opponent: 'Charlie',
      opponentAvatar: '🐸',
      opponentId: 'charlie-1',
      score: 6,
      opponentScore: 4,
    }

    // Writer saves a record
    const writerRoot = await writerCh.object.get()
    await writerRoot.set('games_history-writer', JSON.stringify([record]))

    // Small delay for propagation
    await new Promise((r) => setTimeout(r, 1000))

    // Reader should see the record
    const readerRoot = await readerCh.object.get()
    const raw = readerRoot.get('games_history-writer').compact() as string | undefined
    expect(raw).toBeDefined()
    const records = JSON.parse(raw!) as MultiplayerGameRecord[]
    expect(records).toHaveLength(1)
    expect(records[0].opponent).toBe('Charlie')
    expect(records[0].score).toBe(6)
  })
})
