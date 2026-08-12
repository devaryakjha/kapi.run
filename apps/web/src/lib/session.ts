import type {
  Address,
  CartLine,
  CartCustomization,
  KapiSession,
  MenuItem,
  RelaySessionRecord,
  RelayWriteRole,
  Restaurant,
  SessionInvite,
} from '@kapi/spec'

import { api } from './api.ts'

export type LoadedSessionRecord = {
  session: KapiSession
  relayUpdatedAt: string | null
}

export type SessionLinkParts = {
  inviteId: string | null
  key: string | null
  organizerSecret: string | null
  owner: boolean
  sessionId: string | null
}

export type DraftCartLine = {
  id: string
  menuItemId: string
  quantity: number
  customization?: CartCustomization
  customizationSummary?: string
  unitPrice?: number
}

export type DraftCart = Record<string, DraftCartLine>

const encoder = new TextEncoder()
const decoder = new TextDecoder()

function bytesToBase64Url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '')
}

function base64UrlToBytes(value: string) {
  const base64 = value
    .replaceAll('-', '+')
    .replaceAll('_', '/')
    .padEnd(Math.ceil(value.length / 4) * 4, '=')
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))
}

export async function makeSessionKey() {
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  )
  const bytes = new Uint8Array(await crypto.subtle.exportKey('raw', key))
  return bytesToBase64Url(bytes)
}

export function makeOrganizerSecret() {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)))
}

export async function hashOrganizerSecret(secret: string) {
  const hash = await crypto.subtle.digest('SHA-256', encoder.encode(secret))
  return bytesToBase64Url(new Uint8Array(hash))
}

export async function hasOrganizerCapability(
  session: KapiSession,
  organizerSecret: string | null,
) {
  if (!session.organizerSecretHash || !organizerSecret) return false
  return session.organizerSecretHash === (await hashOrganizerSecret(organizerSecret))
}

async function importSessionKey(key: string) {
  return crypto.subtle.importKey(
    'raw',
    base64UrlToBytes(key),
    'AES-GCM',
    false,
    ['encrypt', 'decrypt'],
  )
}

async function encryptSession(value: unknown, key: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const cryptoKey = await importSessionKey(key)
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      cryptoKey,
      encoder.encode(JSON.stringify(value)),
    ),
  )
  return `${bytesToBase64Url(iv)}.${bytesToBase64Url(ciphertext)}`
}

async function decryptSession<T>(ciphertext: string, key: string) {
  const [iv, data] = ciphertext.split('.')
  if (!iv || !data) throw new Error('Session link is invalid.')
  const cryptoKey = await importSessionKey(key)
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64UrlToBytes(iv) },
    cryptoKey,
    base64UrlToBytes(data),
  )
  return JSON.parse(decoder.decode(plaintext)) as T
}

function localSessionKey(sessionId: string) {
  return `kapi:session:${sessionId}`
}

export function localKeyKey(sessionId: string) {
  return `kapi:key:${sessionId}`
}

export function localOrganizerKeyKey(sessionId: string) {
  return `kapi:owner-key:${sessionId}`
}

function localParticipantIdKey(sessionId: string) {
  return `kapi:participant:${sessionId}`
}

function localParticipantSecretKey(sessionId: string) {
  return `kapi:participant-secret:${sessionId}`
}

export function localParticipantNameKey(sessionId: string) {
  return `kapi:participant-name:${sessionId}`
}

export function getOrCreateLocalParticipantId(sessionId: string) {
  const key = localParticipantIdKey(sessionId)
  const existing = safeLocalStorageGet(key)
  if (existing) return existing
  const id = crypto.randomUUID()
  safeLocalStorageSet(key, id)
  return id
}

export function getOrCreateLocalParticipantSecret(sessionId: string) {
  const key = localParticipantSecretKey(sessionId)
  const existing = safeLocalStorageGet(key)
  if (existing) return existing
  const secret = makeOrganizerSecret()
  safeLocalStorageSet(key, secret)
  return secret
}

export function localDraftKey(sessionId: string) {
  return `kapi:draft:${sessionId}`
}

export function safeLocalStorageRemove(key: string) {
  try {
    globalThis.localStorage?.removeItem(key)
  } catch {
    // Browser storage remains best-effort.
  }
}

export function loadStoredDraft(sessionId: string): DraftCart {
  const raw = safeLocalStorageGet(localDraftKey(sessionId))
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as Record<string, DraftCartLine>
    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([, line]) =>
          typeof line?.menuItemId === 'string' &&
          typeof line.quantity === 'number' &&
          line.quantity > 0,
      ),
    )
  } catch {
    return {}
  }
}

