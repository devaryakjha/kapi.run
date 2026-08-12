import type { CartCustomization, KapiSession, MenuAddonGroup, MenuCustomization, MenuItem, MenuVariantGroup } from '@kapi/spec'

import { toast } from '@knadh/oat/js/toast.js'

import './styles/base.css'
import './styles/session.css'
import './styles/menu.css'

import { api } from './lib/api.ts'
import { renderAccountPopover } from './lib/account-popover.ts'
import {
  initialAddonSelections,
  toggleAddonSelection,
} from './lib/addon-selection.ts'
import { startLiveCountdown } from './lib/countdown.ts'
import {
  customizationCacheKey,
  readCustomizationCache,
  writeCustomizationCache,
} from './lib/customization-cache.ts'
import { bindDismissibleDialog } from './lib/dialog.ts'
import { buildOrganizerReviewPath } from './lib/join-target.ts'
import {
  addPlainDraftItem,
  applyParticipantSubmission,
  changeDraftLineQuantity,
  getOrCreateLocalParticipantId,
  getOrCreateLocalParticipantSecret,
  getSessionLinkParts,
  hasOrganizerCapability,
  isSessionLockedForParticipants,
  loadEncryptedSessionRecord,
  loadStoredDraft,
  localParticipantNameKey,
  publishSession,
  resolveSessionLinkParts,
  safeLocalStorageGet,
  storeDraft,
  type DraftCart,
  type LoadedSessionRecord,
  type SessionLinkParts,
} from './lib/session.ts'
import { readWorkspaceCache, writeWorkspaceCache } from './lib/workspace-cache.ts'

function required<T extends Element>(selector: string) {
  const element = document.querySelector<T>(selector)
  if (!element) throw new Error(`Missing element: ${selector}`)
  return element
}

const workspace = required<HTMLElement>('.menu-workspace')
const workspaceLoading = required<HTMLElement>('.workspace-loading')
const workspaceError = required<HTMLElement>('.workspace-error')
const workspaceErrorMessage = required<HTMLElement>('[data-workspace-error]')
const restaurantName = required<HTMLElement>('[data-restaurant-name]')
const timer = required<HTMLElement>('[data-timer]')
const reviewLink = required<HTMLAnchorElement>('[data-review-link]')
const avatar = required<HTMLElement>('[data-avatar]')
const avatarTrigger = required<HTMLElement>('[data-avatar-trigger]')
const searchInput = required<HTMLInputElement>('#menu-search')
const categoryList = required<HTMLElement>('.category-list')
const savedCopy = required<HTMLElement>('.saved-copy')
const menuGrid = required<HTMLElement>('.menu-grid')
const menuEmpty = required<HTMLElement>('.menu-empty')
const menuTemplate = required<HTMLTemplateElement>('#menu-card-template')
const cartDialog = required<HTMLDialogElement>('.cart-dialog')
const cartCount = required<HTMLElement>('[data-cart-count]')
const cartSummary = required<HTMLElement>('[data-cart-summary]')
const cartName = required<HTMLInputElement>('#cart-participant-name')
const cartEmpty = required<HTMLElement>('.cart-empty')
const cartLines = required<HTMLElement>('.cart-lines')
const cartLineList = required<HTMLUListElement>('[data-cart-line-list]')
const cartFooter = required<HTMLElement>('.cart-footer')
const cartTotal = required<HTMLElement>('[data-cart-total]')
const cartItemsTotal = required<HTMLElement>('[data-cart-items-total]')
const itemDialog = required<HTMLDialogElement>('.item-dialog')
const itemForm = required<HTMLFormElement>('.item-dialog__form')
const itemOptions = required<HTMLElement>('[data-item-options]')
const accountPopover = required<HTMLElement>('#menu-account')

let session: KapiSession | null = null
let menu: MenuItem[] = []
let draft: DraftCart = {}
let participantName = ''
let query = ''
let activeCategory = 'All'
let stale = false
let error: string | null = null
let activeItem: MenuItem | null = null
let sessionKey = ''
let participantId = ''
let participantSecret = ''
let customization: MenuCustomization | null = null
let selectedVariants: Record<string, string> = {}
let selectedAddons: Record<string, string[]> = {}
let isOrganizer = false
let organizerReviewPath: string | null = null
let activeParts: SessionLinkParts | null = null
let relayUpdatedAt: string | null = null
const customizationRequests = new Map<string, Promise<MenuCustomization>>()

