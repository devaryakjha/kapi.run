import type {
  Address,
  AuthStatus,
  KapiSession,
  MenuItem,
  Restaurant,
} from '@kapi/spec'

import '@knadh/oat/js/dropdown.js'

import { API_URL, api } from './lib/api.ts'
import {
  audit,
  createSessionInvite,
  defaultSetupCutoffTime,
  formatRestaurantLocationMeta,
  formatRestaurantValueMeta,
  formatTimeLabel,
  getSessionLinkParts,
  hashOrganizerSecret,
  localKeyKey,
  localOrganizerKeyKey,
  makeOrganizerSecret,
  makeSessionKey,
  publishSession,
  resolveSetupCutoffAt,
  safeLocalStorageSet,
} from './lib/session.ts'
import { writeWorkspaceCache } from './lib/workspace-cache.ts'
import { bindDismissibleDialog } from './lib/dialog.ts'

type SetupState = {
  addresses: Address[]
  authStatus: AuthStatus
  cutoffTime: string
  error: string | null
  pending: boolean
  restaurantQuery: string
  restaurants: Restaurant[]
  selectedAddressId: string
  selectedRestaurantId: string
}

const state: SetupState = {
  addresses: [],
  authStatus: { connected: false, expiresAt: null },
  cutoffTime: defaultSetupCutoffTime(),
  error: null,
  pending: true,
  restaurantQuery: '',
  restaurants: [],
  selectedAddressId: '',
  selectedRestaurantId: '',
}

const setupForm = required<HTMLFormElement>('.setup-shell')
const accountStep = required<HTMLElement>('[data-step="account"]')
const accountNumber = required<HTMLElement>('[data-step-number]')
const accountDoneLabel = required<HTMLElement>('.setup-step__done-label')
const accountStates = [...document.querySelectorAll<HTMLElement>('[data-account-state]')]
const addressTrigger = required<HTMLButtonElement>('.address-trigger')
const addressTriggerLabel = required<HTMLElement>('[data-address-trigger-label]')
const addressMenu = required<HTMLElement>('[data-address-menu]')
const cutoffInput = required<HTMLInputElement>('#cutoff-time')
const cutoffError = required<HTMLElement>('[data-cutoff-error]')
const restaurantTrigger = required<HTMLButtonElement>('.restaurant-trigger')
const restaurantTriggerEmptyContent = [...restaurantTrigger.childNodes].map((node) =>
  node.cloneNode(true),
)
const restaurantDialog = required<HTMLDialogElement>('#restaurant-dialog')
const restaurantSearch = required<HTMLInputElement>('#restaurant-search')
const restaurantEmpty = required<HTMLElement>('[data-restaurant-empty]')
const restaurantResults = required<HTMLElement>('[data-restaurant-results]')
const restaurantList = required<HTMLElement>('[data-restaurant-list]')
const restaurantTemplate = required<HTMLTemplateElement>('#restaurant-option-template')
const setupError = required<HTMLElement>('.setup-error')
const errorMessage = required<HTMLElement>('[data-error-message]')
const createButton = required<HTMLButtonElement>('.create-session')

let restaurantTimer: number | undefined
let restaurantRequest: AbortController | undefined

cutoffInput.value = state.cutoffTime
bindEvents()
render()
void initialize()

function required<T extends Element>(selector: string) {
  const element = document.querySelector<T>(selector)
  if (!element) throw new Error(`Missing required element: ${selector}`)
  return element
}

function patch(update: Partial<SetupState>) {
  Object.assign(state, update)
  render()
}

async function initialize() {
  const { owner, sessionId } = getSessionLinkParts()
  if (sessionId) {
    window.location.replace(
      `${owner ? '/review/' : '/menu/'}?session=${encodeURIComponent(sessionId)}${owner ? '&owner=1' : ''}${window.location.hash}`,
    )
    return
  }

  const controller = new AbortController()
  window.addEventListener('pagehide', () => controller.abort(), { once: true })

  try {
    const authStatus = await api<AuthStatus>('/auth/status', {
      signal: controller.signal,
    })
    if (!authStatus.connected) {
      patch({ authStatus })
      return
    }

    const addresses = await api<Address[]>('/food/addresses', {
      signal: controller.signal,
    })
    patch({ addresses, authStatus })
  } catch (caught) {
    if (!controller.signal.aborted) {
      patch({ error: errorText(caught) })
    }
  } finally {
    if (!controller.signal.aborted) patch({ pending: false })
  }
}

