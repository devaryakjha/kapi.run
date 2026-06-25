import type {
  Address,
  CartCustomization,
  CartLine,
  KapiSession,
  ManualFallbackSummary,
  MenuCustomization,
  MenuItem,
  RelaySessionMetadata,
  RelayWriteRole,
  Restaurant,
  SessionInvite,
} from '@kapi/spec'
import type { LucideIcon } from 'lucide-react'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '#/components/ui/alert'
import { Badge } from '#/components/ui/badge'
import { cn } from '#/lib/utils'

export type DraftCartLine = {
  id: string
  menuItemId: string
  quantity: number
  customization?: CartCustomization
  customizationSummary?: string
  unitPrice?: number
}
export type DraftCart = Record<string, DraftCartLine>

export function addPlainDraftItem(
  draft: DraftCart,
  menuItemId: string,
): DraftCart {
  const current = draft[menuItemId] as DraftCartLine | undefined
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
): DraftCart {
  const current = draft[lineId] as DraftCartLine | undefined
  if (current === undefined) return draft
  const nextQuantity = Math.max(current.quantity + delta, 0)
  if (nextQuantity === 0) {
    const next = { ...draft }
    delete next[lineId]
    return next
  }
  return { ...draft, [lineId]: { ...current, quantity: nextQuantity } }
}

export function draftCartFromSubmittedItems(items: CartLine[]): DraftCart {
  return Object.fromEntries(
    items.flatMap((item) =>
      item.quantity > 0
        ? [
            [
              item.id,
              {
                id: item.id,
                menuItemId: item.menuItemId,
                quantity: item.quantity,
                customization: item.customization,
                customizationSummary: item.customizationSummary,
                unitPrice: item.price,
              },
            ],
          ]
        : [],
    ),
  )
}

export type RelaySessionRecord = {
  ciphertext: string
  updatedAt: string
  metadata?: RelaySessionMetadata
}
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

export const API_URL =
  import.meta.env.VITE_KAPI_API_URL ?? 'http://127.0.0.1:3001'
export const setupImage = '/assets/kapi-setup-illustration.png'

const encoder = new TextEncoder()
const decoder = new TextDecoder()

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const { headers, ...rest } = init ?? {}
  const response = await fetch(`${API_URL}${path}`, {
    ...rest,
    headers: { 'content-type': 'application/json', ...headers },
  })

  if (!response.ok) {
    const body = await response
      .json()
      .catch(() => ({ error: 'Request failed.' }))
    throw new ApiError(body.error ?? 'Request failed.', response.status)
  }

  return response.json() as Promise<T>
}

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
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))
}

export async function makeSessionKey() {
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  )
  return bytesToBase64Url(
    new Uint8Array(await crypto.subtle.exportKey('raw', key)),
  )
}

export function makeOrganizerSecret() {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return bytesToBase64Url(bytes)
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
  return (
    session.organizerSecretHash === (await hashOrganizerSecret(organizerSecret))
  )
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

async function encryptSession(session: KapiSession, key: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const cryptoKey = await importSessionKey(key)
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      cryptoKey,
      encoder.encode(JSON.stringify(session)),
    ),
  )
  return `${bytesToBase64Url(iv)}.${bytesToBase64Url(ciphertext)}`
}

async function decryptSession(ciphertext: string, key: string) {
  const [iv, data] = ciphertext.split('.')
  if (!iv || !data) throw new Error('Session link is invalid.')
  const cryptoKey = await importSessionKey(key)
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64UrlToBytes(iv) },
    cryptoKey,
    base64UrlToBytes(data),
  )
  return JSON.parse(decoder.decode(plaintext)) as KapiSession
}

function localSessionKey(sessionId: string) {
  return `kapi:session:${sessionId}`
}

export function localKeyKey(sessionId: string) {
  return `kapi:key:${sessionId}`
}