const lockedMessage = 'This group order is locked. No changes can be made.'

const menuFreshFor = 5 * 60 * 1000
const refreshTimer = startLiveCountdown(timer, () => session)

bindEvents()
void initialize()

async function initialize() {
  const requestedParts = getSessionLinkParts()
  const cached = readWorkspaceCache(requestedParts)
  const startingParts = cached
    ? {
        ...cached.parts,
        owner: requestedParts.owner,
        organizerSecret: requestedParts.owner
          ? cached.parts.organizerSecret
          : null,
      }
    : requestedParts

  try {
    if (cached?.menu?.length) {
      const cachedOrganizer =
        startingParts.owner &&
        (await hasOrganizerCapability(
          cached.loaded.session,
          startingParts.organizerSecret,
        ))
      applyWorkspace(startingParts, cached.loaded, cached.menu, cachedOrganizer)
      render()
    }

    const parts = await resolveSessionLinkParts(startingParts)
    if (!parts.sessionId || !parts.key) throw new Error('Session link is invalid.')
    const loaded = await loadEncryptedSessionRecord(parts.sessionId, parts.key)
    const organizer =
      parts.owner &&
      (await hasOrganizerCapability(loaded.session, parts.organizerSecret))
    const cacheMatchesRestaurant =
      cached?.loaded.session.restaurant.id === loaded.session.restaurant.id
    const cachedMenuIsFresh =
      cacheMatchesRestaurant &&
      Boolean(cached?.menu?.length) &&
      Date.now() - (cached?.menuCachedAt ?? 0) < menuFreshFor
    const nextMenu = cachedMenuIsFresh
      ? cached!.menu!
      : await api<MenuItem[]>(
          `/food/restaurants/${loaded.session.restaurant.id}/menu?addressId=${encodeURIComponent(loaded.session.address.id)}&sessionId=${encodeURIComponent(loaded.session.id)}`,
          { headers: { 'x-kapi-session-key': parts.key } },
        )
    applyWorkspace(parts, loaded, nextMenu, organizer)
    writeWorkspaceCache({
      parts,
      loaded,
      isOrganizer: organizer,
      ...(cachedMenuIsFresh ? {} : { menu: nextMenu }),
    })
  } catch (caught) {
    if (session) stale = true
    else error = caught instanceof Error ? caught.message : 'Could not load this order.'
  } finally {
    render()
  }
}

function applyWorkspace(
  parts: SessionLinkParts,
  loaded: LoadedSessionRecord,
  nextMenu: MenuItem[],
  organizer: boolean,
) {
  if (!parts.sessionId || !parts.key) return
  activeParts = parts
  sessionKey = parts.key
  participantId = getOrCreateLocalParticipantId(parts.sessionId)
  participantSecret = getOrCreateLocalParticipantSecret(parts.sessionId)
  session = loaded.session
  relayUpdatedAt = loaded.relayUpdatedAt
  menu = nextMenu
  isOrganizer = organizer
  organizerReviewPath = organizer
    ? buildOrganizerReviewPath({
        inviteId: parts.inviteId ?? undefined,
        sessionId: parts.sessionId,
        key: parts.key,
        ownerKey: parts.organizerSecret,
      })
    : null
  stale = loaded.relayUpdatedAt === null
  participantName = safeLocalStorageGet(localParticipantNameKey(parts.sessionId)) ?? ''
  draft = loadStoredDraft(parts.sessionId)
  error = null
}

function bindEvents() {
  bindDismissibleDialog(cartDialog)
  bindDismissibleDialog(itemDialog)
  searchInput.addEventListener('input', () => {
    query = searchInput.value
    if (query) activeCategory = 'All'
    renderMenu()
  })
  categoryList.addEventListener('click', (event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>('button[data-category]')
    if (!button) return
    activeCategory = button.dataset.category ?? 'All'
    query = ''
    searchInput.value = ''
    renderMenu()
  })
  menuGrid.addEventListener('click', handleMenuClick)
  required<HTMLButtonElement>('.cart-trigger').addEventListener('click', () => cartDialog.showModal())
  required<HTMLButtonElement>('.cart-close').addEventListener('click', () => cartDialog.close())
  cartName.addEventListener('input', () => {
    participantName = cartName.value
    if (session) localStorage.setItem(localParticipantNameKey(session.id), participantName)
  })
  cartLines.addEventListener('click', (event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>('button[data-line-id]')
    if (!button) return
    if (button.dataset.locked !== undefined) { announceLocked(); return }
    changeQuantity(button.dataset.lineId ?? '', Number(button.dataset.delta))
  })
  required<HTMLButtonElement>('.item-dialog__close').addEventListener('click', () => itemDialog.close())
  itemForm.addEventListener('submit', (event) => {
    event.preventDefault()
    if (!activeItem) return
    if (session && isSessionLockedForParticipants(session)) { announceLocked(); return }
    if (customization) addCustomizedItem(activeItem)
    else addItem(activeItem.id)
    itemDialog.close()
  })
  required<HTMLButtonElement>('.cart-submit').addEventListener('click', () => void submitDraft())
}

