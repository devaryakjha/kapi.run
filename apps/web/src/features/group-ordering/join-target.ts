export type ParticipantTarget = {
  inviteId?: string
  sessionId?: string
  key?: string
}

export type OrganizerModeTarget = {
  inviteId?: string
  sessionId?: string
  key?: string | null
  ownerKey?: string | null
}

export function buildParticipantJoinPath(target: ParticipantTarget) {
  const url = new URL('/join', 'http://kapi.local')
  if (target.inviteId) {
    url.searchParams.set('i', target.inviteId)
  } else if (target.sessionId && target.key) {
    url.searchParams.set('session', target.sessionId)
    url.hash = new URLSearchParams({ key: target.key }).toString()
  }
  return `${url.pathname}${url.search}${url.hash}`
}

export function buildOrganizerReviewPath(target: OrganizerModeTarget) {
  return buildOrganizerModePath('/review', target)
}

export function buildOrganizerMenuPath(target: OrganizerModeTarget) {
  return buildOrganizerModePath('/menu', target)
}

function buildOrganizerModePath(pathname: string, target: OrganizerModeTarget) {
  const url = new URL(pathname, 'http://kapi.local')
  if (target.inviteId) {
    url.searchParams.set('i', target.inviteId)
  } else if (target.sessionId) {
    url.searchParams.set('session', target.sessionId)
  }
  url.searchParams.set('owner', '1')
  if (!target.inviteId) {
    const hash = new URLSearchParams()
    if (target.key) hash.set('key', target.key)
    if (target.ownerKey) hash.set('ownerKey', target.ownerKey)
    url.hash = hash.toString()
  }
  return `${url.pathname}${url.search}${url.hash}`
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