export function localParticipantIdKey(sessionId: string) {
  return `kapi:participant:${sessionId}`
}

export function localParticipantNameKey(sessionId: string) {
  return `kapi:participant-name:${sessionId}`
}

export function getOrCreateLocalParticipantId(sessionId: string) {
  const key = localParticipantIdKey(sessionId)
  const existing = localStorage.getItem(key)
  if (existing) return existing
  const id = crypto.randomUUID()
  localStorage.setItem(key, id)
  return id
}

export function localOrganizerKeyKey(sessionId: string) {
  return `kapi:owner-key:${sessionId}`
}

export function getSessionLinkParts() {
  const search = new URLSearchParams(window.location.search)
  const inviteId = search.get('i') ?? search.get('invite')
  const sessionId = search.get('session')
  const owner = search.get('owner') === '1'
  const hash = new URLSearchParams(window.location.hash.slice(1))
  const key =
    hash.get('key') ??
    (sessionId ? localStorage.getItem(localKeyKey(sessionId)) : null)
  const organizerSecret =
    hash.get('ownerKey') ??
    (sessionId ? localStorage.getItem(localOrganizerKeyKey(sessionId)) : null)
  return { inviteId, key, organizerSecret, owner, sessionId }
}

export async function createSessionInvite(sessionId: string, key: string) {
  return api<SessionInvite>('/relay/invites', {
    method: 'POST',
    body: JSON.stringify({ sessionId, key }),
  })
}

export async function resolveSessionInvite(inviteId: string) {
  return api<SessionInvite>(`/relay/invites/${inviteId}`)
}

export async function resolveSessionLinkParts(
  parts: SessionLinkParts,
): Promise<SessionLinkParts> {
  if (parts.sessionId && parts.key) return parts
  if (!parts.inviteId) return parts
  const invite = await resolveSessionInvite(parts.inviteId)
  localStorage.setItem(localKeyKey(invite.sessionId), invite.key)
  return {
    ...parts,
    organizerSecret:
      parts.organizerSecret ??
      localStorage.getItem(localOrganizerKeyKey(invite.sessionId)),
    sessionId: invite.sessionId,
    key: invite.key,
  }
}

export async function loadMenuCustomization({
  addressId,
  item,
}: {
  addressId: string
  item: MenuItem
}) {
  return api<MenuCustomization>(
    `/food/restaurants/${item.restaurantId}/menu/${item.swiggyItemId}/customization?addressId=${encodeURIComponent(addressId)}&q=${encodeURIComponent(item.name)}`,
  )
}

export async function loadEncryptedSessionRecord(
  sessionId: string,
  key: string,
): Promise<LoadedSessionRecord> {
  try {
    const record = await api<RelaySessionRecord>(`/relay/sessions/${sessionId}`)
    const loaded = await decryptSession(record.ciphertext, key)
    localStorage.setItem(localSessionKey(sessionId), JSON.stringify(loaded))
    localStorage.setItem(localKeyKey(sessionId), key)
    return { session: loaded, relayUpdatedAt: record.updatedAt }
  } catch {
    const local = localStorage.getItem(localSessionKey(sessionId))
    if (local) {
      return {
        session: JSON.parse(local) as KapiSession,
        relayUpdatedAt: null,
      }
    }
    throw new Error('Session not found.')
  }
}

export async function loadEncryptedSession(sessionId: string, key: string) {
  return (await loadEncryptedSessionRecord(sessionId, key)).session
}

