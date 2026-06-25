import { useEffect, useReducer, useRef } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import type {
  KapiSession,
  ManualFallbackSummary,
  SwiggyCartSummary,
} from '@kapi/spec'

import { buildParticipantJoinPath } from '#/features/group-ordering/join-target'
import { OrganizerReviewPage } from '#/features/group-ordering/review-page'
import {
  ApiError,
  ErrorAlert,
  api,
  audit,
  getSessionLinkParts,
  hasOrganizerCapability,
  loadEncryptedSessionRecord,
  localOrganizerKeyKey,
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
  isOrganizer: boolean
  pending: boolean
  error: string | null
}

function initialReviewState(): ReviewState {
  const { key, sessionId } = getSessionLinkParts()
  return {
    session: null,
    fallback: null,
    isOrganizer: false,
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
  const organizerSecretRef = useRef<string | null>(null)
  const relayUpdatedAtRef = useRef<string | null>(null)

  async function saveSession(
    mutate: (session: KapiSession) => KapiSession,
    fallbackSession = state.session,
  ) {
    if (!sessionKeyRef.current) throw new Error('Session key is missing.')
    if (!fallbackSession) throw new Error('Session is missing.')
    let nextSession = mutate(fallbackSession)
    try {
      const saved = await publishSession(nextSession, sessionKeyRef.current, {
        expectedUpdatedAt: relayUpdatedAtRef.current,
        role: 'organizer',
        organizerSecret: organizerSecretRef.current,
      })
      relayUpdatedAtRef.current = saved.relayUpdatedAt
      setState({ session: saved.session })
      return saved.session
    } catch (caught) {
      if (!(caught instanceof ApiError) || caught.status !== 409) throw caught
      const refreshed = await refreshSessionFromRelay()
      if (!refreshed) throw caught
      nextSession = mutate(refreshed.session)
      const saved = await publishSession(nextSession, sessionKeyRef.current, {
        expectedUpdatedAt: refreshed.relayUpdatedAt,
        role: 'organizer',
        organizerSecret: organizerSecretRef.current,
      })
      relayUpdatedAtRef.current = saved.relayUpdatedAt
      setState({ session: saved.session })
      return saved.session
    }
  }

  async function refreshSessionFromRelay() {
    if (!state.session || !sessionKeyRef.current) return
    const loaded = await loadEncryptedSessionRecord(
      state.session.id,
      sessionKeyRef.current,
    )
    relayUpdatedAtRef.current = loaded.relayUpdatedAt
    setState({ session: loaded.session })
    return loaded
  }

  useEffect(() => {
    const { key, organizerSecret, owner, sessionId } = getSessionLinkParts()
    if (!sessionId || !key) {
      return
    }

    sessionKeyRef.current = key
    organizerSecretRef.current = organizerSecret
    loadEncryptedSessionRecord(sessionId, key)
      .then(async (loaded) => {
        relayUpdatedAtRef.current = loaded.relayUpdatedAt
        const session = loaded.session
        const isOrganizer =
          owner && (await hasOrganizerCapability(session, organizerSecret))
        if (isOrganizer && organizerSecret) {
          localStorage.setItem(localOrganizerKeyKey(sessionId), organizerSecret)
        }
        setState({ isOrganizer, session })
      })
      .catch((caught: Error) => setState({ error: caught.message }))
  }, [])

  async function syncCart() {
    if (!state.session || !state.isOrganizer) return
    setState({ pending: true, error: null })
    try {
      const cart = await api<SwiggyCartSummary>('/food/cart')
      const details = [
        cart.itemCount
          ? `${cart.itemCount} item${cart.itemCount === 1 ? '' : 's'}`
          : '',
        cart.restaurantName ? `from ${cart.restaurantName}` : '',
        typeof cart.total === 'number' ? `totalling ₹${cart.total}` : '',
      ]
        .filter(Boolean)
        .join(' ')
      const message = cart.empty
        ? 'Add these items to your Swiggy cart? This will not place the order.'
        : `Your Swiggy cart has ${details || 'items'}. Replace it with this group cart? This will not place the order.`
      if (!window.confirm(message)) return

      const result = await api<KapiSession['sync']>('/food/cart/sync', {
        method: 'POST',
        body: JSON.stringify({
          ...makeCartPayload(state.session),
          replaceExistingCart: !cart.empty,
        }),
      })
      await saveSession((session) => ({
        ...session,
        status: result?.status === 'synced' ? 'synced' : 'sync_failed',
        items: session.items.map((item) => ({
          ...item,
          synced: item.available && result?.status === 'synced',
        })),
        sync: result,
        audit: [...session.audit, audit('Organiser', 'synced cart to Swiggy')],
      }))
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
    if (!state.session || !state.isOrganizer) return
    setState({ pending: true, error: null })
    try {
      await saveSession((session) => ({
        ...session,
        status: 'locked',
        audit: [...session.audit, audit('Organiser', 'locked session')],
      }))
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
    if (!state.session || !state.isOrganizer) return
    setState({ pending: true, error: null })
    try {
      await saveSession((session) => ({
        ...session,
        items: session.items.map((item) =>
          item.id === itemId
            ? { ...item, quantity: Math.max(1, Math.floor(quantity)) }
            : item,
        ),
        audit: [...session.audit, audit('Organiser', 'updated item')],
      }))
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
    if (!state.session || !state.isOrganizer) return
    setState({ pending: true, error: null })
    try {
      await saveSession((session) => ({
        ...session,
        items: session.items.filter((item) => item.id !== itemId),
        audit: [...session.audit, audit('Organiser', 'removed item')],
      }))
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
    if (!state.session || !state.isOrganizer) return
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

  function joinAsParticipant() {
    if (!state.session || !sessionKeyRef.current) return
    window.location.href = buildParticipantJoinPath({
      sessionId: state.session.id,
      key: sessionKeyRef.current,
    })
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
      isOrganizer={state.isOrganizer}
      pending={state.pending}
      session={state.session}
      onFallback={loadManualFallback}
      onJoinOrder={joinAsParticipant}
      onLock={lockSession}
      onRemoveItem={removeSubmittedItem}
      onRefresh={refreshSessionFromRelay}
      onSync={syncCart}
      onUpdateItem={updateSubmittedItem}
    />
  )
}
