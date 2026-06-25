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
  resolveSetupCutoffAt,
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

function inferOrganiserName(address: Address) {
  const [name] = address.detail.split(':')
  return name.trim() || 'Organiser'
}

function RouteComponent() {
  const [state, setState] = useReducer(patchSetupState, initialSetupState)
  const setupCutoff = resolveSetupCutoffAt(state.cutoffTime)
  const cutoffError = 'error' in setupCutoff ? setupCutoff.error : null

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
            selectedRestaurantId: '',
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
    const cutoff = resolveSetupCutoffAt(state.cutoffTime)
    if ('error' in cutoff) {
      setState({ error: cutoff.error })
      return
    }

    setState({ pending: true, error: null })
    try {
      const id = crypto.randomUUID()
      const organizerSecret = makeOrganizerSecret()
      const keyPromise = makeSessionKey()
      const invitePromise = keyPromise.then((key) =>
        createSessionInvite(id, key),
      )
      const organizerSecretHashPromise = hashOrganizerSecret(organizerSecret)
      const menuPromise = api<MenuItem[]>(
        `/food/restaurants/${restaurant.id}/menu?addressId=${address.id}`,
      )
      const [key, invite, organizerSecretHash] = await Promise.all([
        keyPromise,
        invitePromise,
        organizerSecretHashPromise,
        menuPromise,
      ])
      const shareUrl = `${window.location.origin}/join?i=${invite.id}`
      const organiserName = inferOrganiserName(address)
      const nextSession: KapiSession = {
        id,
        organiserName,
        address,
        restaurant,
        cutoffTime: formatTimeLabel(state.cutoffTime),
        cutoffAt: cutoff.cutoffAt,
        shareUrl,
        organizerSecretHash,
        status: 'open',
        participants: [],
        items: [],
        audit: [audit(organiserName, 'created session')],
      }
      localStorage.setItem(localKeyKey(id), key)
      localStorage.setItem(localOrganizerKeyKey(id), organizerSecret)
      await publishSession(nextSession, key, {
        role: 'organizer',
        organizerSecret,
      })
      window.location.href = `/review?i=${invite.id}&owner=1`
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
      cutoffError={cutoffError}
      cutoffTime={state.cutoffTime}
      selectedAddressId={state.selectedAddressId}
      selectedRestaurantId={state.selectedRestaurantId}
      onAddressChange={(selectedAddressId) =>
        setState({
          selectedAddressId,
          restaurants: [],
          selectedRestaurantId: '',
        })
      }
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
