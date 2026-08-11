import type { MenuItem } from '@kapi/spec'

import type { LoadedSessionRecord, SessionLinkParts } from './session.ts'
import { safeSessionStorageGet, safeSessionStorageSet } from './session.ts'

export type WorkspaceCache = {
  parts: SessionLinkParts
  loaded: LoadedSessionRecord
  isOrganizer?: boolean
  menu?: MenuItem[]
  cachedAt?: number
  menuCachedAt?: number
}

const cachePrefix = 'kapi:workspace:'
const invitePrefix = 'kapi:workspace-invite:'

export function readWorkspaceCache(parts: SessionLinkParts) {
  const sessionId =
    parts.sessionId ??
    (parts.inviteId
      ? safeSessionStorageGet(`${invitePrefix}${parts.inviteId}`)
      : null)
  if (!sessionId) return null

  const raw = safeSessionStorageGet(`${cachePrefix}${sessionId}`)
  if (!raw) return null
  try {
    const cached = JSON.parse(raw) as WorkspaceCache
    return cached.loaded?.session?.id === sessionId ? cached : null
  } catch {
    return null
  }
}

export function writeWorkspaceCache(update: WorkspaceCache) {
  const sessionId = update.loaded.session.id
  const current = readWorkspaceCache({
    inviteId: null,
    key: update.parts.key,
    organizerSecret: update.parts.organizerSecret,
    owner: update.parts.owner,
    sessionId,
  })
  const now = Date.now()
  const next: WorkspaceCache = {
    ...current,
    ...update,
    cachedAt: now,
    menu: update.menu ?? current?.menu,
    menuCachedAt: update.menu ? now : current?.menuCachedAt,
  }
  safeSessionStorageSet(
    `${cachePrefix}${sessionId}`,
    JSON.stringify(next),
  )
  if (next.parts.inviteId) {
    safeSessionStorageSet(
      `${invitePrefix}${next.parts.inviteId}`,
      sessionId,
    )
  }
  return next
}
