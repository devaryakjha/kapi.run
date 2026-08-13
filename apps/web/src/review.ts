import type { CartLine, KapiSession, SwiggyCartSummary } from '@kapi/spec'

import { toast } from '@knadh/oat/js/toast.js'
import '@knadh/oat/js/dropdown.js'

import './styles/base.css'
import './styles/session.css'
import './styles/review.css'

import { api, ApiError } from './lib/api.ts'
import { renderAccountPopover } from './lib/account-popover.ts'
import { cartCustomizationDetails } from './lib/cart-customization.ts'
import { toSwiggyCartItem } from './lib/cart-payload.ts'
import { startLiveCountdown } from './lib/countdown.ts'
import { bindDismissibleDialog } from './lib/dialog.ts'
import { buildOrganizerMenuPath } from './lib/join-target.ts'
import {
  applySessionWindowChange,
  audit,
  getSessionLinkParts,
  hasOrganizerCapability,
  loadEncryptedSessionRecord,
  localOrganizerKeyKey,
  publishSession,
  participantRole,
  resolveSessionLinkParts,
  safeLocalStorageSet,
  setParticipantRole,
  sessionWindowAction,
} from './lib/session.ts'

function required<T extends Element>(selector: string) {
  const element = document.querySelector<T>(selector)
  if (!element) throw new Error(`Missing element: ${selector}`)
  return element
}

const loading = required<HTMLElement>('.review-loading')
const loadError = required<HTMLElement>('.review-load-error')
const loadErrorMessage = required<HTMLElement>('[data-review-load-error]')
const shell = required<HTMLElement>('.review-shell')
const restaurant = required<HTMLElement>('[data-review-restaurant]')
const subtitle = required<HTMLElement>('[data-review-subtitle]')
const timer = required<HTMLElement>('[data-review-timer]')
const avatar = required<HTMLElement>('[data-review-avatar]')
const staleAlert = required<HTMLElement>('.review-stale')
const invitePanel = required<HTMLElement>('.invite-panel')
const inviteLink = required<HTMLInputElement>('[data-invite-link]')
const lockButton = required<HTMLButtonElement>('.lock-order')
const sessionWindowButton = required<HTMLButtonElement>('.session-window')
const refreshButton = required<HTMLButtonElement>('.refresh-order')
const orderGroups = required<HTMLElement>('.order-groups')
const ordersEmpty = required<HTMLElement>('.orders-empty')
const ordersMeta = required<HTMLElement>('[data-orders-meta]')
const summaryItems = required<HTMLElement>('[data-summary-items]')
const summaryPeople = required<HTMLElement>('[data-summary-people]')
const summaryQuantity = required<HTMLElement>('[data-summary-quantity]')
const summarySubtotal = required<HTMLElement>('[data-summary-subtotal]')
const actionError = required<HTMLElement>('.review-action-error')
const actionErrorMessage = required<HTMLElement>('[data-review-action-error]')
const syncButton = required<HTMLButtonElement>('.sync-cart')
const lockDialog = required<HTMLDialogElement>('.lock-dialog')
const sessionWindowDialog = required<HTMLDialogElement>('.session-window-dialog')
const sessionCutoffInput = required<HTMLInputElement>('#session-cutoff')
const sessionCutoffError = required<HTMLElement>('[data-session-cutoff-error]')
const confirmSessionWindow = required<HTMLButtonElement>('.confirm-session-window')
const syncDialog = required<HTMLDialogElement>('.sync-dialog')
const roleDialog = required<HTMLDialogElement>('.role-dialog')
const confirmRoleButton = required<HTMLButtonElement>('.confirm-role')
const accountPopover = required<HTMLElement>('#review-account')

let session: KapiSession | null = null
let sessionKey = ''
let organizerSecret: string | null = null
let isOrganizer = false
let stale = false
let error: string | null = null
let pending = false
let swiggyCart: SwiggyCartSummary | null = null
let relayUpdatedAt: string | null = null
let roleParticipantId: string | null = null

