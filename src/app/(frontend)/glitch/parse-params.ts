export interface GlitchParams {
  isMultiplayer: boolean
  mpChannel: string
  mpDuration: number
  mpRole: 'host' | 'guest' | null
  mpOpponentName: string
  mpOpponentAvatar: string
  mpOpponentId: string
}

/**
 * Parse and validate /glitch URL search params.
 * A multiplayer game requires multiplayer=true, a non-empty channel,
 * and a valid role (host or guest). If any are missing, it falls back
 * to single-player mode.
 */
export function parseGlitchParams(params: URLSearchParams): GlitchParams {
  const mp = params.get('multiplayer') === 'true'
  const channel = params.get('channel') || ''
  const role = params.get('role')
  const validRole = role === 'host' || role === 'guest' ? role : null
  const isMultiplayer = mp && !!channel && !!validRole

  const rawDuration = parseInt(params.get('duration') || '1', 10)
  const mpDuration = Number.isFinite(rawDuration)
    ? Math.max(1, Math.min(5, rawDuration))
    : 1

  return {
    isMultiplayer,
    mpChannel: channel,
    mpDuration,
    mpRole: isMultiplayer ? validRole : null,
    mpOpponentName: params.get('opponentName') || '',
    mpOpponentAvatar: params.get('opponentAvatar') || '',
    mpOpponentId: params.get('opponentId') || '',
  }
}