export function storeDraft(sessionId: string, draft: DraftCart) {
  if (Object.keys(draft).length) {
    safeLocalStorageSet(localDraftKey(sessionId), JSON.stringify(draft))
  } else {
    safeLocalStorageRemove(localDraftKey(sessionId))
  }
}

export function addPlainDraftItem(draft: DraftCart, menuItemId: string) {
  const current = draft[menuItemId]
  return {
    ...draft,
    [menuItemId]: {
      id: menuItemId,
      menuItemId,
      quantity: (current?.quantity ?? 0) + 1,
    },
  }
}

export function changeDraftLineQuantity(
  draft: DraftCart,
  lineId: string,
  delta: number,
) {
  const current = draft[lineId]
  if (!current) return draft
  const quantity = Math.max(current.quantity + delta, 0)
  if (quantity === 0) {
    const next = { ...draft }
    delete next[lineId]
    return next
  }
  return { ...draft, [lineId]: { ...current, quantity } }
}

export function draftCartFromParticipantItems(
  items: CartLine[],
  participantId: string,
): DraftCart {
  return Object.fromEntries(
    items.flatMap((item) =>
      item.participantId === participantId && item.quantity > 0
        ? [[
            item.id,
            {
              id: item.id,
              menuItemId: item.menuItemId,
              quantity: item.quantity,
              customization: item.customization,
              customizationSummary: item.customizationSummary,
              unitPrice: item.price,
            },
          ]]
        : [],
    ),
  )
}

export function isSessionLockedForParticipants(
  session: KapiSession,
  now = new Date(),
) {
  if (session.status !== 'open') return true
  return Boolean(session.cutoffAt && new Date(session.cutoffAt).getTime() <= now.getTime())
}

export function safeLocalStorageGet(key: string) {
  try {
    return globalThis.localStorage?.getItem(key) ?? null
  } catch {
    return null
  }
}

export function safeLocalStorageSet(key: string, value: string) {
  try {
    globalThis.localStorage?.setItem(key, value)
  } catch {
    // Browser storage remains best-effort.
  }
}

export function safeSessionStorageSet(key: string, value: string) {
  try {
    globalThis.sessionStorage?.setItem(key, value)
  } catch {
    // The relay remains the durable transition fallback.
  }
}

export function safeSessionStorageGet(key: string) {
  try {
    return globalThis.sessionStorage?.getItem(key) ?? null
  } catch {
    return null
  }
}

export function getSessionLinkParts(): SessionLinkParts {
  const search = new URLSearchParams(window.location.search)
  const inviteId = search.get('i') ?? search.get('invite')
  const sessionId = search.get('session')
  const owner = search.get('owner') === '1'
  const hash = new URLSearchParams(window.location.hash.slice(1))
  const key =
    hash.get('key') ??
    (sessionId ? safeLocalStorageGet(localKeyKey(sessionId)) : null)
  const organizerSecret =
    hash.get('ownerKey') ??
    (sessionId ? safeLocalStorageGet(localOrganizerKeyKey(sessionId)) : null)
  return { inviteId, key, organizerSecret, owner, sessionId }
}

export function createSessionInvite(sessionId: string, key: string) {
  return api<SessionInvite>('/relay/invites', {
    method: 'POST',
    body: JSON.stringify({ sessionId, key }),
  })
}

async function resolveSessionInvite(inviteId: string) {
  return api<SessionInvite>(`/relay/invites/${inviteId}`)
}

export async function resolveSessionLinkParts(
  parts: SessionLinkParts,
): Promise<SessionLinkParts> {
  if (parts.sessionId && parts.key) return parts
  if (!parts.inviteId) return parts
  const invite = await resolveSessionInvite(parts.inviteId)
  safeLocalStorageSet(localKeyKey(invite.sessionId), invite.key)
  return {
    ...parts,
    organizerSecret:
      parts.organizerSecret ??
      safeLocalStorageGet(localOrganizerKeyKey(invite.sessionId)),
    sessionId: invite.sessionId,
    key: invite.key,
  }
}

