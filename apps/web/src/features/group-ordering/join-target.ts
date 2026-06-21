export type ParticipantTarget = {
  inviteId?: string
  sessionId?: string
  key?: string
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
    const inviteId = url.searchParams.get('i') ?? url.searchParams.get('invite')
    if (inviteId) return { inviteId }
    const sessionId = url.searchParams.get('session')?.trim() ?? ''
    const key =
      new URLSearchParams(url.hash.slice(1)).get('key')?.trim() ?? keyFallback
    if (sessionId && key) return { sessionId, key }
  } catch {
    // Fall through to manual session id parsing.
  }

  const [sessionId, inlineKey] = raw.split(/\s+/)
  if (sessionId && !inlineKey && !keyFallback) return { inviteId: sessionId }
  const key = keyFallback || inlineKey || ''
  return sessionId && key ? { sessionId, key } : null
}