export async function publishSession(
  nextSession: KapiSession,
  key: string,
  options: {
    expectedUpdatedAt?: string | null
    role?: RelayWriteRole
    organizerSecret?: string | null
  } = {},
): Promise<LoadedSessionRecord> {
  const record = await api<RelaySessionRecord>(
    `/relay/sessions/${nextSession.id}`,
    {
      method: 'PUT',
      headers:
        options.role === 'organizer' && options.organizerSecret
          ? { 'x-kapi-organizer-secret': options.organizerSecret }
          : undefined,
      body: JSON.stringify({
        ciphertext: await encryptSession(nextSession, key),
        expectedUpdatedAt: options.expectedUpdatedAt,
        metadata: {
          cutoffAt: nextSession.cutoffAt,
          status: nextSession.status,
          organizerSecretHash: nextSession.organizerSecretHash,
        },
        role: options.role,
      }),
    },
  )
  localStorage.setItem(
    localSessionKey(nextSession.id),
    JSON.stringify(nextSession),
  )
  localStorage.setItem(localKeyKey(nextSession.id), key)
  return { session: nextSession, relayUpdatedAt: record.updatedAt }
}

export function audit(actor: string, action: string) {
  return {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    actor,
    action,
  }
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
    if (!item || line.quantity <= 0) return []
    return {
      id: crypto.randomUUID(),
      participantId,
      participantName,
      menuItemId: item.id,
      name: item.name,
      quantity: line.quantity,
      price: line.unitPrice ?? item.price,
      available: item.available,
      swiggyItemId: item.swiggyItemId,
      customization: line.customization,
      customizationSummary: line.customizationSummary,
    }
  })
  const existingParticipant = latest.participants.find(
    (participant) => participant.id === participantId,
  )
  return {
    ...latest,
    participants: existingParticipant
      ? latest.participants.map((participant) =>
          participant.id === participantId
            ? {
                ...participant,
                displayName: participantName,
                status: 'submitted',
                submittedAt,
              }
            : participant,
        )
      : [
          ...latest.participants,
          {
            id: participantId,
            displayName: participantName,
            status: 'submitted',
            joinedAt: submittedAt,
            submittedAt,
          },
        ],
    items: [
      ...latest.items.filter((item) => item.participantId !== participantId),
      ...submitted,
    ],
    audit: [
      ...latest.audit,
      audit(participantName, `submitted ${submitted.length} item lines`),
    ],
  } satisfies KapiSession
}

function participantGroupKey(item: CartLine) {
  return item.participantId || `name:${item.participantName}`
}

export function getOrderSubtotal(session: KapiSession) {
  return session.items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  )
}

export function getOrderQuantity(session: KapiSession) {
  return session.items.reduce((sum, item) => sum + item.quantity, 0)
}

export function makeManualFallback(
  session: KapiSession,
): ManualFallbackSummary {
  const groups = [...new Set(session.items.map(participantGroupKey))]
  return {
    restaurantName: session.restaurant.name,
    addressLabel: session.address.label,
    total: getOrderSubtotal(session),
    checklist: session.items.map(
      (item) =>
        `${item.quantity}x ${item.name}${item.customizationSummary ? ` (${item.customizationSummary})` : ''} - ${item.participantName}`,
    ),
    byParticipant: groups.map((key) => {
      const items = session.items.filter(
        (item) => participantGroupKey(item) === key,
      )
      return {
        participantName: items.at(-1)?.participantName ?? 'Guest',
        total: items.reduce((sum, item) => sum + item.price * item.quantity, 0),
        items: items.map(
          (item) =>
            `${item.quantity}x ${item.name}${item.customizationSummary ? ` (${item.customizationSummary})` : ''}`,
        ),
      }
    }),
  }
}

export function makeCartPayload(session: KapiSession) {
  return {
    restaurantId: session.restaurant.id,
    restaurantName: session.restaurant.name,
    addressId: session.address.id,
    cartItems: session.items.flatMap((item) => {
      if (!item.available) return []
      const variantsV2 = item.customization?.variantsV2?.map((variant) => ({
        group_id: variant.group_id,
        variation_id: variant.variation_id,
      }))
      const addons = item.customization?.addons?.map((addon) => ({
        group_id: addon.group_id,
        choice_id: addon.choice_id,
      }))
      return [
        {
          menu_item_id: item.swiggyItemId,
          quantity: item.quantity,
          ...(variantsV2?.length ? { variantsV2 } : {}),
          ...(addons?.length ? { addons } : {}),
        },
      ]
    }),
  }
}

