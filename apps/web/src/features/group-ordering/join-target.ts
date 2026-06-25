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

const targetTokenPattern = /^[A-Za-z0-9_-]+$/

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

export function parseParticipantJoinTarget(
  sessionOrLink: string,
  sessionKey: string,
): ParticipantTarget | null {
  const raw = sessionOrLink.trim()
  const keyFallback = readTargetToken(sessionKey)
  if (!raw) return null

  try {
    const url = new URL(raw, 'http://kapi.local')
    const inviteId =
      readTargetToken(url.searchParams.get('i')) ??
      readTargetToken(url.searchParams.get('invite'))
    if (inviteId) return { inviteId }
    const sessionId = readTargetToken(url.searchParams.get('session'))
    const key =
      readTargetToken(new URLSearchParams(url.hash.slice(1)).get('key')) ??
      keyFallback
    if (sessionId && key) return { sessionId, key }
  } catch {
    // Fall through to manual session id parsing.
  }

  const [sessionId, inlineKey] = raw.split(/\s+/)
  const validSessionId = readTargetToken(sessionId)
  const validInlineKey = readTargetToken(inlineKey)
  if (validSessionId && !inlineKey && !keyFallback) {
    return { inviteId: validSessionId }
  }
  const key = keyFallback ?? validInlineKey
  return validSessionId && key ? { sessionId: validSessionId, key } : null
}

function readTargetToken(value: string | null | undefined) {
  const token = value?.trim() ?? ''
  return targetTokenPattern.test(token) ? token : null
}
