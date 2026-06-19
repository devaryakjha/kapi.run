import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import type { CartLine, KapiSession, MenuItem } from '@kapi/spec'

import { ParticipantMenuPage } from '#/features/group-ordering/participant-page'
import type { DraftCart } from '#/features/group-ordering/shared'
import { ErrorAlert, api, audit, getSessionLinkParts, loadEncryptedSession, publishSession } from '#/features/group-ordering/shared'

export const Route = createFileRoute('/menu')({
  component: RouteComponent,
})

function RouteComponent() {
  const [menu, setMenu] = useState<MenuItem[]>([])
  const [session, setSession] = useState<KapiSession | null>(null)
  const [draft, setDraft] = useState<DraftCart>({})
  const [participantName, setParticipantName] = useState('Alex')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sessionKey, setSessionKey] = useState('')

  async function refreshSessionFromRelay() {
    if (!session || !sessionKey) return session
    const loaded = await loadEncryptedSession(session.id, sessionKey)
    setSession(loaded)
    return loaded
  }

  useEffect(() => {
    const { key, sessionId } = getSessionLinkParts()
    if (!sessionId || !key) {
      setError('Session link is invalid.')
      return
    }

    setSessionKey(key)
    loadEncryptedSession(sessionId, key)
      .then(async (loaded) => {
        const loadedMenu = await api<MenuItem[]>(`/food/restaurants/${loaded.restaurant.id}/menu?addressId=${loaded.address.id}`)
        setSession(loaded)
        setMenu(loadedMenu)
      })
      .catch((caught: Error) => setError(caught.message))
  }, [])

  function changeDraft(menuItemId: string, delta: number) {
    setDraft((current) => {
      const nextQuantity = Math.max((current[menuItemId] ?? 0) + delta, 0)
      const next = { ...current }
      if (nextQuantity === 0) {
        delete next[menuItemId]
      } else {
        next[menuItemId] = nextQuantity
      }
      return next
    })
  }

  async function submitDraft() {
    if (!session || !sessionKey) return
    const items = Object.entries(draft).map(([menuItemId, quantity]) => ({ menuItemId, quantity }))
    if (!items.length) {
      setError('Add at least one item before submitting.')
      return
    }

    setPending(true)
    setError(null)
    try {
      const latest = await refreshSessionFromRelay()
      if (!latest) return
      const submitted: CartLine[] = items.flatMap((line) => {
        const item = menu.find((candidate) => candidate.id === line.menuItemId && candidate.restaurantId === latest.restaurant.id)
        if (!item || line.quantity <= 0) return []
        return {
          id: crypto.randomUUID(),
          participantName: participantName.trim() || 'Guest',
          menuItemId: item.id,
          name: item.name,
          quantity: line.quantity,
          price: item.price,
          available: item.available,
          swiggyItemId: item.swiggyItemId,
        }
      })
      const name = participantName.trim() || 'Guest'
      const existingParticipant = latest.participants.find((participant) => participant.displayName === name)
      const updated: KapiSession = {
        ...latest,
        participants: existingParticipant
          ? latest.participants.map((participant) => participant.displayName === name ? { ...participant, status: 'submitted', submittedAt: new Date().toISOString() } : participant)
          : [...latest.participants, { id: crypto.randomUUID(), displayName: name, status: 'submitted', joinedAt: new Date().toISOString(), submittedAt: new Date().toISOString() }],
        items: [...latest.items.filter((item) => item.participantName !== name), ...submitted],
        audit: [...latest.audit, audit(name, `submitted ${submitted.length} item lines`)],
      }
      await publishSession(updated, sessionKey)
      setSession(updated)
      setDraft({})
      setError('Items added to the group cart.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not submit items.')
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
    <ParticipantMenuPage
      draft={draft}
      error={error}
      menu={menu}
      participantName={participantName}
      pending={pending}
      session={session}
      onNameChange={setParticipantName}
      onQuantityChange={changeDraft}
      onSubmit={submitDraft}
    />
  )
}
