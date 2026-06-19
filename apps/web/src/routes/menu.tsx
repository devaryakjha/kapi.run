import { useEffect, useReducer, useRef } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import type { KapiSession, MenuItem } from '@kapi/spec'

import { ParticipantMenuPage } from '#/features/group-ordering/participant-page'
import type {
  DraftCart,
  LoadedSessionRecord,
} from '#/features/group-ordering/shared'
import {
  ApiError,
  ErrorAlert,
  applyParticipantSubmission,
  api,
  getOrCreateLocalParticipantId,
  getSessionLinkParts,
  isSessionLockedForParticipants,
  loadEncryptedSessionRecord,
  publishSession,
} from '#/features/group-ordering/shared'

export const Route = createFileRoute('/menu')({
  component: RouteComponent,
})

type MenuState = {
  menu: MenuItem[]
  session: KapiSession | null
  draft: DraftCart
  participantName: string
  pending: boolean
  error: string | null
}

function initialMenuState(): MenuState {
  const { key, sessionId } = getSessionLinkParts()
  return {
    menu: [],
    session: null,
    draft: {},
    participantName: 'Alex',
    pending: false,
    error: !sessionId || !key ? 'Session link is invalid.' : null,
  }
}

function patchMenuState(state: MenuState, patch: Partial<MenuState>) {
  return { ...state, ...patch }
}

function RouteComponent() {
  const [state, setState] = useReducer(
    patchMenuState,
    undefined,
    initialMenuState,
  )
  const sessionKeyRef = useRef('')
  const participantIdRef = useRef('')
  const relayUpdatedAtRef = useRef<string | null>(null)

  async function refreshSessionFromRelay(): Promise<LoadedSessionRecord | null> {
    if (!state.session || !sessionKeyRef.current) return null
    const loaded = await loadEncryptedSessionRecord(
      state.session.id,
      sessionKeyRef.current,
    )
    relayUpdatedAtRef.current = loaded.relayUpdatedAt
    setState({ session: loaded.session })
    return loaded
  }

  useEffect(() => {
    const { key, sessionId } = getSessionLinkParts()
    if (!sessionId || !key) {
      return
    }

    sessionKeyRef.current = key
    participantIdRef.current = getOrCreateLocalParticipantId(sessionId)
    loadEncryptedSessionRecord(sessionId, key)
      .then(async (loadedRecord) => {
        relayUpdatedAtRef.current = loadedRecord.relayUpdatedAt
        const loaded = loadedRecord.session
        const loadedMenu = await api<MenuItem[]>(
          `/food/restaurants/${loaded.restaurant.id}/menu?addressId=${loaded.address.id}`,
        )
        setState({ session: loaded, menu: loadedMenu })
      })
      .catch((caught: Error) => setState({ error: caught.message }))
  }, [])

  function changeDraft(menuItemId: string, delta: number) {
    const nextQuantity = Math.max((state.draft[menuItemId] ?? 0) + delta, 0)
    const draft = { ...state.draft }
    if (nextQuantity === 0) {
      delete draft[menuItemId]
    } else {
      draft[menuItemId] = nextQuantity
    }
    setState({ draft })
  }

  async function submitDraft() {
    if (!state.session || !sessionKeyRef.current) return
    const items = Object.entries(state.draft).map(([menuItemId, quantity]) => ({
      menuItemId,
      quantity,
    }))
    if (!items.length) {
      setState({ error: 'Add at least one item before submitting.' })
      return
    }

    setState({ pending: true, error: null })
    try {
      const name = state.participantName.trim() || 'Guest'
      const participantId =
        participantIdRef.current ||
        getOrCreateLocalParticipantId(state.session.id)

      const buildUpdated = (latest: KapiSession) => {
        return applyParticipantSubmission({
          latest,
          menu: state.menu,
          participantId,
          participantName: name,
          draftItems: items,
        })
      }
      let latest = await refreshSessionFromRelay()
      if (!latest) return
      if (isSessionLockedForParticipants(latest.session)) {
        setState({
          session: latest.session,
          error: 'This group session is locked.',
        })
        return
      }
      let updated = buildUpdated(latest.session)
      try {
        const saved = await publishSession(updated, sessionKeyRef.current, {
          expectedUpdatedAt: latest.relayUpdatedAt,
          role: 'participant',
        })
        relayUpdatedAtRef.current = saved.relayUpdatedAt
      } catch (caught) {
        if (!(caught instanceof ApiError) || caught.status !== 409) throw caught
        latest = await refreshSessionFromRelay()
        if (!latest) return
        if (isSessionLockedForParticipants(latest.session)) {
          setState({
            session: latest.session,
            error: 'This group session is locked.',
          })
          return
        }
        updated = buildUpdated(latest.session)
        const saved = await publishSession(updated, sessionKeyRef.current, {
          expectedUpdatedAt: latest.relayUpdatedAt,
          role: 'participant',
        }).catch((retryError) => {
          if (retryError instanceof ApiError && retryError.status === 409) {
            throw new Error('Session changed again. Submit once more.')
          }
          throw retryError
        })
        relayUpdatedAtRef.current = saved.relayUpdatedAt
      }
      setState({
        session: updated,
        draft: {},
        error: 'Items added to the group cart.',
      })
    } catch (caught) {
      setState({
        error:
          caught instanceof Error ? caught.message : 'Could not submit items.',
      })
    } finally {
      setState({ pending: false })
    }
  }

  if (!state.session) {
    return (
      <main className="min-h-svh bg-background p-6 text-foreground">
        <ErrorAlert message={state.error} />
      </main>
    )
  }

  return (
    <ParticipantMenuPage
      draft={state.draft}
      error={state.error}
      menu={state.menu}
      participantName={state.participantName}
      pending={state.pending}
      session={state.session}
      onNameChange={(participantName) => setState({ participantName })}
      onQuantityChange={changeDraft}
      onSubmit={submitDraft}
    />
  )
}
