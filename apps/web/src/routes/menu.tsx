import { useEffect, useReducer, useRef } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import type { KapiSession, MenuItem } from '@kapi/spec'

import { ParticipantMenuPage } from '#/features/group-ordering/participant-page'
import type {
  DraftCart,
  DraftCartLine,
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
  loadMenuCustomization,
  localParticipantNameKey,
  publishSession,
  resolveSessionLinkParts,
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
  notice: string | null
}

function initialMenuState(): MenuState {
  const { inviteId, key, sessionId } = getSessionLinkParts()
  const search = new URLSearchParams(window.location.search)
  const name =
    search.get('name') ??
    (sessionId ? localStorage.getItem(localParticipantNameKey(sessionId)) : '')
  return {
    menu: [],
    session: null,
    draft: {},
    participantName: name ?? '',
    pending: false,
    error:
      !inviteId && (!sessionId || !key) ? 'Session link is invalid.' : null,
    notice: null,
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
    const initialParts = getSessionLinkParts()
    const loadSession = async () => {
      const { key, sessionId } = await resolveSessionLinkParts(initialParts)
      if (!sessionId || !key) {
        setState({ error: 'Session link is invalid.' })
        return
      }

      sessionKeyRef.current = key
      participantIdRef.current = getOrCreateLocalParticipantId(sessionId)
      const loadedRecord = await loadEncryptedSessionRecord(sessionId, key)
      relayUpdatedAtRef.current = loadedRecord.relayUpdatedAt
      const loaded = loadedRecord.session
      const loadedMenu = await api<MenuItem[]>(
        `/food/restaurants/${loaded.restaurant.id}/menu?addressId=${loaded.address.id}`,
      )
      setState({ session: loaded, menu: loadedMenu, error: null })
    }

    loadSession().catch((caught: Error) => setState({ error: caught.message }))
  }, [])

  function changeDraftLine(lineId: string, delta: number) {
    const current = state.draft[lineId]
    const nextQuantity = Math.max(current.quantity + delta, 0)
    const draft = { ...state.draft }
    if (nextQuantity === 0) {
      delete draft[lineId]
    } else {
      draft[lineId] = { ...current, quantity: nextQuantity }
    }
    setState({ draft, notice: null })
  }

  function addPlainItem(menuItemId: string) {
    const current = state.draft[menuItemId]
    setState({
      draft: {
        ...state.draft,
        [menuItemId]: { ...current, quantity: current.quantity + 1 },
      },
      notice: null,
    })
  }

  function addCustomItem(line: Omit<DraftCartLine, 'id'>) {
    const id = crypto.randomUUID()
    setState({
      draft: {
        ...state.draft,
        [id]: { ...line, id },
      },
      notice: null,
    })
  }

  async function submitDraft() {
    if (!state.session || !sessionKeyRef.current) return
    const items = Object.values(state.draft)
    if (!items.length) {
      setState({
        error: 'Add at least one item before submitting.',
        notice: null,
      })
      return
    }
    if (!state.participantName.trim()) {
      setState({ error: 'Enter your name before submitting.', notice: null })
      return
    }

    setState({ pending: true, error: null, notice: null })
    try {
      const name = state.participantName.trim()
      const participantId =
        participantIdRef.current ||
        getOrCreateLocalParticipantId(state.session.id)
      localStorage.setItem(localParticipantNameKey(state.session.id), name)

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
          notice: null,
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
            notice: null,
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
        error: null,
        notice: 'Items added to the group cart.',
      })
    } catch (caught) {
      setState({
        error:
          caught instanceof Error ? caught.message : 'Could not submit items.',
        notice: null,
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
      notice={state.notice}
      participantName={state.participantName}
      pending={state.pending}
      session={state.session}
      onAddCustomItem={addCustomItem}
      onAddPlainItem={addPlainItem}
      onLoadCustomization={(item) =>
        loadMenuCustomization({ addressId: state.session!.address.id, item })
      }
      onNameChange={(participantName) =>
        setState({ participantName, notice: null })
      }
      onQuantityChange={changeDraftLine}
      onSubmit={submitDraft}
    />
  )
}