export async function loadEncryptedSessionRecord(
  sessionId: string,
  key: string,
): Promise<LoadedSessionRecord> {
  try {
    const record = await api<RelaySessionRecord>(`/relay/sessions/${sessionId}`)
    let session = await decryptSession<KapiSession>(record.ciphertext, key)
    for (const [participantId, submissionRecord] of Object.entries(
      record.participantSubmissions ?? {},
    )) {
      try {
        const submission = await decryptSession<{
          participantName: string
          items: CartLine[]
        }>(submissionRecord.ciphertext, key)
        const submittedAt = submissionRecord.updatedAt
        const existing = session.participants.some(({ id }) => id === participantId)
        session = {
          ...session,
          participants: existing
            ? session.participants.map((participant) =>
                participant.id === participantId
                  ? {
                      ...participant,
                      displayName: submission.participantName,
                      status: 'submitted',
                      submittedAt,
                    }
                  : participant,
              )
            : [
                ...session.participants,
                {
                  id: participantId,
                  displayName: submission.participantName,
                  status: 'submitted',
                  joinedAt: submittedAt,
                  submittedAt,
                },
              ],
          items: [
            ...session.items.filter(
              ({ participantId: currentId }) => currentId !== participantId,
            ),
            ...submission.items.filter(
              (item) => item.participantId === participantId && item.quantity > 0,
            ),
          ],
        }
      } catch {
        // Ignore malformed participant submissions and keep the organizer record.
      }
    }
    safeLocalStorageSet(localSessionKey(sessionId), JSON.stringify(session))
    safeLocalStorageSet(localKeyKey(sessionId), key)
    return { session, relayUpdatedAt: record.updatedAt }
  } catch {
    const local = safeLocalStorageGet(localSessionKey(sessionId))
    if (local) {
      return {
        session: JSON.parse(local) as KapiSession,
        relayUpdatedAt: null,
      }
    }
    throw new Error('Session not found.')
  }
}

export async function publishSession(
  session: KapiSession,
  key: string,
  options: {
    expectedUpdatedAt: string | null
    participantId?: string
    participantSecret?: string
    role?: RelayWriteRole
    organizerSecret?: string | null
  },
): Promise<LoadedSessionRecord> {
  const role = options.role ?? 'participant'
  if (
    role === 'participant' &&
    (!options.participantId || !options.participantSecret)
  ) {
    throw new Error('Participant proof is missing.')
  }
  const participantSubmission =
    role === 'participant' && options.participantId
      ? {
          participantName:
            session.participants.find(({ id }) => id === options.participantId)
              ?.displayName ?? 'Guest',
          items: session.items.filter(
            ({ participantId }) => participantId === options.participantId,
          ),
        }
      : null
  const record = await api<RelaySessionRecord>(
    `/relay/sessions/${session.id}`,
    {
      method: 'PUT',
      headers:
        role === 'organizer' && options.organizerSecret
          ? { 'x-kapi-organizer-secret': options.organizerSecret }
          : role === 'participant' && options.participantSecret
            ? { 'x-kapi-participant-secret': options.participantSecret }
            : undefined,
      body: JSON.stringify({
        ciphertext: await encryptSession(participantSubmission ?? session, key),
        expectedUpdatedAt: options.expectedUpdatedAt,
        ...(role === 'organizer'
          ? {
              metadata: {
                cutoffAt: session.cutoffAt,
                status: session.status,
                organizerSecretHash: session.organizerSecretHash,
              },
            }
          : { participantId: options.participantId }),
        role,
      }),
    },
  )

  safeLocalStorageSet(localSessionKey(session.id), JSON.stringify(session))
  safeLocalStorageSet(localKeyKey(session.id), key)
  return { session, relayUpdatedAt: record.updatedAt }
}

export function applyParticipantSubmission({
  latest,
  menu,
  participantId,
  participantName,
  draftItems,
}: {
  latest: KapiSession
  menu: MenuItem[]
  participantId: string
  participantName: string
  draftItems: DraftCartLine[]
}) {
  const submittedAt = new Date().toISOString()
  const submitted: CartLine[] = draftItems.flatMap((line) => {
    const item = menu.find(
      (candidate) =>
        candidate.id === line.menuItemId &&
        candidate.restaurantId === latest.restaurant.id,
    )
    const existing = latest.items.find(
      (candidate) =>
        candidate.id === line.id &&
        candidate.participantId === participantId &&
        candidate.menuItemId === line.menuItemId,
    )
    if ((!item && !existing) || line.quantity <= 0) return []
    return [{
      id: crypto.randomUUID(),
      participantId,
      participantName,
      menuItemId: item?.id ?? existing!.menuItemId,
      name: item?.name ?? existing!.name,
      quantity: line.quantity,
      price: line.unitPrice ?? item?.price ?? existing!.price,
      available: item?.available ?? existing!.available,
      swiggyItemId: item?.swiggyItemId ?? existing!.swiggyItemId,
      customization: line.customization,
      customizationSummary: line.customizationSummary,
    }]
  })
  const existingParticipant = latest.participants.some(({ id }) => id === participantId)
  return {
    ...latest,
    participants: existingParticipant
      ? latest.participants.map((participant) =>
          participant.id === participantId
            ? { ...participant, displayName: participantName, status: 'submitted' as const, submittedAt }
            : participant,
        )
      : [...latest.participants, { id: participantId, displayName: participantName, status: 'submitted' as const, joinedAt: submittedAt, submittedAt }],
    items: [
      ...latest.items.filter((item) => item.participantId !== participantId),
      ...submitted,
    ],
    audit: [...latest.audit, audit(participantName, `submitted ${submitted.length} item lines`)],
  } satisfies KapiSession
}