export function formatTimeLabel(value: string) {
  const [hourValue, minuteValue] = value.split(':')
  const hour = Number(hourValue)
  const minute = minuteValue.padStart(2, '0')
  if (!Number.isFinite(hour)) return '12:45 PM'
  return `${hour % 12 || 12}:${minute} ${hour >= 12 ? 'PM' : 'AM'}`
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
  if (cutoff.getTime() <= now.getTime()) {
    return { error: 'Choose a cutoff later than now.' }
  }
  return { cutoffAt: cutoff.toISOString() }
}

function cutoffTime(session: KapiSession) {
  if (!session.cutoffAt) return null
  const time = new Date(session.cutoffAt).getTime()
  return Number.isFinite(time) ? time : null
}

export function isSessionLockedForParticipants(
  session: KapiSession,
  now = new Date(),
) {
  if (session.status !== 'open') return true
  const time = cutoffTime(session)
  return time !== null && time <= now.getTime()
}

export function formatRemainingTime(session: KapiSession, now = new Date()) {
  if (session.status !== 'open') return 'Locked'
  const time = cutoffTime(session)
  if (time === null) return `${session.cutoffTime} cutoff`
  const minutes = Math.ceil((time - now.getTime()) / 60_000)
  if (minutes <= 0) return 'Cutoff reached'
  if (minutes >= 60 * 24) return `${Math.ceil(minutes / (60 * 24))}d remaining`
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60)
    return `${hours}h ${String(minutes % 60).padStart(2, '0')}m remaining`
  }
  return `${minutes}m remaining`
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

export function ErrorAlert({
  message,
  className,
}: {
  message: string | null
  className?: string
}) {
  if (!message) return null
  return (
    <Alert variant="destructive" className={className}>
      <AlertTriangle />
      <AlertTitle>Something went wrong</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  )
}

export function SetupStep({
  title,
  active,
  status,
  children,
}: {
  title: string
  active?: boolean
  status?: string
  children: React.ReactNode
}) {
  return (
    <section
      className={cn(
        'relative border-l-2 pl-6',
        active ? 'border-primary' : 'border-border',
      )}
    >
      <span
        className={cn(
          'absolute -left-2.25 top-0 size-4 rounded-full border-2',
          active ? 'border-background bg-primary' : 'border-border bg-muted',
        )}
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h3 className="text-xs font-semibold uppercase leading-4 tracking-[0.02em]">
          {title}
        </h3>
        {status ? (
          <Badge variant="outline">
            <CheckCircle2 data-icon="inline-start" /> {status}
          </Badge>
        ) : null}
      </div>
      {children}
    </section>
  )
}

export function SummaryRow({
  label,
  value,
  strong,
}: {
  label: string
  value: string
  strong?: boolean
}) {
  return (
    <div className="flex justify-between text-[13px] leading-4.5 text-muted-foreground">
      <span>{label}</span>
      <span
        className={cn('font-mono', strong && 'font-medium text-foreground')}
      >
        {value}
      </span>
    </div>
  )
}

export function IconTile({
  icon: Icon,
  className,
}: {
  icon: LucideIcon
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex size-12 shrink-0 items-center justify-center rounded border border-border bg-muted text-muted-foreground',
        className,
      )}
    >
      <Icon />
    </div>
  )
}

export function BrandLockup() {
  return (
    <div className="mb-6 flex items-center gap-2">
      <span className="font-heading text-2xl font-extrabold text-primary">
        Kapi.run
      </span>
      <Badge className="h-5 rounded-full bg-primary px-2 text-[10px] font-bold uppercase tracking-widest text-primary-foreground">
        Ops
      </Badge>
    </div>
  )
}
