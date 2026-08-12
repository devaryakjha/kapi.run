import type { KapiSession } from '@kapi/spec'

import './styles/base.css'
import './styles/join.css'

import { buildOrganizerReviewPath, parseParticipantJoinTarget } from './lib/join-target.ts'
import {
  getOrCreateLocalParticipantId,
  hasOrganizerCapability,
  loadEncryptedSessionRecord,
  localParticipantNameKey,
  resolveSessionLinkParts,
  safeLocalStorageGet,
  safeLocalStorageSet,
  type SessionLinkParts,
} from './lib/session.ts'

function required<T extends Element>(selector: string) {
  const element = document.querySelector<T>(selector)
  if (!element) throw new Error(`Missing element: ${selector}`)
  return element
}

type JoinState = {
  error: string | null
  key: string
  name: string
  pending: boolean
  session: KapiSession | null
}

const state: JoinState = {
  error: null,
  key: '',
  name: '',
  pending: true,
  session: null,
}

const description = required<HTMLElement>('[data-session-description]')
const loading = required<HTMLElement>('[data-join-loading]')
const form = required<HTMLFormElement>('.join-form')
const info = required<HTMLElement>('[data-join-info]')
const errorAlert = required<HTMLElement>('.join-error')
const errorMessage = required<HTMLElement>('[data-error-message]')
const nameInput = required<HTMLInputElement>('#join-name')
const submitButton = required<HTMLButtonElement>('.join-submit')

nameInput.addEventListener('input', () => {
  state.name = nameInput.value
  state.error = null
  render()
})
form.addEventListener('submit', joinOrder)

render()
void loadSession()

async function loadSession() {
  try {
    const target = parseTargetFromLocation()
    if (!target) {
      patch({ error: 'Invite link is invalid.', pending: false })
      return
    }

    const parts = await resolveSessionLinkParts(target)
    if (!parts.sessionId || !parts.key) {
      patch({ error: 'Invite link is invalid.', pending: false })
      return
    }

    const loaded = await loadEncryptedSessionRecord(parts.sessionId, parts.key)
    if (
      parts.organizerSecret &&
      (await hasOrganizerCapability(loaded.session, parts.organizerSecret))
    ) {
      window.location.replace(
        buildOrganizerReviewPath({
          inviteId: parts.inviteId ?? undefined,
          sessionId: parts.sessionId,
          key: parts.key,
          ownerKey: parts.organizerSecret,
        }),
      )
      return
    }

    getOrCreateLocalParticipantId(parts.sessionId)
    patch({
      key: parts.key,
      name: safeLocalStorageGet(localParticipantNameKey(parts.sessionId)) ?? '',
      pending: false,
      session: loaded.session,
    })
  } catch (caught) {
    patch({
      error: caught instanceof Error ? caught.message : 'Session not found.',
      pending: false,
    })
  }
}

function joinOrder(event: SubmitEvent) {
  event.preventDefault()
  if (!state.session || !state.key) return
  const name = state.name.trim()
  if (!name) {
    patch({ error: 'Enter your name to join this order.' })
    return
  }

  safeLocalStorageSet(localParticipantNameKey(state.session.id), name)
  const url = new URL('/menu/', window.location.origin)
  url.searchParams.set('session', state.session.id)
  url.hash = new URLSearchParams({ key: state.key }).toString()
  window.location.assign(`${url.pathname}${url.search}${url.hash}`)
}

function patch(next: Partial<JoinState>) {
  Object.assign(state, next)
  render()
}

function render() {
  loading.hidden = !state.pending
  form.hidden = state.pending
  description.textContent = state.session
    ? `${state.session.restaurant.name} · ${state.session.cutoffTime} cutoff`
    : 'Confirm your name before adding items.'

  info.hidden = !state.session
  errorAlert.hidden = !state.error
  errorMessage.textContent = state.error ?? ''
  nameInput.disabled = !state.session
  submitButton.disabled = !state.session
  if (nameInput.value !== state.name) nameInput.value = state.name
}

function parseTargetFromLocation(): SessionLinkParts | null {
  const search = new URLSearchParams(window.location.search)
  const rawTarget = search.get('target')
  const target = rawTarget
    ? parseParticipantJoinTarget(rawTarget, '')
    : parseParticipantJoinTarget(window.location.href, '')
  if (!target) return null
  return {
    inviteId: target.inviteId ?? null,
    key: target.key ?? null,
    organizerSecret: null,
    owner: false,
    sessionId: target.sessionId ?? null,
  }
}
