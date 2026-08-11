import { useEffect, useReducer, useRef } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { toast } from 'sonner'
import type { KapiSession, MenuItem } from '@kapi/spec'

import { AppHeader } from '#/components/app-header'
import { ErrorAlert } from '#/features/group-ordering/error-alert'
import { ParticipantMenuPage } from '#/features/group-ordering/participant-page'
import { useLiveSessionRecord } from '#/features/group-ordering/use-live-session'
import { WorkspaceLoading } from '#/features/group-ordering/workspace-loading'
import type {
  DraftCart,
  DraftCartLine,
  LoadedSessionRecord,
} from '#/features/group-ordering/shared'
import { buildOrganizerReviewPath } from '#/features/group-ordering/join-target'
import {
  readWorkspaceCache,
  writeWorkspaceCache,
} from '#/features/group-ordering/workspace-cache'
import {
  ApiError,
  addPlainDraftItem,
  applyParticipantSubmission,
  api,
  changeDraftLineQuantity,
  draftCartFromSubmittedItems,
  getOrCreateLocalParticipantId,
  getOrCreateLocalParticipantSecret,
  getSessionLinkParts,
  hasOrganizerCapability,
  isSessionLockedForParticipants,
  loadEncryptedSessionRecord,
  loadStoredDraft,
  localOrganizerKeyKey,
  loadMenuCustomization,
  localParticipantNameKey,
  storeDraft,
  publishSession,
  resolveSessionLinkParts,
  safeLocalStorageGet,
  safeLocalStorageSet,
} from '#/features/group-ordering/shared'

export const Route = createFileRoute('/menu')({
  head: () => ({
    meta: [{ title: 'Menu · kapi.run' }],
  }),
  component: RouteComponent,
})

type MenuState = {
  menu: MenuItem[]
  session: KapiSession | null
  draft: DraftCart
  submittedDraft: DraftCart
  participantName: string
  pending: boolean
  error: string | null
  organizerReviewPath: string | null
  stale: boolean
}

function initialMenuRoute() {
  const requestedParts = getSessionLinkParts()
  const cached = readWorkspaceCache(requestedParts)
  const parts = cached?.parts ?? requestedParts
  const { inviteId, key, sessionId } = parts
  const search = new URLSearchParams(window.location.search)
  const name =
    search.get('name') ??
    (sessionId ? safeLocalStorageGet(localParticipantNameKey(sessionId)) : '')
  const session = cached?.loaded.session ?? null
  const participantId = sessionId
    ? getOrCreateLocalParticipantId(sessionId)
    : ''
  return {
    parts,
    state: {
      menu: cached?.menu ?? [],
      session,
      draft: sessionId ? loadStoredDraft(sessionId) : {},
      submittedDraft: session
        ? draftCartFromSubmittedItems(
            session.items.filter(
              (item) => item.participantId === participantId,
            ),
          )
        : {},
      participantName:
        cached?.isOrganizer && session ? session.organiserName : (name ?? ''),
      pending: false,
      error:
        !inviteId && (!sessionId || !key) ? 'Session link is invalid.' : null,
      organizerReviewPath:
        cached?.isOrganizer && parts.organizerSecret
          ? buildOrganizerReviewPath({
              inviteId: parts.inviteId ?? undefined,
              sessionId: parts.sessionId ?? undefined,
              key: parts.key,
              ownerKey: parts.organizerSecret,
            })
          : null,
      stale: cached?.loaded.relayUpdatedAt === null,
    } satisfies MenuState,
  }
}

function patchMenuState(state: MenuState, patch: Partial<MenuState>) {
  return { ...state, ...patch }
}

