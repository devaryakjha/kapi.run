import { useEffect, useReducer, useRef } from 'react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { toast } from 'sonner'
import type { KapiSession, MenuItem, SwiggyCartSummary } from '@kapi/spec'

import { AppHeader } from '#/components/app-header'
import { ErrorAlert } from '#/features/group-ordering/error-alert'
import { buildOrganizerMenuPath } from '#/features/group-ordering/join-target'
import { OrganizerReviewPage } from '#/features/group-ordering/review-page'
import { useLiveSessionRecord } from '#/features/group-ordering/use-live-session'
import { WorkspaceLoading } from '#/features/group-ordering/workspace-loading'
import {
  readWorkspaceCache,
  writeWorkspaceCache,
} from '#/features/group-ordering/workspace-cache'
import {
  ApiError,
  applyOrderItemQuantityUpdates,
  api,
  audit,
  getSessionLinkParts,
  hasOrganizerCapability,
  loadEncryptedSessionRecord,
  localOrganizerKeyKey,
  makeCartPayload,
  publishSession,
  resolveSessionLinkParts,
  safeLocalStorageSet,
} from '#/features/group-ordering/shared'

export const Route = createFileRoute('/review')({
  head: () => ({
    meta: [{ title: 'Review order · kapi.run' }],
  }),
  component: RouteComponent,
})

type ReviewState = {
  session: KapiSession | null
  isOrganizer: boolean
  pending: boolean
  error: string | null
  stale: boolean
  swiggyCart: SwiggyCartSummary | null
}

function initialReviewRoute() {
  const requestedParts = getSessionLinkParts()
  const cached = readWorkspaceCache(requestedParts)
  const parts = cached?.parts ?? requestedParts
  const { inviteId, key, sessionId } = parts
  return {
    parts,
    state: {
      session: cached?.loaded.session ?? null,
      isOrganizer: cached?.isOrganizer ?? false,
      pending: false,
      error:
        !inviteId && (!sessionId || !key) ? 'Session link is invalid.' : null,
      stale: cached?.loaded.relayUpdatedAt === null,
      swiggyCart: null,
    } satisfies ReviewState,
  }
}

function patchReviewState(state: ReviewState, patch: Partial<ReviewState>) {
  return { ...state, ...patch }
}