async function submitDraft() {
  if (!session || !sessionKey || !Object.keys(draft).length) return
  if (isSessionLockedForParticipants(session)) { announceLocked(); return }
  const name = participantName.trim()
  if (!name) {
    cartName.focus()
    return
  }
  const button = required<HTMLButtonElement>('.cart-submit')
  button.disabled = true
  button.textContent = 'Submitting…'
  try {
    const updated = applyParticipantSubmission({
      latest: session,
      menu,
      participantId,
      participantName: name,
      draftItems: Object.values(draft),
    })
    const saved = await publishSession(updated, sessionKey, {
      expectedUpdatedAt: relayUpdatedAt,
      participantId,
      participantSecret,
      role: 'participant',
    })
    session = updated
    relayUpdatedAt = saved.relayUpdatedAt
    if (activeParts) {
      writeWorkspaceCache({
        parts: activeParts,
        loaded: { session: updated, relayUpdatedAt: saved.relayUpdatedAt },
        isOrganizer,
      })
    }
    draft = {}
    storeDraft(session.id, draft)
    renderMenu()
    renderCart()
    button.textContent = 'Update my items'
    cartDialog.close()
    toast('Your items are now visible to the group.', 'Items submitted', {
      placement: 'bottom-center',
      variant: 'success',
    })
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : 'Could not submit items.'
    button.textContent = 'Submit items'
    toast(message, 'Could not submit items', {
      placement: 'bottom-center',
      variant: 'danger',
    })
  } finally {
    button.disabled = false
  }
}

function handleMenuClick(event: MouseEvent) {
  const button = (event.target as Element).closest<HTMLButtonElement>('button[data-action]')
  if (!button) return
  if (button.dataset.locked !== undefined) { announceLocked(); return }
  const itemId = button.dataset.itemId ?? ''
  if (button.dataset.action === 'add') addItem(itemId)
  if (button.dataset.action === 'remove') changeQuantity(itemId, -1)
  if (button.dataset.action === 'view') showItem(itemId)
}

function addItem(itemId: string) {
  if (!session) return
  if (isSessionLockedForParticipants(session)) { announceLocked(); return }
  draft = addPlainDraftItem(draft, itemId)
  storeDraft(session.id, draft)
  renderMenu()
  renderCart()
}

function changeQuantity(lineId: string, delta: number) {
  if (!session) return
  if (isSessionLockedForParticipants(session)) { announceLocked(); return }
  draft = changeDraftLineQuantity(draft, lineId, delta)
  storeDraft(session.id, draft)
  renderMenu()
  renderCart()
}

function render() {
  workspaceLoading.hidden = true
  workspaceError.hidden = !error
  workspaceErrorMessage.textContent = error ?? ''
  workspace.hidden = !session || Boolean(error)
  if (!session) return

  restaurantName.textContent = session.restaurant.name
  reviewLink.hidden = !organizerReviewPath
  if (organizerReviewPath) reviewLink.href = organizerReviewPath
  searchInput.placeholder = `Search ${session.restaurant.name} menu…`
  participantName ||= session.organiserName
  avatar.textContent = (participantName || session.organiserName).trim().charAt(0).toUpperCase()
  renderAccountPopover({
    addressDetail: session.address.detail,
    addressLabel: session.address.label,
    connected: isOrganizer,
    name: participantName || session.organiserName,
    popover: accountPopover,
    trigger: avatarTrigger,
  })
  cartName.value = participantName
  savedCopy.hidden = !stale
  refreshTimer()
  renderCategories()
  renderMenu()
  renderCart()
}

