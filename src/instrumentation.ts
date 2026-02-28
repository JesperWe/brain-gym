export function register() {
  const missing: string[] = []

  if (!process.env.DATABASE_URL) missing.push('DATABASE_URL')
  if (!process.env.PAYLOAD_SECRET) missing.push('PAYLOAD_SECRET')

  if (missing.length > 0) {
    console.warn(
      `[maths-glitch] Missing required environment variables: ${missing.join(', ')}. ` +
        'The app may not function correctly without them.',
    )
  }

  if (!process.env.NEXT_PUBLIC_ABLY_API_KEY) {
    console.warn(
      '[maths-glitch] NEXT_PUBLIC_ABLY_API_KEY is not set. Multiplayer features will be disabled.',
    )
  }
}