export function audit(actor: string, action: string) {
  return {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    actor,
    action,
  }
}

export function formatTimeLabel(value: string) {
  const [hourValue, minuteValue = '0'] = value.split(':')
  const hour = Number(hourValue)
  const minute = minuteValue.padStart(2, '0')
  if (!Number.isFinite(hour)) return '12:45 PM'
  return `${hour % 12 || 12}:${minute} ${hour >= 12 ? 'PM' : 'AM'}`
}

function formatTimeInput(date: Date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

export function setupCutoffTimeAfter(minutesFromNow: number, now = new Date()) {
  const next = new Date(now.getTime() + minutesFromNow * 60_000)
  const roundedMinute = Math.ceil(next.getMinutes() / 5) * 5
  next.setMinutes(roundedMinute, 0, 0)
  return formatTimeInput(next)
}

export function defaultSetupCutoffTime(now = new Date()) {
  return setupCutoffTimeAfter(45, now)
}

export type SessionWindowAction = 'extend' | 'reopen'

export function sessionWindowAction(
  session: KapiSession,
  now = new Date(),
): SessionWindowAction {
  if (session.status !== 'open') return 'reopen'
  const cutoff = session.cutoffAt ? new Date(session.cutoffAt).getTime() : NaN
  return Number.isFinite(cutoff) && cutoff > now.getTime() ? 'extend' : 'reopen'
}

export function applySessionWindowChange(
  session: KapiSession,
  cutoff: Date,
  now = new Date(),
):
  | { action: SessionWindowAction; session: KapiSession }
  | { error: string } {
  const cutoffTime = cutoff.getTime()
  if (!Number.isFinite(cutoffTime) || cutoffTime <= now.getTime()) {
    return { error: 'Choose a valid future cutoff.' }
  }

  const action = sessionWindowAction(session, now)
  const currentCutoff = session.cutoffAt
    ? new Date(session.cutoffAt).getTime()
    : NaN
  if (
    action === 'extend' &&
    Number.isFinite(currentCutoff) &&
    cutoffTime <= currentCutoff
  ) {
    return { error: 'Choose a cutoff later than the current cutoff.' }
  }

  const { sync: _, ...current } = session
  return {
    action,
    session: {
      ...current,
      cutoffAt: cutoff.toISOString(),
      cutoffTime: formatTimeLabel(formatTimeInput(cutoff)),
      status: 'open',
      audit: [
        ...session.audit,
        audit('Organiser', action === 'extend' ? 'extended session' : 're-opened session'),
      ],
    },
  }
}

export function resolveSetupCutoffAt(
  value: string,
  now = new Date(),
): { cutoffAt: string } | { error: string } {
  const [hourValue, minuteValue] = value.split(':')
  const hour = Number(hourValue)
  const minute = Number(minuteValue)

  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return { error: 'Choose a valid cutoff time.' }
  }

  const cutoff = new Date(now)
  cutoff.setHours(hour, minute, 0, 0)
  if (cutoff.getTime() <= now.getTime()) cutoff.setDate(cutoff.getDate() + 1)
  return { cutoffAt: cutoff.toISOString() }
}

export function formatAddressOption(address: Address) {
  return address.detail ? `${address.label} - ${address.detail}` : address.label
}

export function formatRestaurantLocationMeta(restaurant: Restaurant) {
  return [
    restaurant.area,
    typeof restaurant.distanceKm === 'number'
      ? `${restaurant.distanceKm.toFixed(1)} km`
      : '',
    restaurant.deliveryTimeRange,
  ]
    .filter(Boolean)
    .join(' · ')
}

export function formatRestaurantValueMeta(restaurant: Restaurant) {
  return [
    restaurant.costForTwo,
    restaurant.totalRatings ? `${restaurant.totalRatings} ratings` : '',
  ]
    .filter(Boolean)
    .join(' · ')
}