const refreshTimer = startLiveCountdown(timer, () => session, () => {
  renderSessionControls()
})

bindEvents()
void initialize()

async function initialize() {
  try {
    const parts = await resolveSessionLinkParts(getSessionLinkParts())
    if (!parts.sessionId || !parts.key) throw new Error('Session link is invalid.')
    sessionKey = parts.key
    organizerSecret = parts.organizerSecret
    const loaded = await loadEncryptedSessionRecord(parts.sessionId, parts.key)
    session = loaded.session
    relayUpdatedAt = loaded.relayUpdatedAt
    stale = loaded.relayUpdatedAt === null
    isOrganizer = parts.owner && (await hasOrganizerCapability(session, organizerSecret))
    if (isOrganizer && organizerSecret) {
      safeLocalStorageSet(localOrganizerKeyKey(parts.sessionId), organizerSecret)
    }
  } catch (caught) {
    error = caught instanceof Error ? caught.message : 'Could not load this order.'
  } finally {
    render()
  }
}

function bindEvents() {
  bindDismissibleDialog(lockDialog)
  bindDismissibleDialog(sessionWindowDialog)
  bindDismissibleDialog(syncDialog)
  bindDismissibleDialog(roleDialog)
  required<HTMLButtonElement>('.menu-mode').addEventListener('click', () => {
    const parts = getSessionLinkParts()
    window.location.assign(
      buildOrganizerMenuPath({
        inviteId: parts.inviteId ?? undefined,
        sessionId: parts.sessionId ?? undefined,
        key: parts.key,
        ownerKey: parts.organizerSecret,
      }),
    )
  })
  required<HTMLButtonElement>('.copy-invite').addEventListener('click', () => void copyInvite())
  lockButton.addEventListener('click', () => lockDialog.showModal())
  sessionWindowButton.addEventListener('click', openSessionWindowDialog)
  refreshButton.addEventListener('click', () => void refresh())
  syncButton.addEventListener('click', () => void inspectSwiggyCart())
  required<HTMLButtonElement>('.confirm-lock').addEventListener('click', () => void lockOrder())
  sessionWindowDialog.querySelector('form')?.addEventListener('submit', (event) => {
    event.preventDefault()
    void changeSessionWindow()
  })
  required<HTMLButtonElement>('.confirm-sync').addEventListener('click', () => void syncSwiggyCart())
  confirmRoleButton.addEventListener('click', () => void changeParticipantRole())
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-dialog-cancel]')) {
    button.addEventListener('click', () => button.closest('dialog')?.close())
  }
  orderGroups.addEventListener('click', (event) => {
    const roleButton = (event.target as Element).closest<HTMLButtonElement>('button[data-role-participant-id]')
    if (roleButton && session && isOrganizer) {
      openRoleDialog(roleButton.dataset.roleParticipantId ?? '')
      return
    }
    const button = (event.target as Element).closest<HTMLButtonElement>('button[data-item-id]')
    if (!button || !session || !isOrganizer) return
    const item = session.items.find(({ id }) => id === button.dataset.itemId)
    if (!item) return
    if (button.dataset.action === 'remove') updateItem(item.id, 0)
    if (button.dataset.action === 'decrease') updateItem(item.id, item.quantity - 1)
    if (button.dataset.action === 'increase') updateItem(item.id, item.quantity + 1)
  })
}

function openRoleDialog(participantId: string) {
  if (!session || !isOrganizer) return
  const participant = session.participants.find(({ id }) => id === participantId)
  if (!participant) return
  roleParticipantId = participantId
  const promoting = participantRole(participant) === 'member'
  required<HTMLElement>('[data-role-dialog-title]').textContent = promoting
    ? `Make ${participant.displayName} an admin?`
    : `Remove ${participant.displayName} as admin?`
  required<HTMLElement>('[data-role-dialog-description]').textContent = promoting
    ? 'They can connect a separate Swiggy account for this session.'
    : 'Their Swiggy connection remains saved, but they lose admin access.'
  confirmRoleButton.textContent = promoting ? 'Make admin' : 'Remove admin'
  roleDialog.showModal()
}

