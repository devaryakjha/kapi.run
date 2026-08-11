import type { MenuItem } from '@kapi/spec'

import type { LoadedSessionRecord, SessionLinkParts } from './shared'

export type WorkspaceCache = {
  parts: SessionLinkParts
  loaded: LoadedSessionRecord
  isOrganizer?: boolean
  menu?: MenuItem[]
}

const workspacesBySession = new Map<string, WorkspaceCache>()
const sessionByInvite = new Map<string, string>()

export function readWorkspaceCache(parts: SessionLinkParts) {
  const sessionId =
    parts.sessionId ??
    (parts.inviteId ? sessionByInvite.get(parts.inviteId) : undefined)
  return sessionId ? (workspacesBySession.get(sessionId) ?? null) : null
}

export function writeWorkspaceCache(update: WorkspaceCache) {
  const sessionId = update.loaded.session.id
  const current = workspacesBySession.get(sessionId)
  const next = { ...current, ...update }
  workspacesBySession.set(sessionId, next)
  if (next.parts.inviteId) {
    sessionByInvite.set(next.parts.inviteId, sessionId)
  }
  return next
}

export function clearWorkspaceCache() {
  workspacesBySession.clear()
  sessionByInvite.clear()
}
