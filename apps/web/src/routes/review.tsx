import { useEffect, useReducer, useRef } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import type { KapiSession, ManualFallbackSummary } from '@kapi/spec'

import { OrganizerReviewPage } from '#/features/group-ordering/review-page'
import {
  ErrorAlert,
  api,
  audit,
  getSessionLinkParts,
  loadEncryptedSession,
  makeCartPayload,
  makeManualFallback,
  publishSession,
} from '#/features/group-ordering/shared'

export const Route = createFileRoute('/review')({
  component: RouteComponent,
})

type ReviewState = {
  session: KapiSession | null
  fallback: ManualFallbackSummary | null
  pending: boolean
  error: string | null
}

function initialReviewState(): ReviewState {
  const { key, sessionId } = getSessionLinkParts()
  return {
    session: null,
    fallback: null,
    pending: false,
    error: !sessionId || !key ? 'Session link is invalid.' : null,
  }
}

function patchReviewState(state: ReviewState, patch: Partial<ReviewState>) {
  return { ...state, ...patch }
}

function RouteComponent() {
  const [state, setState] = useReducer(
    patchReviewState,
    undefined,
    initialReviewState,
  )
  const sessionKeyRef = useRef('')
  const isOrganizer = getSessionLinkParts().owner

  async function saveSession(nextSession: KapiSession) {
    if (!sessionKeyRef.current) throw new Error('Session key is missing.')
    const saved = await publishSession(nextSession, sessionKeyRef.current)
    setState({ session: saved })
    return saved
  }

  async function refreshSessionFromRelay() {
    if (!state.session || !sessionKeyRef.current) return
    const loaded = await loadEncryptedSession(
      state.session.id,
      sessionKeyRef.current,
    )
    setState({ session: loaded })
  }

  useEffect(() => {
    const { key, sessionId } = getSessionLinkParts()
    if (!sessionId || !key) {
      return
    }

    sessionKeyRef.current = key
    loadEncryptedSession(sessionId, key)
      .then((session) => setState({ session }))
      .catch((caught: Error) => setState({ error: caught.message }))
  }, [])

  async function syncCart() {
    if (!state.session) return
    if (
      !window.confirm(
        'Add these items to your Swiggy cart? This will not place the order.',
      )
    )
      return
    setState({ pending: true, error: null })
    try {
      const result = await api<KapiSession['sync']>('/food/cart/sync', {
        method: 'POST',
        body: JSON.stringify(makeCartPayload(state.session)),
      })
      await saveSession({
        ...state.session,
        status: result?.status === 'synced' ? 'synced' : 'sync_failed',
        items: state.session.items.map((item) => ({
          ...item,
          synced: item.available && result?.status === 'synced',
        })),
        sync: result,
        audit: [
          ...state.session.audit,
          audit('Organiser', 'synced cart to Swiggy'),
        ],
      })
    } catch (caught) {
      setState({
        error:
          caught instanceof Error ? caught.message : 'Could not sync cart.',
      })
    } finally {
      setState({ pending: false })
    }
  }

  async function lockSession() {
    if (!state.session) return
    setState({ pending: true, error: null })
    try {
      await saveSession({
        ...state.session,
        status: 'locked',
        audit: [...state.session.audit, audit('Organiser', 'locked session')],
      })
    } catch (caught) {
      setState({
        error:
          caught instanceof Error ? caught.message : 'Could not lock session.',
      })
    } finally {
      setState({ pending: false })
    }
  }

  async function updateSubmittedItem(itemId: string, quantity: number) {
    if (!state.session) return
    setState({ pending: true, error: null })
    try {
      await saveSession({
        ...state.session,
        items: state.session.items.map((item) =>
          item.id === itemId
            ? { ...item, quantity: Math.max(1, Math.floor(quantity)) }
            : item,
        ),
        audit: [...state.session.audit, audit('Organiser', 'updated item')],
      })
    } catch (caught) {
      setState({
        error:
          caught instanceof Error ? caught.message : 'Could not update item.',
      })
    } finally {
      setState({ pending: false })
    }
  }

  async function removeSubmittedItem(itemId: string) {
    if (!state.session) return
    setState({ pending: true, error: null })
    try {
      await saveSession({
        ...state.session,
        items: state.session.items.filter((item) => item.id !== itemId),
        audit: [...state.session.audit, audit('Organiser', 'removed item')],
      })
    } catch (caught) {
      setState({
        error:
          caught instanceof Error ? caught.message : 'Could not remove item.',
      })
    } finally {
      setState({ pending: false })
    }
  }

  async function loadManualFallback() {
    if (!state.session) return
    setState({ pending: true, error: null })
    try {
      setState({ fallback: makeManualFallback(state.session) })
    } catch (caught) {
      setState({
        error:
          caught instanceof Error
            ? caught.message
            : 'Could not build manual fallback.',
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
    <OrganizerReviewPage
      error={state.error}
      fallback={state.fallback}
      isOrganizer={isOrganizer}
      pending={state.pending}
      session={state.session}
      onFallback={loadManualFallback}
      onLock={lockSession}
      onRemoveItem={removeSubmittedItem}
      onRefresh={refreshSessionFromRelay}
      onSync={syncCart}
      onUpdateItem={updateSubmittedItem}
    />
  )
}
