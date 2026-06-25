import { useEffect, useReducer } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import type {
  Address,
  AuthStatus,
  KapiSession,
  MenuItem,
  Restaurant,
} from '@kapi/spec'

import { OrganizerSetupPage } from '#/features/group-ordering/setup-page'
import {
  API_URL,
  api,
  audit,
  createSessionInvite,
  formatTimeLabel,
  getSessionLinkParts,
  hashOrganizerSecret,
  localKeyKey,
  localOrganizerKeyKey,
  makeOrganizerSecret,
  makeSessionKey,
  publishSession,
} from '#/features/group-ordering/shared'

export const Route = createFileRoute('/new')({
  component: RouteComponent,
})

type SetupState = {
  addresses: Address[]
  restaurants: Restaurant[]
  authStatus: AuthStatus
  selectedAddressId: string
  selectedRestaurantId: string
  cutoffTime: string
  restaurantQuery: string
  pending: boolean
  error: string | null
}

const initialSetupState: SetupState = {
  addresses: [],
  restaurants: [],
  authStatus: { connected: false, expiresAt: null },
  selectedAddressId: '',
  selectedRestaurantId: '',
  cutoffTime: '12:45',
  restaurantQuery: '',
  pending: false,
  error: null,
}

function patchSetupState(state: SetupState, patch: Partial<SetupState>) {
  return { ...state, ...patch }
}

function connectSwiggy() {
  window.location.href = `${API_URL}/auth/start?next=${encodeURIComponent(window.location.href)}`
}

function cutoffAtFromTime(value: string) {
  const [hourValue, minuteValue] = value.split(':')
  const hour = Number(hourValue)
  const minute = Number(minuteValue)
  if (
    !Number.isFinite(hour) ||
    !Number.isFinite(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return cutoffAtFromTime(initialSetupState.cutoffTime)
  }
  const cutoff = new Date()
  cutoff.setHours(hour, minute, 0, 0)
  if (cutoff.getTime() <= Date.now()) {
    cutoff.setDate(cutoff.getDate() + 1)
  }
  return cutoff.toISOString()
}

function inferOrganiserName(address: Address) {
  const [name] = address.detail.split(':')
  return name.trim() || 'Organiser'
}

function RouteComponent() {
  const [state, setState] = useReducer(patchSetupState, initialSetupState)

  useEffect(() => {
    const { owner, sessionId } = getSessionLinkParts()
    if (sessionId) {
      window.location.replace(
        `${owner ? '/review' : '/menu'}?session=${sessionId}${owner ? '&owner=1' : ''}${window.location.hash}`,
      )
      return
    }

    api<AuthStatus>('/auth/status')
      .then(async (status) => {
        if (!status.connected) {
          setState({ authStatus: status })
          return
        }
        const nextAddresses = await api<Address[]>('/food/addresses')
        setState({
          authStatus: status,
          addresses: nextAddresses,
        })
      })
      .catch((caught: Error) => setState({ error: caught.message }))
  }, [])

  useEffect(() => {
    const query = state.restaurantQuery.trim()
    if (!state.selectedAddressId || !query) {
      setState({ restaurants: [], selectedRestaurantId: '' })
      return
    }

    let cancelled = false
    const timer = window.setTimeout(() => {
      setState({ pending: true, error: null })
      api<Restaurant[]>(
        `/food/restaurants?addressId=${encodeURIComponent(state.selectedAddressId)}&q=${encodeURIComponent(query)}`,
      )
        .then((nextRestaurants) => {
          if (cancelled) return
          setState({
            restaurants: nextRestaurants,
            selectedRestaurantId:
              nextRestaurants.find(
                (restaurant) => restaurant.availabilityStatus === 'OPEN',
              )?.id ?? '',
          })
        })
        .catch((caught: Error) => {
          if (!cancelled) setState({ error: caught.message })
        })
        .finally(() => {
          if (!cancelled) setState({ pending: false })
        })
    }, 350)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [state.restaurantQuery, state.selectedAddressId])

  async function createSession() {
    const address = state.addresses.find(
      (candidate) => candidate.id === state.selectedAddressId,
    )
    const restaurant = state.restaurants.find(
      (candidate) => candidate.id === state.selectedRestaurantId,
    )
    if (!address || !restaurant) return

    setState({ pending: true, error: null })
    try {
      const id = crypto.randomUUID()
      const key = await makeSessionKey()
      const organizerSecret = makeOrganizerSecret()
      const invite = await createSessionInvite(id, key)
      const shareUrl = `${window.location.origin}/join?i=${invite.id}`
      const organiserName = inferOrganiserName(address)
      const nextSession: KapiSession = {
        id,
        organiserName,
        address,
        restaurant,
        cutoffTime: formatTimeLabel(state.cutoffTime),
        cutoffAt: cutoffAtFromTime(state.cutoffTime),
        shareUrl,
        organizerSecretHash: await hashOrganizerSecret(organizerSecret),
        status: 'open',
        participants: [],
        items: [],
        audit: [audit(organiserName, 'created session')],
      }
      await api<MenuItem[]>(
        `/food/restaurants/${restaurant.id}/menu?addressId=${address.id}`,
      )
      localStorage.setItem(localKeyKey(id), key)
      localStorage.setItem(localOrganizerKeyKey(id), organizerSecret)
      await publishSession(nextSession, key, {
        role: 'organizer',
        organizerSecret,
      })
      window.location.href = `/review?session=${id}&owner=1#key=${key}&ownerKey=${organizerSecret}`
    } catch (caught) {
      setState({
        error:
          caught instanceof Error
            ? caught.message
            : 'Could not create session.',
      })
    } finally {
      setState({ pending: false })
    }
  }

  return (
    <OrganizerSetupPage
      addresses={state.addresses}
      authStatus={state.authStatus}
      error={state.error}
      pending={state.pending}
      restaurantQuery={state.restaurantQuery}
      restaurants={state.restaurants}
      cutoffTime={state.cutoffTime}
      selectedAddressId={state.selectedAddressId}
      selectedRestaurantId={state.selectedRestaurantId}
      onAddressChange={(selectedAddressId) => setState({ selectedAddressId })}
      onConnect={connectSwiggy}
      onCutoffTimeChange={(cutoffTime) => setState({ cutoffTime })}
      onCreate={createSession}
      onRestaurantChange={(selectedRestaurantId) =>
        setState({ selectedRestaurantId })
      }
      onRestaurantQueryChange={(restaurantQuery) =>
        setState({ restaurantQuery })
      }
    />
  )
}