function bindEvents() {
  bindDismissibleDialog(restaurantDialog)
  for (const button of document.querySelectorAll<HTMLButtonElement>(
    '.account-connect, .account-reconnect',
  )) {
    button.addEventListener('click', connectSwiggy)
  }

  addressMenu.addEventListener('click', (event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>('[data-address-id]')
    if (!button) return
    addressMenu.hidePopover()
    cancelRestaurantSearch()
    patch({
      selectedAddressId: button.dataset.addressId ?? '',
      selectedRestaurantId: '',
      restaurantQuery: '',
      restaurants: [],
    })
  })

  cutoffInput.addEventListener('input', () => {
    patch({ cutoffTime: cutoffInput.value })
  })

  restaurantTrigger.addEventListener('click', () => {
    restaurantDialog.showModal()
    restaurantSearch.value = state.restaurantQuery
    queueMicrotask(() => restaurantSearch.focus())
  })

  restaurantSearch.addEventListener('input', () => {
    state.restaurantQuery = restaurantSearch.value
    state.selectedRestaurantId = ''
    scheduleRestaurantSearch()
    renderRestaurantPicker()
    render()
  })

  restaurantList.addEventListener('click', (event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>(
      '[data-restaurant-id]',
    )
    if (!button || button.disabled) return
    patch({ selectedRestaurantId: button.dataset.restaurantId ?? '' })
    restaurantDialog.close()
  })

  setupForm.addEventListener('submit', (event) => {
    event.preventDefault()
    void createSession()
  })
}

function connectSwiggy() {
  const next = encodeURIComponent(window.location.href)
  window.location.assign(`${API_URL}/auth/start?next=${next}`)
}

function scheduleRestaurantSearch() {
  cancelRestaurantSearch()
  const query = state.restaurantQuery.trim()

  if (!state.selectedAddressId || !query) {
    patch({ pending: false, restaurants: [] })
    return
  }

  restaurantTimer = window.setTimeout(async () => {
    restaurantRequest = new AbortController()
    patch({ error: null, pending: true })

    try {
      const restaurants = await api<Restaurant[]>(
        `/food/restaurants?addressId=${encodeURIComponent(state.selectedAddressId)}&q=${encodeURIComponent(query)}`,
        { signal: restaurantRequest.signal },
      )
      patch({ restaurants, selectedRestaurantId: '' })
    } catch (caught) {
      if (!restaurantRequest.signal.aborted) {
        patch({ error: errorText(caught) })
      }
    } finally {
      if (!restaurantRequest.signal.aborted) patch({ pending: false })
      renderRestaurantPicker()
    }
  }, 350)
}

function cancelRestaurantSearch() {
  if (restaurantTimer !== undefined) window.clearTimeout(restaurantTimer)
  restaurantTimer = undefined
  restaurantRequest?.abort()
  restaurantRequest = undefined
}

async function createSession() {
  const address = state.addresses.find(
    (candidate) => candidate.id === state.selectedAddressId,
  )
  const restaurant = state.restaurants.find(
    (candidate) => candidate.id === state.selectedRestaurantId,
  )
  const cutoff = resolveSetupCutoffAt(state.cutoffTime)

  if (!address || !restaurant || 'error' in cutoff) return

  patch({ error: null, pending: true })

  try {
    const id = crypto.randomUUID()
    const organizerSecret = makeOrganizerSecret()
    const keyPromise = makeSessionKey()
    const invitePromise = keyPromise.then((key) =>
      createSessionInvite(id, key),
    )
    const organizerSecretHashPromise = hashOrganizerSecret(organizerSecret)
    const menuPromise = api<MenuItem[]>(
      `/food/restaurants/${encodeURIComponent(restaurant.id)}/menu?addressId=${encodeURIComponent(address.id)}`,
    )
    const [key, invite, organizerSecretHash, menu] = await Promise.all([
      keyPromise,
      invitePromise,
      organizerSecretHashPromise,
      menuPromise,
    ])
    const organiserName = inferOrganiserName(address)
    const session: KapiSession = {
      id,
      organiserName,
      address,
      restaurant,
      cutoffTime: formatTimeLabel(state.cutoffTime),
      cutoffAt: cutoff.cutoffAt,
      shareUrl: `${window.location.origin}/join?i=${invite.id}`,
      organizerSecretHash,
      status: 'open',
      participants: [],
      items: [],
      audit: [audit(organiserName, 'created session')],
    }

    safeLocalStorageSet(localKeyKey(id), key)
    safeLocalStorageSet(localOrganizerKeyKey(id), organizerSecret)
    const loaded = await publishSession(session, key, {
      expectedUpdatedAt: null,
      role: 'organizer',
      organizerSecret,
    })
    writeWorkspaceCache({
      parts: {
        inviteId: invite.id,
        key,
        organizerSecret,
        owner: true,
        sessionId: id,
      },
      loaded,
      isOrganizer: true,
      menu,
    })
    window.location.assign(`/review?i=${encodeURIComponent(invite.id)}&owner=1`)
  } catch (caught) {
    patch({ error: errorText(caught) })
  } finally {
    patch({ pending: false })
  }
}