function renderCategories() {
  const categories = ['All', ...new Set(menu.map((item) => item.category).filter(Boolean))]
  categoryList.hidden = categories.length <= 2
  categoryList.replaceChildren()
  for (const category of categories) {
    const item = document.createElement('li')
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'badge outline'
    button.dataset.category = category
    button.dataset.active = String(activeCategory === category && !query)
    button.setAttribute('aria-pressed', String(activeCategory === category && !query))
    button.textContent = category
    item.append(button)
    categoryList.append(item)
  }
}

function renderMenu() {
  if (!session) return
  const normalized = query.trim().toLowerCase()
  const filtered = [...new Map(menu.map((item) => [item.id, item])).values()].filter(
    (item) =>
      (activeCategory === 'All' || item.category === activeCategory) &&
      (!normalized || `${item.name} ${item.category} ${item.description}`.toLowerCase().includes(normalized)),
  )
  menuEmpty.hidden = filtered.length > 0
  menuGrid.replaceChildren()
  for (const item of filtered) menuGrid.append(createMenuCard(item))
  updateCartCount()
}

function createMenuCard(item: MenuItem) {
  const fragment = menuTemplate.content.cloneNode(true) as DocumentFragment
  const card = fragment.querySelector<HTMLElement>('.menu-card')!
  const media = card.querySelector<HTMLButtonElement>('.menu-card__media')!
  const name = card.querySelector<HTMLButtonElement>('.menu-card__name')!
  const description = card.querySelector<HTMLElement>('.menu-card__description')!
  const price = card.querySelector<HTMLElement>('.menu-card__price')!
  const controls = card.querySelector<HTMLElement>('.menu-card__controls')!
  const quantity = draft[item.id]?.quantity ?? 0

  card.dataset.selected = String(quantity > 0)
  card.toggleAttribute('data-unavailable', !item.available)
  media.dataset.action = 'view'; media.dataset.itemId = item.id
  media.setAttribute('aria-label', `View ${item.name}`)
  name.dataset.action = 'view'; name.dataset.itemId = item.id; name.textContent = item.name
  description.textContent = item.description
  price.textContent = `₹${item.price}`
  card.querySelector<HTMLElement>('.veg-mark')!.hidden = !item.tags?.includes('Veg')
  if (item.imageUrl) {
    const image = document.createElement('img')
    image.src = item.imageUrl; image.alt = item.name; image.loading = 'lazy'; image.decoding = 'async'
    media.prepend(image)
  }

  if (quantity > 0) {
    controls.append(
      controlButton('−', 'remove', item.id, `Remove ${item.name}`),
      Object.assign(document.createElement('strong'), { textContent: String(quantity) }),
      controlButton('+', 'add', item.id, `Add ${item.name}`),
    )
    controls.className = 'menu-card__controls quantity-control flex items-center'
  } else {
    const customizable = Boolean(item.hasVariants || item.hasAddons)
    const add = controlButton(
      `＋ ${customizable ? 'Customize' : 'Add'}`,
      customizable ? 'view' : 'add',
      item.id,
      '',
    )
    add.className = 'outline small add-control'
    add.disabled = !item.available
    setLockedInteraction(add, isSessionLockedForParticipants(session!))
    controls.append(add)
  }
  return card
}

function controlButton(text: string, action: string, itemId: string, label: string) {
  const button = document.createElement('button')
  button.type = 'button'; button.dataset.action = action; button.dataset.itemId = itemId
  button.textContent = text
  if (label) button.setAttribute('aria-label', label)
  return button
}

function updateCartCount() {
  const count = Object.values(draft).reduce((sum, line) => sum + line.quantity, 0)
  cartCount.hidden = count === 0
  cartCount.textContent = count > 99 ? '99+' : String(count)
  cartSummary.textContent = `${count} ${count === 1 ? 'item' : 'items'}`
}

