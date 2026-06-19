import type {
  Address,
  CartLine,
  KapiSession,
  ManualFallbackSummary,
  Restaurant,
} from '@kapi/spec'
import type { LucideIcon } from 'lucide-react'
import { AlertTriangle, CheckCircle2, Utensils } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '#/components/ui/alert'
import { Badge } from '#/components/ui/badge'
import { cn } from '#/lib/utils'

export type DraftCart = Record<string, number>

export const API_URL =
  import.meta.env.VITE_KAPI_API_URL ?? 'http://127.0.0.1:3001'
export const setupImage = '/assets/kapi-setup-illustration.png'

const encoder = new TextEncoder()
const decoder = new TextDecoder()

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    headers: { 'content-type': 'application/json', ...init?.headers },
    ...init,
  })

  if (!response.ok) {
    const body = await response
      .json()
      .catch(() => ({ error: 'Request failed.' }))
    throw new Error(body.error ?? 'Request failed.')
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

export function getSessionLinkParts() {
  const search = new URLSearchParams(window.location.search)
  const sessionId = search.get('session')
  const owner = search.get('owner') === '1'
  const key =
    new URLSearchParams(window.location.hash.slice(1)).get('key') ??
    (sessionId ? localStorage.getItem(localKeyKey(sessionId)) : null)
  return { key, owner, sessionId }
}

export async function loadEncryptedSession(sessionId: string, key: string) {
  try {
    const record = await api<{ ciphertext: string }>(
      `/relay/sessions/${sessionId}`,
    )
    const loaded = await decryptSession(record.ciphertext, key)
    localStorage.setItem(localSessionKey(sessionId), JSON.stringify(loaded))
    localStorage.setItem(localKeyKey(sessionId), key)
    return loaded
  } catch {
    const local = localStorage.getItem(localSessionKey(sessionId))
    if (local) return JSON.parse(local) as KapiSession
    throw new Error('Session not found.')
  }
}

export async function publishSession(nextSession: KapiSession, key: string) {
  localStorage.setItem(
    localSessionKey(nextSession.id),
    JSON.stringify(nextSession),
  )
  localStorage.setItem(localKeyKey(nextSession.id), key)
  await api(`/relay/sessions/${nextSession.id}`, {
    method: 'PUT',
    body: JSON.stringify({
      ciphertext: await encryptSession(nextSession, key),
    }),
  })
  return nextSession
}

export function audit(actor: string, action: string) {
  return {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    actor,
    action,
  }
}

export function makeManualFallback(
  session: KapiSession,
): ManualFallbackSummary {
  const names = [...new Set(session.items.map((item) => item.participantName))]
  return {
    restaurantName: session.restaurant.name,
    addressLabel: session.address.label,
    total: session.items.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0,
    ),
    checklist: session.items.map(
      (item) =>
        `${item.quantity}x ${item.name}${item.note ? ` (${item.note})` : ''} - ${item.participantName}`,
    ),
    byParticipant: names.map((participantName) => {
      const items = session.items.filter(
        (item) => item.participantName === participantName,
      )
      return {
        participantName,
        total: items.reduce((sum, item) => sum + item.price * item.quantity, 0),
        items: items.map(
          (item) =>
            `${item.quantity}x ${item.name}${item.note ? ` (${item.note})` : ''}`,
        ),
      }
    }),
  }
}

export function makeCartPayload(session: KapiSession) {
  const quantities = new Map<string, number>()
  for (const item of session.items) {
    if (item.available)
      quantities.set(
        item.swiggyItemId,
        (quantities.get(item.swiggyItemId) ?? 0) + item.quantity,
      )
  }
  return {
    restaurantId: session.restaurant.id,
    addressId: session.address.id,
    cartItems: [...quantities.entries()].map(([itemId, quantity]) => ({
      itemId,
      quantity,
    })),
  }
}

export function formatTimeLabel(value: string) {
  const [hourValue, minuteValue] = value.split(':')
  const hour = Number(hourValue)
  const minute = minuteValue.padStart(2, '0')
  if (!Number.isFinite(hour)) return '12:45 PM'
  return `${hour % 12 || 12}:${minute} ${hour >= 12 ? 'PM' : 'AM'}`
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
