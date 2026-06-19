import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import type { Address, AuthStatus, KapiSession, MenuItem, Restaurant } from '@kapi/spec'

import { OrganizerSetupPage } from '#/features/group-ordering/setup-page'
import {
  API_URL,
  api,
  audit,
  formatTimeLabel,
  getSessionLinkParts,
  localKeyKey,
  makeSessionKey,
  publishSession,
} from '#/features/group-ordering/shared'

export const Route = createFileRoute('/new')({
  component: RouteComponent,
})

function RouteComponent() {
  const [addresses, setAddresses] = useState<Address[]>([])
  const [restaurants, setRestaurants] = useState<Restaurant[]>([])
  const [authStatus, setAuthStatus] = useState<AuthStatus>({ connected: false, expiresAt: null })
  const [selectedAddressId, setSelectedAddressId] = useState('')
  const [selectedRestaurantId, setSelectedRestaurantId] = useState('')
  const [cutoffTime, setCutoffTime] = useState('12:45')
  const [restaurantQuery, setRestaurantQuery] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const { owner, sessionId } = getSessionLinkParts()
    if (sessionId) {
      window.location.replace(`${owner ? '/review' : '/menu'}?session=${sessionId}${owner ? '&owner=1' : ''}${window.location.hash}`)
      return
    }

    api<AuthStatus>('/auth/status')
      .then(async (status) => {
        setAuthStatus(status)
        if (!status.connected) return
        const nextAddresses = await api<Address[]>('/food/addresses')
        setAddresses(nextAddresses)
        setSelectedAddressId(nextAddresses[0]?.id ?? '')
      })
      .catch((caught: Error) => setError(caught.message))
  }, [])

  useEffect(() => {
    const query = restaurantQuery.trim()
    if (!selectedAddressId || !query) {
      setRestaurants([])
      setSelectedRestaurantId('')
      return
    }

    let cancelled = false
    const timer = window.setTimeout(() => {
      setPending(true)
      setError(null)
      api<Restaurant[]>(`/food/restaurants?addressId=${encodeURIComponent(selectedAddressId)}&q=${encodeURIComponent(query)}`)
        .then((nextRestaurants) => {
          if (cancelled) return
          setRestaurants(nextRestaurants)
          setSelectedRestaurantId(nextRestaurants.find((restaurant) => restaurant.availabilityStatus === 'OPEN')?.id ?? '')
        })
        .catch((caught: Error) => {
          if (!cancelled) setError(caught.message)
        })
        .finally(() => {
          if (!cancelled) setPending(false)
        })
    }, 350)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [restaurantQuery, selectedAddressId])

  function connectSwiggy() {
    window.location.href = `${API_URL}/auth/start?next=${encodeURIComponent(window.location.href)}`
  }

  async function createSession() {
    const address = addresses.find((candidate) => candidate.id === selectedAddressId)
    const restaurant = restaurants.find((candidate) => candidate.id === selectedRestaurantId)
    if (!address || !restaurant) return

    setPending(true)
    setError(null)
    try {
      const id = crypto.randomUUID()
      const key = await makeSessionKey()
      const shareUrl = `${window.location.origin}/menu?session=${id}#key=${key}`
      const nextSession: KapiSession = {
        id,
        organiserName: 'Organiser',
        address,
        restaurant,
        cutoffTime: formatTimeLabel(cutoffTime),
        shareUrl,
        status: 'open',
        participants: [],
        items: [],
        audit: [audit('Organiser', 'created session')],
      }
      await api<MenuItem[]>(`/food/restaurants/${restaurant.id}/menu?addressId=${address.id}`)
      localStorage.setItem(localKeyKey(id), key)
      await publishSession(nextSession, key)
      window.location.href = `/review?session=${id}&owner=1#key=${key}`
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not create session.')
    } finally {
      setPending(false)
    }
  }

  return (
    <OrganizerSetupPage
      addresses={addresses}
      authStatus={authStatus}
      error={error}
      pending={pending}
      restaurantQuery={restaurantQuery}
      restaurants={restaurants}
      cutoffTime={cutoffTime}
      selectedAddressId={selectedAddressId}
      selectedRestaurantId={selectedRestaurantId}
      onAddressChange={setSelectedAddressId}
      onConnect={connectSwiggy}
      onCutoffTimeChange={setCutoffTime}
      onCreate={createSession}
      onRestaurantChange={setSelectedRestaurantId}
      onRestaurantQueryChange={setRestaurantQuery}
    />
  )
}
