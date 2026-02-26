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
- Game history persisted in localStorage

## Tech Stack

- **Framework:** Next.js 16 with App Router
- **CMS:** Payload 3
- **Database:** Vercel Postgres
- **Styling:** Tailwind CSS 4
- **Language:** TypeScript
