import { useEffect, useState } from 'react'
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

function RouteComponent() {
  const [session, setSession] = useState<KapiSession | null>(null)
  const [fallback, setFallback] = useState<ManualFallbackSummary | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sessionKey, setSessionKey] = useState('')
  const [isOrganizer, setIsOrganizer] = useState(false)

  async function saveSession(nextSession: KapiSession) {
    if (!sessionKey) throw new Error('Session key is missing.')
    const saved = await publishSession(nextSession, sessionKey)
    setSession(saved)
    return saved
  }

  async function refreshSessionFromRelay() {
    if (!session || !sessionKey) return
    const loaded = await loadEncryptedSession(session.id, sessionKey)
    setSession(loaded)
  }

  useEffect(() => {
    const { key, owner, sessionId } = getSessionLinkParts()
    setIsOrganizer(owner)
    if (!sessionId || !key) {
      setError('Session link is invalid.')
      return
    }

    setSessionKey(key)
    loadEncryptedSession(sessionId, key)
      .then(setSession)
      .catch((caught: Error) => setError(caught.message))
  }, [])

  async function syncCart() {
    if (!session) return
    if (!window.confirm('Add these items to your Swiggy cart? This will not place the order.')) return
    setPending(true)
    setError(null)
    try {
      const result = await api<KapiSession['sync']>('/food/cart/sync', {
        method: 'POST',
        body: JSON.stringify(makeCartPayload(session)),
      })
      await saveSession({
        ...session,
        status: result?.status === 'synced' ? 'synced' : 'sync_failed',
        items: session.items.map((item) => ({ ...item, synced: item.available && result?.status === 'synced' })),
        sync: result,
        audit: [...session.audit, audit('Organiser', 'synced cart to Swiggy')],
      })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not sync cart.')
    } finally {
      setPending(false)
    }
  }

  async function lockSession() {
    if (!session) return
    setPending(true)
    setError(null)
    try {
      await saveSession({ ...session, status: 'locked', audit: [...session.audit, audit('Organiser', 'locked session')] })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not lock session.')
    } finally {
      setPending(false)
    }
  }

  async function updateSubmittedItem(itemId: string, quantity: number) {
    if (!session) return
    setPending(true)
    setError(null)
    try {
      await saveSession({
        ...session,
        items: session.items.map((item) => item.id === itemId ? { ...item, quantity: Math.max(1, Math.floor(quantity)) } : item),
        audit: [...session.audit, audit('Organiser', 'updated item')],
      })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not update item.')
    } finally {
      setPending(false)
    }
  }

  async function removeSubmittedItem(itemId: string) {
    if (!session) return
    setPending(true)
    setError(null)
    try {
      await saveSession({
        ...session,
        items: session.items.filter((item) => item.id !== itemId),
        audit: [...session.audit, audit('Organiser', 'removed item')],
      })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not remove item.')
    } finally {
      setPending(false)
    }
  }

  async function loadManualFallback() {
    if (!session) return
    setPending(true)
    setError(null)
    try {
      setFallback(makeManualFallback(session))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not build manual fallback.')
    } finally {
      setPending(false)
    }
  }

  if (!session) {
    return (
      <main className="min-h-svh bg-background p-6 text-foreground">
        <ErrorAlert message={error} />
      </main>
    )
  }

  return (
    <OrganizerReviewPage
      error={error}
      fallback={fallback}
      isOrganizer={isOrganizer}
      pending={pending}
      session={session}
      onFallback={loadManualFallback}
      onLock={lockSession}
      onRemoveItem={removeSubmittedItem}
      onRefresh={refreshSessionFromRelay}
      onSync={syncCart}
      onUpdateItem={updateSubmittedItem}
    />
  )
}