async function changeParticipantRole() {
  if (!session || !roleParticipantId || !isOrganizer) return
  const participant = session.participants.find(({ id }) => id === roleParticipantId)
  if (!participant) return
  const nextRole = participantRole(participant) === 'member' ? 'admin' : 'member'
  confirmRoleButton.disabled = true
  try {
    await save(setParticipantRole(session, participant.id, nextRole))
    roleDialog.close()
    toast(
      nextRole === 'admin'
        ? `${participant.displayName} is now an admin.`
        : `${participant.displayName} is now a member.`,
      undefined,
      { placement: 'bottom-center', variant: 'success' },
    )
  } catch (caught) {
    showActionError(caught)
    roleDialog.close()
  } finally {
    confirmRoleButton.disabled = false
    roleParticipantId = null
    render()
  }
}

async function copyInvite() {
  if (!session) return
  try {
    await navigator.clipboard.writeText(session.shareUrl)
    toast('Invite link copied.', undefined, {
      placement: 'bottom-center',
      variant: 'success',
    })
  } catch {
    toast('Could not copy the invite link.', undefined, {
      placement: 'bottom-center',
      variant: 'danger',
    })
  }
}

async function refresh() {
  if (!session || !sessionKey) return
  try {
    pending = true; render()
    const currentItems = new Set(session.items.map(({ id }) => id))
    const loaded = await loadEncryptedSessionRecord(session.id, sessionKey)
    const addedItems = loaded.session.items.filter(({ id }) => !currentItems.has(id)).length
    session = loaded.session; relayUpdatedAt = loaded.relayUpdatedAt; stale = loaded.relayUpdatedAt === null; error = null
    if (addedItems > 0) {
      toast(`${addedItems} new ${addedItems === 1 ? 'item is' : 'items are'} ready to review.`, undefined, {
        placement: 'bottom-center',
        variant: 'success',
      })
    }
  } catch (caught) {
    error = caught instanceof Error ? caught.message : 'Could not refresh.'
  } finally { pending = false; render() }
}

async function save(next: KapiSession) {
  if (!organizerSecret) throw new Error('Organizer proof is missing.')
  const saved = await publishSession(next, sessionKey, {
    expectedUpdatedAt: relayUpdatedAt, role: 'organizer', organizerSecret,
  })
  session = saved.session; relayUpdatedAt = saved.relayUpdatedAt; stale = false
}

async function updateItem(itemId: string, quantity: number) {
  if (!session) return
  const next = {
    ...session,
    items: quantity <= 0
      ? session.items.filter(({ id }) => id !== itemId)
      : session.items.map((item) => item.id === itemId ? { ...item, quantity: Math.max(1, quantity) } : item),
    audit: [...session.audit, audit('Organiser', quantity <= 0 ? 'removed item' : 'updated item')],
  }
  session = next; render()
  try { await save(next) } catch (caught) { showActionError(caught) }
}

async function lockOrder() {
  if (!session) return
  lockDialog.close()
  pending = true; render()
  try {
    await save({ ...session, status: 'locked', audit: [...session.audit, audit('Organiser', 'locked session')] })
    toast('Session locked. No one can change their items now.', undefined, {
      placement: 'bottom-center',
      variant: 'success',
    })
  } catch (caught) { showActionError(caught) } finally { pending = false; render() }
}

