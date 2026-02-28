# Maths Glitch

A Next.js application with Payload CMS backend and a timed maths quiz game.

## Quick Start

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) for the home page.

## Routes

- `/` — Home page with Payload CMS authentication
- `/glitch` — "Glitch or Bonus Maths" quiz game
- `/admin` — Payload CMS admin panel

## The Maths Game (`/glitch`)

A timed multiplication and division quiz. Features:

- Configurable game length (1–5 minutes)
- 5-second timer per question with animated progress bar
- Weighted difficulty — tables 6–9 appear more often
- Bonus system — answering a hard question within 3 seconds awards +2 points
- Sound effects via Web Audio API (no audio files)
- Single-player game history persisted in localStorage

## Multiplayer

Real-time 2-player head-to-head mode using [Ably](https://ably.com/).

### Setup

Set the `NEXT_PUBLIC_ABLY_API_KEY` environment variable (e.g. in `.env.local`):

```
NEXT_PUBLIC_ABLY_API_KEY=your-ably-api-key
```

### How it works

1. After setting your name and avatar, you appear in the **Online Players** list visible to other players.
2. Click an available player to challenge them — choose a game duration and send the challenge.
3. The opponent receives an invite popup and can **Accept** or **Deny**.
4. On accept, both players enter a synced game: the host generates questions, both see the same question simultaneously.
5. **First correct answer** earns the point. A wrong answer locks you out and is shown on the opponent's grid in amber.
6. Bonus rules still apply per-player (+2 for hard questions answered in under 3 seconds).
7. When time runs out, the results screen shows both scores and the winner.
8. Multiplayer game history is stored in Ably LiveObjects (LiveMap), so past games and opponent names are available across sessions and devices — no localStorage needed for multiplayer records.
9. Player cards on the home screen show the last played multiplayer game result (win/loss, score, opponent name).

### Testing

Multiplayer tests run against the live Ably API. You can either pass the key inline:

```bash
ABLY_API_KEY=your-key pnpm test:int
```

Or set `NEXT_PUBLIC_ABLY_API_KEY` in `.env.local` and just run:

```bash
pnpm test:int
```

Both `ABLY_API_KEY` and `NEXT_PUBLIC_ABLY_API_KEY` are accepted. Tests use separate channels (not the real `glitch-players` or `glitch-history` channels) and cover:

**Ably integration:**
1. Ably connection
2. Presence enter/get
3. Presence data update
4. Presence leave detection
5. Pub/sub messaging
6. Full invite → accept game flow
7. Two-player mutual presence visibility

**Regression tests:**
8. Partial presence update replaces data (playerId preservation)
9. Invite includes toPlayerId for filtering
10. Publish awaited before navigation (invite-response delivery)
11. Bonus points included in game answer
12. Lockout answer delivered so both sides advance

**Game history (unit — no API key needed):**
13. getLastGame returns null for empty records
14. getLastGame returns correct win/loss/tie status
15. getLastGame returns only the most recent game

**Game history (LiveObjects integration):**
16. Save and retrieve a game record via LiveMap
17. Append records without losing previous ones
18. Empty history for unknown players
19. Separate history per player
20. Records visible from a second client (shared state)

## Tech Stack

- **Framework:** Next.js 16 with App Router
- **CMS:** Payload 3
- **Database:** Vercel Postgres
- **Styling:** Tailwind CSS 4
- **Realtime:** Ably (Presence + pub/sub + LiveObjects for game history)
- **Language:** TypeScript
