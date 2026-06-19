import { useEffect, useReducer, useRef } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import type { CartLine, KapiSession, MenuItem } from '@kapi/spec'

import { ParticipantMenuPage } from '#/features/group-ordering/participant-page'
import type { DraftCart } from '#/features/group-ordering/shared'
import {
  ErrorAlert,
  api,
  audit,
  getSessionLinkParts,
  loadEncryptedSession,
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

  async function refreshSessionFromRelay() {
    if (!state.session || !sessionKeyRef.current) return state.session
    const loaded = await loadEncryptedSession(
      state.session.id,
      sessionKeyRef.current,
    )
    setState({ session: loaded })
    return loaded
  }

  useEffect(() => {
    const { key, sessionId } = getSessionLinkParts()
    if (!sessionId || !key) {
      return
    }

    sessionKeyRef.current = key
    loadEncryptedSession(sessionId, key)
      .then(async (loaded) => {
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
      const latest = await refreshSessionFromRelay()
      if (!latest) return
      const submitted: CartLine[] = items.flatMap((line) => {
        const item = state.menu.find(
          (candidate) =>
            candidate.id === line.menuItemId &&
            candidate.restaurantId === latest.restaurant.id,
        )
        if (!item || line.quantity <= 0) return []
        return {
          id: crypto.randomUUID(),
          participantName: state.participantName.trim() || 'Guest',
          menuItemId: item.id,
          name: item.name,
          quantity: line.quantity,
          price: item.price,
          available: item.available,
          swiggyItemId: item.swiggyItemId,
        }
      })
      const name = state.participantName.trim() || 'Guest'
      const existingParticipant = latest.participants.find(
        (participant) => participant.displayName === name,
      )
      const updated: KapiSession = {
        ...latest,
        participants: existingParticipant
          ? latest.participants.map((participant) =>
              participant.displayName === name
                ? {
                    ...participant,
                    status: 'submitted',
                    submittedAt: new Date().toISOString(),
                  }
                : participant,
            )
          : [
              ...latest.participants,
              {
                id: crypto.randomUUID(),
                displayName: name,
                status: 'submitted',
                joinedAt: new Date().toISOString(),
                submittedAt: new Date().toISOString(),
              },
            ],
        items: [
          ...latest.items.filter((item) => item.participantName !== name),
          ...submitted,
        ],
        audit: [
          ...latest.audit,
          audit(name, `submitted ${submitted.length} item lines`),
        ],
      }
      await publishSession(updated, sessionKeyRef.current)
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
