export type ParticipantTarget = {
  sessionId: string
  key: string
}

export function parseParticipantTarget(
  sessionOrLink: string,
  sessionKey: string,
): ParticipantTarget | null {
  const raw = sessionOrLink.trim()
  const keyFallback = sessionKey.trim()
  if (!raw) return null

  try {
    const url = new URL(raw, 'http://kapi.local')
    const sessionId = url.searchParams.get('session')?.trim() ?? ''
    const key =
      new URLSearchParams(url.hash.slice(1)).get('key')?.trim() ?? keyFallback
    if (sessionId && key) return { sessionId, key }
  } catch {
    // Fall through to manual session id parsing.
  }

  const [sessionId, inlineKey] = raw.split(/\s+/)
  const key = keyFallback || inlineKey || ''
  return sessionId && key ? { sessionId, key } : null
}