function localDateTimeValue(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function openSessionWindowDialog() {
  if (!session || !isOrganizer) return
  const action = sessionWindowAction(session)
  const suggested = new Date(Date.now() + 45 * 60_000)
  const currentCutoff = session.cutoffAt ? new Date(session.cutoffAt) : null
  const initial =
    action === 'extend' && currentCutoff && Number.isFinite(currentCutoff.getTime())
      ? new Date(Math.max(suggested.getTime(), currentCutoff.getTime() + 15 * 60_000))
      : suggested
  required<HTMLElement>('[data-session-window-title]').textContent =
    action === 'extend' ? 'Extend this session?' : 'Re-open this session?'
  confirmSessionWindow.textContent =
    action === 'extend' ? 'Extend session' : 'Re-open session'
  sessionCutoffInput.min = localDateTimeValue(new Date(Date.now() + 60_000))
  sessionCutoffInput.value = localDateTimeValue(initial)
  sessionCutoffInput.removeAttribute('aria-invalid')
  sessionCutoffError.textContent = ''
  sessionWindowDialog.showModal()
}

async function changeSessionWindow() {
  if (!session || !isOrganizer || pending) return
  const requestedCutoff = new Date(sessionCutoffInput.value)
  let completedAction: 'extend' | 'reopen' | null = null
  pending = true
  render()
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const result = applySessionWindowChange(session, requestedCutoff)
    if ('error' in result) {
      sessionCutoffInput.setAttribute('aria-invalid', 'true')
      sessionCutoffError.textContent = result.error
      pending = false
      render()
      sessionCutoffInput.focus()
      return
    }
    try {
      await save(result.session)
      completedAction = result.action
      break
    } catch (caught) {
      if (!(caught instanceof ApiError) || caught.status !== 409 || attempt === 2) {
        showSessionWindowError(caught)
        return
      }
      try {
        const loaded = await loadEncryptedSessionRecord(session.id, sessionKey)
        session = loaded.session
        relayUpdatedAt = loaded.relayUpdatedAt
        stale = loaded.relayUpdatedAt === null
      } catch (caught) {
        showSessionWindowError(caught)
        return
      }
    }
  }
  pending = false
  if (!completedAction) return
  error = null
  sessionWindowDialog.close()
  render()
  toast(
    completedAction === 'extend' ? 'Session extended.' : 'Session re-opened.',
    undefined,
    { placement: 'bottom-center', variant: 'success' },
  )
}

function showSessionWindowError(caught: unknown) {
  pending = false
  sessionCutoffInput.setAttribute('aria-invalid', 'true')
  sessionCutoffError.textContent =
    caught instanceof Error ? caught.message : 'Could not update this session.'
  render()
  sessionCutoffInput.focus()
}

async function inspectSwiggyCart() {
  if (!session || !isOrganizer) return
  pending = true; render()
  try {
    swiggyCart = await api<SwiggyCartSummary>(
      `/food/cart?addressId=${encodeURIComponent(session.address.id)}&restaurantName=${encodeURIComponent(session.restaurant.name)}&sessionId=${encodeURIComponent(session.id)}`,
      { headers: organizerSecret ? { 'x-kapi-organizer-secret': organizerSecret } : undefined },
    )
    const hasCart = !swiggyCart.empty
    required<HTMLElement>('[data-sync-title]').textContent = hasCart ? 'Replace your Swiggy cart?' : 'Add group cart to Swiggy?'
    required<HTMLButtonElement>('.confirm-sync').textContent = hasCart ? 'Replace cart' : 'Add to Swiggy cart'
    syncDialog.showModal()
  } catch (caught) { showActionError(caught) } finally { pending = false; render() }
}

async function syncSwiggyCart() {
  if (!session || !swiggyCart) return
  syncDialog.close(); pending = true; render()
  try {
    const result = await api<KapiSession['sync']>('/food/cart/sync', {
      method: 'POST',
      headers: organizerSecret ? { 'x-kapi-organizer-secret': organizerSecret } : undefined,
      body: JSON.stringify({
        sessionId: session.id,
        restaurantId: session.restaurant.id,
        restaurantName: session.restaurant.name,
        addressId: session.address.id,
        replaceExistingCart: !swiggyCart.empty,
        cartItems: session.items.filter(({ available }) => available).map(toSwiggyCartItem),
      }),
    })
    const statusSaved = await saveSyncResult(result)
    toast(
      result?.status === 'synced'
        ? statusSaved
          ? 'Cart synced to Swiggy.'
          : 'Cart synced to Swiggy. Refresh to update the group status.'
        : 'Swiggy did not accept every item.',
      undefined,
      {
        placement: 'bottom-center',
        variant: result?.status === 'synced' && statusSaved ? 'success' : 'warning',
      },
    )
  } catch (caught) { showActionError(caught) } finally { pending = false; swiggyCart = null; render() }
}