function RouteComponent() {
  const initialRef = useRef<ReturnType<typeof initialMenuRoute> | null>(null)
  if (!initialRef.current) initialRef.current = initialMenuRoute()
  const [state, setState] = useReducer(patchMenuState, initialRef.current.state)
  const partsRef = useRef(initialRef.current.parts)
  const sessionKeyRef = useRef(initialRef.current.parts.key ?? '')
  const participantIdRef = useRef(
    initialRef.current.parts.sessionId
      ? getOrCreateLocalParticipantId(initialRef.current.parts.sessionId)
      : '',
  )
  const participantSecretRef = useRef(
    initialRef.current.parts.sessionId
      ? getOrCreateLocalParticipantSecret(initialRef.current.parts.sessionId)
      : '',
  )
  const relayUpdatedAtRef = useRef<string | null>(
    initialRef.current.state.session
      ? (readWorkspaceCache(initialRef.current.parts)?.loaded.relayUpdatedAt ??
          null)
      : null,
  )

  async function refreshSessionFromRelay(): Promise<LoadedSessionRecord | null> {
    if (!state.session || !sessionKeyRef.current) return null
    const loaded = await loadEncryptedSessionRecord(
      state.session.id,
      sessionKeyRef.current,
    )
    relayUpdatedAtRef.current = loaded.relayUpdatedAt
    writeWorkspaceCache({
      parts: partsRef.current,
      loaded,
      isOrganizer: Boolean(state.organizerReviewPath),
      menu: state.menu,
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
      const resolvedParts = await resolveSessionLinkParts(initialParts)
      const { key, organizerSecret, sessionId } = resolvedParts
      if (!sessionId || !key) {
        setState({ error: 'Session link is invalid.' })
        return
      }

      partsRef.current = resolvedParts
      sessionKeyRef.current = key
      participantIdRef.current = getOrCreateLocalParticipantId(sessionId)
      participantSecretRef.current =
        getOrCreateLocalParticipantSecret(sessionId)
      const loadedRecord = await loadEncryptedSessionRecord(sessionId, key)
      relayUpdatedAtRef.current = loadedRecord.relayUpdatedAt
      const loaded = loadedRecord.session
      const isOrganizerMode =
        initialParts.owner &&
        (await hasOrganizerCapability(loaded, organizerSecret))
      if (isOrganizerMode && organizerSecret) {
        safeLocalStorageSet(localOrganizerKeyKey(sessionId), organizerSecret)
      }
      const participantId = participantIdRef.current
      const loadedMenu = await api<MenuItem[]>(
        `/food/restaurants/${loaded.restaurant.id}/menu?addressId=${encodeURIComponent(loaded.address.id)}&sessionId=${encodeURIComponent(sessionId)}`,
        { headers: { 'x-kapi-session-key': key } },
      )
      const search = new URLSearchParams(window.location.search)
      const participantName = isOrganizerMode
        ? loaded.organiserName
        : (search.get('name') ??
          safeLocalStorageGet(localParticipantNameKey(sessionId)) ??
          '')
      writeWorkspaceCache({
        parts: resolvedParts,
        loaded: loadedRecord,
        isOrganizer: isOrganizerMode,
        menu: loadedMenu,
      })
      setState({
        session: loaded,
        menu: loadedMenu,
        organizerReviewPath:
          isOrganizerMode && organizerSecret
            ? buildOrganizerReviewPath({
                inviteId: resolvedParts.inviteId ?? undefined,
                sessionId,
                key,
                ownerKey: organizerSecret,
              })
            : null,
        participantName,
        draft: loadStoredDraft(sessionId),
        submittedDraft: draftCartFromSubmittedItems(
          loaded.items.filter((item) => item.participantId === participantId),
        ),
        error: null,
        stale: loadedRecord.relayUpdatedAt === null,
      })
    }

    loadSession().catch((caught: Error) => setState({ error: caught.message }))
  }, [])

  const sessionId = state.session?.id
  const hasDraftItems = Object.keys(state.draft).length > 0

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
        isOrganizer: Boolean(state.organizerReviewPath),
        menu: state.menu,
      })
      setState({
        session: loaded.session,
        stale: loaded.relayUpdatedAt === null,
      })
    },
    onPoll: refreshSessionFromRelay,
  })

  useEffect(() => {
    if (!sessionId) return
    storeDraft(sessionId, state.draft)
  }, [sessionId, state.draft])

  useEffect(() => {
    if (!hasDraftItems) return
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
    }
    window.addEventListener('beforeunload', warnBeforeUnload)
    return () => window.removeEventListener('beforeunload', warnBeforeUnload)
  }, [hasDraftItems])

  function changeDraftLine(lineId: string, delta: number) {
    setState({
      draft: changeDraftLineQuantity(state.draft, lineId, delta),
    })
  }

  function changeSubmittedLine(lineId: string, delta: number) {
    setState({
      submittedDraft: changeDraftLineQuantity(
        state.submittedDraft,
        lineId,
        delta,
      ),
    })
  }

  function addPlainItem(menuItemId: string) {
    setState({
      draft: addPlainDraftItem(state.draft, menuItemId),
    })
  }

  function addCustomItem(line: Omit<DraftCartLine, 'id'>) {
    const id = crypto.randomUUID()
    setState({
      draft: {
        ...state.draft,
        [id]: { ...line, id },
      },
    })
  }

  async function submitDraft() {
    if (!state.session || !sessionKeyRef.current) return
    const items = [
      ...Object.values(state.submittedDraft),
      ...Object.values(state.draft),
    ]
    if (!items.length) {
      setState({
        error: 'Add at least one item before submitting.',
      })
      return
    }
    if (!state.participantName.trim()) {
      setState({ error: 'Enter your name before submitting.' })
      return
    }

    setState({ pending: true, error: null })
    try {
      const name = state.participantName.trim()
      const participantId =
        participantIdRef.current ||
        getOrCreateLocalParticipantId(state.session.id)
      safeLocalStorageSet(localParticipantNameKey(state.session.id), name)

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
          participantId,
          participantSecret: participantSecretRef.current,
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
          participantId,
          participantSecret: participantSecretRef.current,
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
        submittedDraft: draftCartFromSubmittedItems(
          updated.items.filter((item) => item.participantId === participantId),
        ),
        draft: {},
        error: null,
      })
      toast.success('Your items were submitted.')
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
    return state.error ? (
      <main className="min-h-svh bg-background text-foreground">
        <AppHeader />
        <div className="mx-auto max-w-6xl p-6">
          <ErrorAlert message={state.error} />
        </div>
      </main>
    ) : (
      <WorkspaceLoading />
    )
  }

  return (
    <ParticipantMenuPage
      draft={state.draft}
      error={state.error}
      menu={state.menu}
      organizerReviewPath={state.organizerReviewPath}
      participantName={state.participantName}
      pending={state.pending}
      session={state.session}
      stale={state.stale}
      submittedDraft={state.submittedDraft}
      onAddCustomItem={addCustomItem}
      onAddPlainItem={addPlainItem}
      onLoadCustomization={(item) =>
        loadMenuCustomization({
          addressId: state.session!.address.id,
          item,
          sessionId: state.session!.id,
          sessionKey: sessionKeyRef.current,
        })
      }
      onNameChange={(participantName) => setState({ participantName })}
      onQuantityChange={changeDraftLine}
      onSubmittedQuantityChange={changeSubmittedLine}
      onSubmit={submitDraft}
    />
  )
}
