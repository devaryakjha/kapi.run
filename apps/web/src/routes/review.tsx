import { useEffect, useReducer, useRef } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import type {
  KapiSession,
  ManualFallbackSummary,
  SwiggyCartSummary,
} from '@kapi/spec'

import { buildOrganizerMenuPath } from '#/features/group-ordering/join-target'
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
  resolveSessionLinkParts,
  safeLocalStorageSet,
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
  stale: boolean
  swiggyCart: SwiggyCartSummary | null
}

function initialReviewState(): ReviewState {
  const { inviteId, key, sessionId } = getSessionLinkParts()
  return {
    session: null,
    fallback: null,
    isOrganizer: false,
    pending: false,
    error:
      !inviteId && (!sessionId || !key) ? 'Session link is invalid.' : null,
    stale: false,
    swiggyCart: null,
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
  const inviteIdRef = useRef<string | null>(null)
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
      setState({ session: saved.session, stale: false })
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
      setState({ session: saved.session, stale: false })
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
    setState({
      session: loaded.session,
      stale: loaded.relayUpdatedAt === null,
    })
    return loaded
  }

  useEffect(() => {
    const initialParts = getSessionLinkParts()
    const loadSession = async () => {
      const { inviteId, key, organizerSecret, owner, sessionId } =
        await resolveSessionLinkParts(initialParts)
      if (!sessionId || !key) {
        setState({ error: 'Session link is invalid.' })
        return
      }

      sessionKeyRef.current = key
      inviteIdRef.current = inviteId
      organizerSecretRef.current = organizerSecret
      const loaded = await loadEncryptedSessionRecord(sessionId, key)
      relayUpdatedAtRef.current = loaded.relayUpdatedAt
      const session = loaded.session
      const isOrganizer =
        owner && (await hasOrganizerCapability(session, organizerSecret))
      if (isOrganizer && organizerSecret) {
        safeLocalStorageSet(localOrganizerKeyKey(sessionId), organizerSecret)
      }
      setState({
        isOrganizer,
        session,
        stale: loaded.relayUpdatedAt === null,
      })
    }

    loadSession().catch((caught: Error) => setState({ error: caught.message }))
  }, [])

  async function syncCart() {
    if (!state.session || !state.isOrganizer) return
    setState({ pending: true, error: null })
    try {
      const cart = await api<SwiggyCartSummary>(
        `/food/cart?addressId=${encodeURIComponent(state.session.address.id)}&restaurantName=${encodeURIComponent(state.session.restaurant.name)}&sessionId=${encodeURIComponent(state.session.id)}`,
        {
          headers: organizerSecretRef.current
            ? { 'x-kapi-organizer-secret': organizerSecretRef.current }
            : undefined,
        },
      )
      setState({ swiggyCart: cart })
    } catch (caught) {
      setState({
        error:
          caught instanceof Error ? caught.message : 'Could not check cart.',
      })
    } finally {
      setState({ pending: false })
    }
  }

  async function confirmSyncCart() {
    if (!state.session || !state.isOrganizer || !state.swiggyCart) return
    const replaceExistingCart = !state.swiggyCart.empty
    setState({ pending: true, error: null, swiggyCart: null })
    try {
      const result = await api<KapiSession['sync']>('/food/cart/sync', {
        method: 'POST',
        headers: organizerSecretRef.current
          ? { 'x-kapi-organizer-secret': organizerSecretRef.current }
          : undefined,
        body: JSON.stringify({
          ...makeCartPayload(state.session),
          replaceExistingCart,
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

  function openMenuMode() {
    if (
      !state.session ||
      !sessionKeyRef.current ||
      !organizerSecretRef.current
    ) {
      return
    }
    window.location.href = buildOrganizerMenuPath({
      inviteId: inviteIdRef.current ?? undefined,
      sessionId: state.session.id,
      key: sessionKeyRef.current,
      ownerKey: organizerSecretRef.current,
    })
  }

  if (!state.session) {
    return (
      <main className="min-h-svh bg-background p-6 text-foreground">
        <ErrorAlert message={state.error} />
        {!state.error ? (
          <p className="text-sm text-muted-foreground">Loading order...</p>
        ) : null}
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
      stale={state.stale}
      swiggyCart={state.swiggyCart}
      onCancelSync={() => setState({ swiggyCart: null })}
      onConfirmSync={confirmSyncCart}
      onFallback={loadManualFallback}
      onOpenMenuMode={openMenuMode}
      onLock={lockSession}
      onRemoveItem={removeSubmittedItem}
      onRefresh={refreshSessionFromRelay}
      onSync={syncCart}
      onUpdateItem={updateSubmittedItem}
    />
  )
}