async function saveSyncResult(result: KapiSession['sync']) {
  if (!session) return false
  const status = result?.status === 'synced' ? 'synced' : 'sync_failed'
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await save({ ...session, status, sync: result })
      return true
    } catch (caught) {
      if (!(caught instanceof ApiError) || caught.status !== 409 || attempt === 2) {
        session = { ...session, status, sync: result }
        return false
      }
      try {
        const loaded = await loadEncryptedSessionRecord(session.id, sessionKey)
        session = loaded.session
        relayUpdatedAt = loaded.relayUpdatedAt
        stale = loaded.relayUpdatedAt === null
      } catch {
        session = { ...session, status, sync: result }
        return false
      }
    }
  }
  return false
}

function showActionError(caught: unknown) {
  error = caught instanceof Error ? caught.message : 'Request failed.'
  render()
}

function render() {
  loading.hidden = true
  loadError.hidden = Boolean(session) || !error
  loadErrorMessage.textContent = error ?? ''
  shell.hidden = !session
  if (!session) return

  restaurant.textContent = session.restaurant.name
  subtitle.textContent = `${session.restaurant.name} · ${session.address.label}`
  avatar.textContent = session.organiserName.trim().charAt(0).toUpperCase()
  renderAccountPopover({
    addressDetail: session.address.detail,
    addressLabel: session.address.label,
    connected: isOrganizer,
    name: session.organiserName,
    popover: accountPopover,
    role: 'owner',
  })
  staleAlert.hidden = !stale
  invitePanel.hidden = !isOrganizer
  inviteLink.value = session.shareUrl
  renderSessionControls()
  refreshButton.hidden = !isOrganizer
  syncButton.hidden = !isOrganizer
  syncButton.disabled = pending || session.items.length === 0
  required<HTMLElement>('[data-sync-label]').textContent =
    session.status === 'synced' ? 'Cart synced' : 'Sync to Swiggy cart'
  actionError.hidden = !error
  actionErrorMessage.textContent = error ?? ''
  refreshTimer()
  renderOrders()
}

function renderSessionControls() {
  if (!session) return
  const windowAction = sessionWindowAction(session)
  const windowLabel = windowAction === 'extend' ? 'Extend session' : 'Re-open session'
  sessionWindowButton.hidden = !isOrganizer
  sessionWindowButton.disabled = pending
  sessionWindowButton.ariaLabel = windowLabel
  sessionWindowButton.dataset.tooltip = windowLabel
  required<HTMLElement>('[data-session-window-label]').textContent = windowLabel
  lockButton.hidden = !isOrganizer || windowAction !== 'extend'
  lockButton.disabled = pending
  confirmSessionWindow.disabled = pending
}

function groupsByParticipant(items: CartLine[]) {
  const groups = new Map<string, CartLine[]>()
  for (const item of items) {
    const key = item.participantId || `name:${item.participantName}`
    groups.set(key, [...(groups.get(key) ?? []), item])
  }
  return [...groups].map(([key, items]) => ({ key, name: items.at(-1)?.participantName ?? 'Guest', items }))
}