function renderCart() {
  updateCartCount()
  const lines = Object.values(draft).flatMap((line) => {
    const item = menu.find((candidate) => candidate.id === line.menuItemId)
    return item ? [{ item, line }] : []
  })
  cartEmpty.hidden = lines.length > 0
  cartLines.hidden = lines.length === 0
  cartFooter.hidden = lines.length === 0
  cartLineList.replaceChildren()
  let total = 0
  for (const { item, line } of lines) {
    total += (line.unitPrice ?? item.price) * line.quantity
    const row = document.createElement('li'); row.className = 'cart-line flex justify-between'
    const copy = document.createElement('span'); copy.className = 'cart-line__copy'
    const title = document.createElement('strong'); title.textContent = item.name
    const value = document.createElement('small'); value.className = 'text-light'; value.textContent = `₹${line.unitPrice ?? item.price} × ${line.quantity}`
    copy.append(title, value)
    if (line.customizationSummary) {
      const options = document.createElement('small')
      options.className = 'cart-line__customization text-light'
      options.textContent = line.customizationSummary
      copy.append(options)
    }
    const controls = document.createElement('span'); controls.className = 'cart-line__controls flex items-center'
    controls.append(
      cartLineButton('−', line.id, -1, `Decrease ${item.name}`),
      Object.assign(document.createElement('b'), { textContent: String(line.quantity) }),
      cartLineButton('+', line.id, 1, `Increase ${item.name}`),
    )
    row.append(copy, controls); cartLineList.append(row)
  }
  cartTotal.textContent = `₹${total}`
  cartItemsTotal.textContent = `₹${total}`
  setLockedInteraction(
    required<HTMLButtonElement>('.cart-submit'),
    Boolean(session && isSessionLockedForParticipants(session)),
  )
}

function cartLineButton(text: string, lineId: string, delta: number, label: string) {
  const button = document.createElement('button'); button.type = 'button'; button.textContent = text
  button.dataset.lineId = lineId; button.dataset.delta = String(delta)
  button.setAttribute('aria-label', label)
  setLockedInteraction(button, Boolean(session && isSessionLockedForParticipants(session)))
  return button
}

function setLockedInteraction(element: HTMLElement, locked: boolean) {
  element.toggleAttribute('data-locked', locked)
  if (locked) {
    element.setAttribute('aria-describedby', 'locked-control-help')
    element.setAttribute('title', lockedMessage)
  } else {
    element.removeAttribute('aria-describedby')
    element.removeAttribute('title')
  }
}

function announceLocked() {
  toast(lockedMessage, 'Order locked', {
    duration: 2600,
    placement: 'bottom-center',
    variant: 'warning',
  })
}

function showItem(itemId: string) {
  const item = menu.find((candidate) => candidate.id === itemId)
  if (!item) return
  activeItem = item
  customization = null
  selectedVariants = {}
  selectedAddons = {}
  itemOptions.hidden = true
  itemOptions.replaceChildren()
  required<HTMLElement>('[data-item-name]').textContent = item.name
  required<HTMLElement>('[data-item-price]').textContent = `₹${item.price}`
  const rating = required<HTMLElement>('[data-item-rating]')
  rating.hidden = !item.rating
  rating.textContent = item.rating
    ? `★ ${Number(item.rating).toFixed(1)}${item.totalRatings ? ` (${item.totalRatings})` : ''}`
    : ''
  const category = required<HTMLElement>('[data-item-category]')
  category.hidden = !item.category
  category.textContent = item.category
  required<HTMLElement>('[data-item-description]').textContent = item.description
  const media = required<HTMLElement>('.item-dialog__media'); media.replaceChildren()
  if (item.imageUrl) {
    const backdrop = document.createElement('img')
    backdrop.className = 'item-dialog__media-backdrop'
    backdrop.src = item.imageUrl
    backdrop.alt = ''
    backdrop.setAttribute('aria-hidden', 'true')
    const image = document.createElement('img')
    image.className = 'item-dialog__media-image'
    image.src = item.imageUrl
    image.alt = item.name
    media.append(backdrop, image)
  } else {
    media.textContent = '♜'
  }
  const add = required<HTMLButtonElement>('.item-dialog__add')
  required<HTMLElement>('[data-item-add-label]').textContent = `Add item · ₹${item.price}`
  add.disabled = !item.available
  setLockedInteraction(add, isSessionLockedForParticipants(session!))
  itemDialog.showModal()
  const itemError = required<HTMLElement>('.item-dialog__error')
  itemError.hidden = true
  if (item.hasVariants || item.hasAddons) {
    const cacheKey = customizationCacheKey(
      session!.id,
      item.restaurantId,
      item.swiggyItemId,
    )
    const cachedDetail = readCustomizationCache(sessionStorage, cacheKey)
    if (cachedDetail) {
      applyCustomization(item, cachedDetail)
      return
    }
    add.disabled = true
    required<HTMLElement>('[data-item-add-label]').textContent = 'Loading options'
    let request = customizationRequests.get(cacheKey)
    if (!request) {
      request = api<MenuCustomization>(
        `/food/restaurants/${item.restaurantId}/menu/${item.swiggyItemId}/customization?addressId=${encodeURIComponent(session!.address.id)}&q=${encodeURIComponent(item.name)}&sessionId=${encodeURIComponent(session!.id)}`,
        { headers: { 'x-kapi-session-key': sessionKey } },
      )
      customizationRequests.set(cacheKey, request)
    }
    void request.then((detail) => {
      writeCustomizationCache(sessionStorage, cacheKey, detail)
      if (activeItem?.id !== item.id) return
      applyCustomization(item, detail)
    }).catch((caught) => {
        itemError.hidden = false
        required<HTMLElement>('[data-item-error]').textContent =
          caught instanceof Error ? caught.message : 'Could not load options.'
      }).finally(() => {
        customizationRequests.delete(cacheKey)
        if (activeItem?.id === item.id) updateItemAddButton()
      })
  }
}