function render() {
  const accountState = state.authStatus.connected
    ? 'connected'
    : state.pending
      ? 'loading'
      : 'disconnected'
  for (const element of accountStates) {
    element.hidden = element.dataset.accountState !== accountState
  }

  accountStep.dataset.done = String(state.authStatus.connected)
  accountNumber.textContent = state.authStatus.connected ? '✓' : '1'
  accountDoneLabel.hidden = !state.authStatus.connected

  renderAddresses()

  if (cutoffInput.value !== state.cutoffTime) {
    cutoffInput.value = state.cutoffTime
  }
  const cutoff = resolveSetupCutoffAt(state.cutoffTime)
  cutoffInput.setAttribute('aria-invalid', String('error' in cutoff))
  cutoffError.textContent = 'error' in cutoff ? cutoff.error : ''

  const selectedRestaurant = state.restaurants.find(
    (restaurant) => restaurant.id === state.selectedRestaurantId,
  )
  restaurantTrigger.disabled = !state.selectedAddressId
  restaurantTrigger.dataset.selected = String(Boolean(selectedRestaurant))
  if (selectedRestaurant) {
    const tile = createRestaurantTile(selectedRestaurant)
    restaurantTrigger.replaceChildren(...tile.childNodes)
  } else {
    restaurantTrigger.replaceChildren(
      ...restaurantTriggerEmptyContent.map((node) => node.cloneNode(true)),
    )
  }

  const canCreate =
    !state.pending &&
    state.authStatus.connected &&
    Boolean(state.selectedAddressId) &&
    !('error' in cutoff) &&
    Boolean(state.selectedRestaurantId)
  createButton.disabled = !canCreate
  createButton.setAttribute(
    'aria-busy',
    String(state.pending && Boolean(state.selectedRestaurantId)),
  )

  setupError.hidden = !state.error
  errorMessage.textContent = state.error ?? ''

  renderRestaurantPicker()
}

function renderAddresses() {
  const selected = state.addresses.find(({ id }) => id === state.selectedAddressId)
  addressTriggerLabel.textContent = selected?.label ?? (state.authStatus.connected
    ? 'Choose address'
    : 'Connect first')
  addressTrigger.disabled = !state.authStatus.connected || state.addresses.length === 0
  addressMenu.replaceChildren()

  for (const address of state.addresses) {
    const button = document.createElement('button')
    button.type = 'button'
    button.role = 'menuitem'
    button.className = 'ghost address-option'
    button.dataset.addressId = address.id
    button.setAttribute('popovertarget', 'address-menu')
    button.setAttribute('popovertargetaction', 'hide')
    if (address.id === state.selectedAddressId) {
      button.setAttribute('aria-current', 'true')
    }
    const label = document.createElement('strong')
    label.textContent = address.label
    const detail = document.createElement('small')
    detail.textContent = address.detail
    button.append(label, detail)
    addressMenu.append(button)
  }
}

function renderRestaurantPicker() {
  const query = state.restaurantQuery.trim()
  restaurantResults.hidden = state.restaurants.length === 0
  restaurantEmpty.hidden = state.restaurants.length > 0
  restaurantEmpty.textContent = query
    ? state.pending
      ? 'Searching…'
      : 'No restaurants found.'
    : 'Type to search restaurants.'

  restaurantList.replaceChildren()
  for (const restaurant of state.restaurants) {
    const button = createRestaurantTile(restaurant)
    button.dataset.restaurantId = restaurant.id
    if (restaurant.id === state.selectedRestaurantId) {
      button.setAttribute('aria-current', 'true')
    }
    button.disabled = restaurant.availabilityStatus !== 'OPEN'
    const item = document.createElement('li')
    item.append(button)
    restaurantList.append(item)
  }
}

function createRestaurantTile(restaurant: Restaurant) {
  const fragment = restaurantTemplate.content.cloneNode(true) as DocumentFragment
  const button = fragment.querySelector<HTMLButtonElement>('.restaurant-option')!
  const image = button.querySelector<HTMLElement>('.restaurant-option__image')!
  const title = button.querySelector<HTMLElement>('strong')!
  const location = button.querySelector<HTMLElement>('[data-location]')!
  const value = button.querySelector<HTMLElement>('[data-value]')!
  const rating = button.querySelector<HTMLElement>('[data-rating]')!

  title.textContent = restaurant.name
  location.textContent = formatRestaurantLocationMeta(restaurant)
  value.textContent = formatRestaurantValueMeta(restaurant)
  const ratingValue = rating.querySelector<HTMLElement>('span')!
  rating.hidden = !restaurant.rating
  ratingValue.textContent = restaurant.rating
    ? Number(restaurant.rating).toFixed(1)
    : ''

  if (restaurant.imageUrl) {
    const picture = document.createElement('img')
    picture.src = restaurant.imageUrl
    picture.alt = restaurant.name
    image.replaceChildren(picture)
  }

  return button
}

function inferOrganiserName(address: Address) {
  const [name = ''] = address.detail.split(':')
  return name.trim() || 'Organiser'
}

function errorText(caught: unknown) {
  return caught instanceof Error ? caught.message : 'Could not create session.'
}