function renderOrders() {
  if (!session) return
  const groups = groupsByParticipant(session.items)
  const quantity = session.items.reduce((sum, item) => sum + item.quantity, 0)
  const subtotal = session.items.reduce((sum, item) => sum + item.price * item.quantity, 0)
  ordersMeta.textContent = `${groups.length} ${groups.length === 1 ? 'person' : 'people'} · ${quantity} ${quantity === 1 ? 'item' : 'items'}`
  summaryItems.textContent = `${quantity} ${quantity === 1 ? 'item' : 'items'}`
  summaryPeople.textContent = String(groups.length)
  summaryQuantity.textContent = String(quantity)
  summarySubtotal.textContent = `₹${subtotal}`
  ordersEmpty.hidden = groups.length > 0
  orderGroups.replaceChildren()
  for (const group of groups) orderGroups.append(createGroup(group.key, group.name, group.items))
}

function createGroup(participantId: string, name: string, items: CartLine[]) {
  const group = document.createElement('article'); group.className = 'card order-group'
  const header = document.createElement('header'); header.className = 'flex items-center justify-between'
  const identity = document.createElement('div'); identity.className = 'order-group__identity flex items-center'
  const initial = document.createElement('figure'); initial.className = 'participant-avatar'; initial.dataset.variant = 'avatar'; initial.ariaHidden = 'true'; initial.textContent = name.slice(0,1).toUpperCase()
  const title = document.createElement('h3'); title.textContent = name
  const count = document.createElement('small'); count.className = 'text-light'; count.textContent = `${items.length} ${items.length === 1 ? 'item' : 'items'}`
  identity.append(initial,title,count)
  const headerActions = document.createElement('div'); headerActions.className = 'order-group__header-actions flex items-center gap-2'
  const participant = session?.participants.find(({ id }) => id === participantId)
  if (isOrganizer && participant) {
    const role = participantRole(participant)
    const roleBadge = document.createElement('span'); roleBadge.className = 'badge outline'; roleBadge.textContent = role === 'admin' ? 'Admin' : 'Member'
    const roleButton = document.createElement('button'); roleButton.type = 'button'; roleButton.className = 'outline small participant-role'; roleButton.dataset.roleParticipantId = participant.id; roleButton.textContent = role === 'admin' ? 'Remove admin' : 'Make admin'
    headerActions.append(roleBadge, roleButton)
  }
  const total = document.createElement('strong'); total.textContent = `₹${items.reduce((sum,item)=>sum+item.price*item.quantity,0)}`
  headerActions.append(total)
  const list = document.createElement('ul'); list.className = 'review-items unstyled'
  header.append(identity,headerActions); group.append(header, list)
  for (const item of items) list.append(createReviewItem(item))
  return group
}

function createReviewItem(item: CartLine) {
  const row = document.createElement('li'); row.className = 'review-item flex justify-between'
  const copy = document.createElement('div'); copy.className = 'review-item__copy'
  const name = document.createElement('span'); name.textContent = item.name
  copy.append(name)
  const customizationDetails = cartCustomizationDetails(item)
  if (customizationDetails.length) {
    const details = document.createElement('ul')
    details.className = 'review-item__customizations unstyled text-light'
    details.setAttribute('aria-label', `Customizations for ${item.name}`)
    for (const detail of customizationDetails) {
      const choice = document.createElement('li')
      choice.textContent = detail
      details.append(choice)
    }
    copy.append(details)
  }
  const actions = document.createElement('span'); actions.className = 'review-item__actions flex items-center gap-1'
  const value = document.createElement('strong'); value.textContent = `₹${item.price} ×${item.quantity}`
  actions.append(value)
  if (isOrganizer) {
    actions.append(itemButton('−','decrease',item.id,`Decrease ${item.name}`), Object.assign(document.createElement('b'),{textContent:String(item.quantity)}), itemButton('+','increase',item.id,`Increase ${item.name}`), itemButton('×','remove',item.id,`Remove ${item.name}`))
  }
  row.append(copy,actions); return row
}

function itemButton(text: string, action: string, itemId: string, label: string) {
  const button = document.createElement('button'); button.className='text-light'; button.type='button'; button.textContent=text; button.dataset.action=action; button.dataset.itemId=itemId; button.setAttribute('aria-label',label); return button
}