function applyCustomization(item: MenuItem, detail: MenuCustomization) {
  if (activeItem?.id !== item.id) return
  customization = detail
  const rating = detail.rating || item.rating
  const totalRatings = detail.totalRatings || item.totalRatings
  const ratingElement = required<HTMLElement>('[data-item-rating]')
  ratingElement.hidden = !rating
  ratingElement.textContent = rating
    ? `★ ${Number(rating).toFixed(1)}${totalRatings ? ` (${totalRatings})` : ''}`
    : ''
  required<HTMLElement>('[data-item-description]').textContent = detail.description || item.description
  selectedVariants = defaultVariantSelections(detail.variantsV2 ?? [])
  selectedAddons = initialAddonSelections(detail.addons ?? [])
  renderItemOptions()
}

function renderItemOptions() {
  if (!customization) return
  itemOptions.replaceChildren()
  for (const group of customization.variantsV2 ?? []) itemOptions.append(variantGroup(group))
  for (const group of customization.addons ?? []) itemOptions.append(addonGroup(group))
  itemOptions.hidden = itemOptions.childElementCount === 0
  updateItemAddButton()
}

function variantGroup(group: MenuVariantGroup) {
  const root = optionGroup(group.name)
  const list = root.querySelector<HTMLElement>('.item-option-list')!
  for (const choice of group.variations) {
    const input = document.createElement('input')
    input.type = 'radio'; input.name = `variant-${group.groupId}`; input.value = choice.id
    input.checked = selectedVariants[group.groupId] === choice.id; input.disabled = choice.inStock === false
    input.addEventListener('change', () => { selectedVariants[group.groupId] = choice.id; updateItemAddButton() })
    list.append(optionRow(input, choice.name, choice.price ? `+₹${choice.price}` : ''))
  }
  return root
}

function addonGroup(group: MenuAddonGroup) {
  const root = optionGroup(group.groupName, addonRuleText(group))
  root.dataset.field = ''
  const list = root.querySelector<HTMLElement>('.item-option-list')!
  const rule = root.querySelector<HTMLElement>('[data-option-rule]')
  const error = document.createElement('small')
  const errorId = `addon-error-${crypto.randomUUID()}`
  error.className = 'error'
  error.id = errorId
  error.role = 'status'
  root.insertBefore(error, list)

  function updateGroupFeedback(limitReached = false) {
    const selected = selectedAddons[group.groupId] ?? []
    if (rule) rule.textContent = addonRuleText(group, selected.length)
    error.textContent = limitReached
      ? `Maximum ${group.maxAddons} selected. Remove one to choose another.`
      : ''
    if (limitReached) root.setAttribute('aria-invalid', 'true')
    else root.removeAttribute('aria-invalid')
  }

  for (const choice of group.choices) {
    const input = document.createElement('input')
    input.type = 'checkbox'; input.value = choice.id
    input.setAttribute('aria-describedby', errorId)
    input.checked = selectedAddons[group.groupId]?.includes(choice.id) ?? false
    input.addEventListener('change', () => {
      const selected = selectedAddons[group.groupId] ?? []
      const result = toggleAddonSelection(selected, choice.id, group.maxAddons)
      selectedAddons[group.groupId] = result.selection
      for (const checkbox of list.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')) {
        checkbox.checked = result.selection.includes(checkbox.value)
      }
      updateGroupFeedback(result.limitReached)
      updateItemAddButton()
    })
    list.append(optionRow(input, choice.name, choice.price ? `₹${choice.price}` : 'Free'))
  }
  updateGroupFeedback()
  return root
}