function RouteComponent() {
  const router = useRouter()
  const initialRef = useRef<ReturnType<typeof initialReviewRoute> | null>(null)
  if (!initialRef.current) initialRef.current = initialReviewRoute()
  const [state, setState] = useReducer(
    patchReviewState,
    initialRef.current.state,
  )
  const partsRef = useRef(initialRef.current.parts)
  const sessionKeyRef = useRef(initialRef.current.parts.key ?? '')
  const inviteIdRef = useRef(initialRef.current.parts.inviteId)
  const organizerSecretRef = useRef(initialRef.current.parts.organizerSecret)
  const relayUpdatedAtRef = useRef<string | null>(
    initialRef.current.state.session
      ? (readWorkspaceCache(initialRef.current.parts)?.loaded.relayUpdatedAt ??
          null)
      : null,
  )
  const pendingQuantityUpdatesRef = useRef(new Map<string, number>())
  const quantitySaveTimerRef = useRef<number | null>(null)

  useEffect(() => {
    void router.preloadRoute({ to: '/menu' }).catch(() => undefined)
  }, [router])

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
      writeWorkspaceCache({
        parts: partsRef.current,
        loaded: saved,
        isOrganizer: state.isOrganizer,
      })
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
      writeWorkspaceCache({
        parts: partsRef.current,
        loaded: saved,
        isOrganizer: state.isOrganizer,
      })
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
    writeWorkspaceCache({
      parts: partsRef.current,
      loaded,
      isOrganizer: state.isOrganizer,
    })
    setState({
      session: loaded.session,
      stale: loaded.relayUpdatedAt === null,
    })
    return loaded
  }

  useEffect(() => {
    const initialParts = initialRef.current!.parts
    const loadSession = async () => {
      const { inviteId, key, organizerSecret, owner, sessionId } =
        await resolveSessionLinkParts(initialParts)
      if (!sessionId || !key) {
        setState({ error: 'Session link is invalid.' })
        return
      }

      partsRef.current = {
        inviteId,
        key,
        organizerSecret,
        owner,
        sessionId,
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
      writeWorkspaceCache({
        parts: partsRef.current,
        loaded,
        isOrganizer,
      })
      if (isOrganizer) {
        void api<MenuItem[]>(
          `/food/restaurants/${session.restaurant.id}/menu?addressId=${encodeURIComponent(session.address.id)}&sessionId=${encodeURIComponent(sessionId)}`,
          { headers: { 'x-kapi-session-key': key } },
        )
          .then((menu) => {
            const current = readWorkspaceCache(partsRef.current)
            writeWorkspaceCache({
              parts: partsRef.current,
              loaded: current?.loaded ?? loaded,
              isOrganizer,
              menu,
            })
          })
          .catch(() => undefined)
      }
      setState({
        isOrganizer,
        session,
        stale: loaded.relayUpdatedAt === null,
      })
    }

    loadSession().catch((caught: Error) => setState({ error: caught.message }))
  }, [])

  useEffect(
    () => () => {
      if (quantitySaveTimerRef.current) {
        window.clearTimeout(quantitySaveTimerRef.current)
      }
    },
    [],
  )

  const sessionId = state.session?.id

  useLiveSessionRecord({
    sessionId,
    pending: state.pending,
    getSessionKey: () => sessionKeyRef.current,
    getRelayUpdatedAt: () => relayUpdatedAtRef.current,
    onLoaded: (loaded) => {
      relayUpdatedAtRef.current = loaded.relayUpdatedAt
      writeWorkspaceCache({
        parts: partsRef.current,
        loaded,
        isOrganizer: state.isOrganizer,
      })
      setState({
        session: loaded.session,
        stale: loaded.relayUpdatedAt === null,
      })
    },
    onPoll: async () => refreshSessionFromRelay(),
  })

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
      if (result?.status === 'synced') {
        toast.success('Cart synced to Swiggy')
      } else {
        toast.error('Cart sync failed')
      }
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
      toast('Session locked. Participants can no longer submit.')
    } catch (caught) {
      setState({
        error:
          caught instanceof Error ? caught.message : 'Could not lock session.',
      })
    } finally {
      setState({ pending: false })
    }
  }

  async function flushQuantityUpdates(fallbackSession: KapiSession) {
    const updates = new Map(pendingQuantityUpdatesRef.current)
    if (!updates.size) return
    try {
      await saveSession(
        (session) => ({
          ...applyOrderItemQuantityUpdates(session, updates),
          audit: [...session.audit, audit('Organiser', 'updated item')],
        }),
        fallbackSession,
      )
      for (const [itemId, quantity] of updates) {
        if (pendingQuantityUpdatesRef.current.get(itemId) === quantity) {
          pendingQuantityUpdatesRef.current.delete(itemId)
        }
      }
    } catch (caught) {
      setState({
        error:
          caught instanceof Error ? caught.message : 'Could not update item.',
      })
    }
  }

  function updateSubmittedItem(itemId: string, quantity: number) {
    if (!state.session || !state.isOrganizer) return
    const nextQuantity = Math.max(1, Math.floor(quantity))
    pendingQuantityUpdatesRef.current.set(itemId, nextQuantity)
    const nextSession = applyOrderItemQuantityUpdates(
      state.session,
      new Map([[itemId, nextQuantity]]),
    )
    setState({ session: nextSession, error: null })
    if (quantitySaveTimerRef.current) {
      window.clearTimeout(quantitySaveTimerRef.current)
    }
    quantitySaveTimerRef.current = window.setTimeout(() => {
      void flushQuantityUpdates(nextSession)
    }, 450)
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

  function openMenuMode() {
    if (
      !state.session ||
      !sessionKeyRef.current ||
      !organizerSecretRef.current
    ) {
      return
    }
    router.history.push(
      buildOrganizerMenuPath({
        inviteId: inviteIdRef.current ?? undefined,
        sessionId: state.session.id,
        key: sessionKeyRef.current,
        ownerKey: organizerSecretRef.current,
      }),
    )
  }

  if (!state.session) {
    return state.error ? (
      <main className="min-h-svh bg-background text-foreground">
        <AppHeader />
        <div className="mx-auto max-w-6xl p-6">
          <ErrorAlert message={state.error} />
        </div>
      </main>
    ) : (
      <WorkspaceLoading label="Loading review" />
    )
  }

  return (
    <OrganizerReviewPage
      error={state.error}
      isOrganizer={state.isOrganizer}
      pending={state.pending}
      session={state.session}
      stale={state.stale}
      swiggyCart={state.swiggyCart}
      onCancelSync={() => setState({ swiggyCart: null })}
      onConfirmSync={confirmSyncCart}
      onOpenMenuMode={openMenuMode}
      onLock={lockSession}
      onRemoveItem={removeSubmittedItem}
      onRefresh={refreshSessionFromRelay}
      onSync={syncCart}
      onUpdateItem={updateSubmittedItem}
    />
  )
}