function optionGroup(name: string, rule = '') {
  const root = document.createElement('fieldset'); root.className = 'item-option-group'
  const title = document.createElement('legend'); title.className = 'flex flex-col w-100 text-light'
  const label = document.createElement('span'); label.textContent = name; title.append(label)
  if (rule) { const detail = document.createElement('small'); detail.className = 'text-light'; detail.dataset.optionRule = ''; detail.textContent = rule; title.append(detail) }
  root.append(title)
  const list = document.createElement('div'); list.className = 'item-option-list'; root.append(list)
  return root
}

function optionRow(input: HTMLInputElement, name: string, price: string) {
  const row = document.createElement('label'); row.className = 'item-option'
  const title = document.createElement('span'); title.textContent = name
  const cost = document.createElement('small'); cost.className = 'text-light'; cost.textContent = price
  row.append(input, title, cost); return row
}

function defaultVariantSelections(groups: MenuVariantGroup[]) {
  return Object.fromEntries(groups.map((group) => [group.groupId, (group.variations.find((choice) => choice.default && choice.inStock !== false) ?? group.variations.find((choice) => choice.inStock !== false) ?? group.variations[0])?.id ?? '']))
}

function selectedCustomization() {
  if (!customization) return { customization: undefined, summary: '', addonTotal: 0 }
  const variants = customization.variantsV2?.flatMap((group) => {
    const choice = group.variations.find(({ id }) => id === selectedVariants[group.groupId])
    return choice ? [{ group_id: group.groupId, variation_id: choice.id, groupName: group.name, name: choice.name, price: choice.price }] : []
  }) ?? []
  const addons = customization.addons?.flatMap((group) => (selectedAddons[group.groupId] ?? []).flatMap((id) => {
    const choice = group.choices.find((candidate) => candidate.id === id)
    return choice ? [{ group_id: group.groupId, choice_id: choice.id, groupName: group.groupName, name: choice.name, price: choice.price }] : []
  })) ?? []
  return { customization: { ...(variants.length ? { variantsV2: variants } : {}), ...(addons.length ? { addons } : {}) } satisfies CartCustomization, summary: [...variants, ...addons].map((choice) => `${choice.groupName}: ${choice.name}`).join(', '), addonTotal: addons.reduce((sum, choice) => sum + choice.price, 0) }
}

function updateItemAddButton() {
  if (!activeItem) return
  const selected = selectedCustomization()
  const invalid = customization?.addons?.some((group) => (selectedAddons[group.groupId]?.length ?? 0) < (group.minAddons ?? 0)) ?? false
  const add = required<HTMLButtonElement>('.item-dialog__add')
  add.disabled = invalid || !activeItem.available
  setLockedInteraction(add, isSessionLockedForParticipants(session!))
  required<HTMLElement>('[data-item-add-label]').textContent = `Add item · ₹${activeItem.price + selected.addonTotal}`
}

function addCustomizedItem(item: MenuItem) {
  if (!session) return
  if (isSessionLockedForParticipants(session)) { announceLocked(); return }
  const selected = selectedCustomization()
  const id = `${item.id}:${crypto.randomUUID()}`
  draft = { ...draft, [id]: { id, menuItemId: item.id, quantity: 1, customization: selected.customization, customizationSummary: selected.summary, unitPrice: item.price + selected.addonTotal } }
  storeDraft(session.id, draft); renderMenu(); renderCart()
}

function addonRuleText(group: MenuAddonGroup, selected?: number) {
  let rule = ''
  if (group.minAddons && group.minAddons === group.maxAddons) {
    rule = `Choose ${group.minAddons}`
  } else if (group.minAddons && group.maxAddons) {
    rule = `Choose ${group.minAddons}-${group.maxAddons}`
  } else if (group.minAddons) {
    rule = `Choose at least ${group.minAddons}`
  } else if (group.maxAddons) {
    rule = `Choose up to ${group.maxAddons}`
  }
  if (selected === undefined || !rule) return rule
  return group.maxAddons
    ? `${rule}. ${selected} of ${group.maxAddons} selected.`
    : `${rule}. ${selected} selected.`
}
