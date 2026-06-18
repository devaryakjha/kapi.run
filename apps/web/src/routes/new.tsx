import { useEffect, useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import type { Address, AuthStatus, CartLine, KapiSession, ManualFallbackSummary, MenuItem, Restaurant } from '@kapi/spec'
import {
  AlertTriangle,
  ArrowRight,
  Ban,
  Bell,
  CheckCircle2,
  CircleUserRound,
  Clock,
  ClipboardList,
  Filter,
  LockKeyhole,
  Loader2,
  MapPin,
  Minus,
  Plus,
  Search,
  Send,
  ShoppingCart,
  Soup,
  Star,
  Trash2,
  Utensils,
} from 'lucide-react'

import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '#/components/ui/alert'
import { Avatar, AvatarFallback } from '#/components/ui/avatar'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '#/components/ui/empty'
import { Field, FieldGroup, FieldLabel } from '#/components/ui/field'
import { Input } from '#/components/ui/input'
import { InputGroup, InputGroupAddon, InputGroupInput } from '#/components/ui/input-group'
import { Item, ItemContent, ItemDescription, ItemTitle } from '#/components/ui/item'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '#/components/ui/select'
import { Separator } from '#/components/ui/separator'
import { ToggleGroup, ToggleGroupItem } from '#/components/ui/toggle-group'
import { cn } from '#/lib/utils'

export const Route = createFileRoute('/new')({
  component: RouteComponent,
})

type Screen = 'setup' | 'participant' | 'review'
type DraftCart = Record<string, number>

const API_URL = import.meta.env.VITE_KAPI_API_URL ?? 'http://127.0.0.1:3001'
const setupImage = '/assets/kapi-setup-illustration.png'
const encoder = new TextEncoder()
const decoder = new TextDecoder()

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    headers: { 'content-type': 'application/json', ...init?.headers },
    ...init,
  })

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: 'Request failed.' }))
    throw new Error(body.error ?? 'Request failed.')
  }

  return response.json() as Promise<T>
}

function bytesToBase64Url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

function base64UrlToBytes(value: string) {
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(value.length / 4) * 4, '=')
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))
}

async function makeSessionKey() {
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
  return bytesToBase64Url(new Uint8Array(await crypto.subtle.exportKey('raw', key)))
}

async function importSessionKey(key: string) {
  return crypto.subtle.importKey('raw', base64UrlToBytes(key), 'AES-GCM', false, ['encrypt', 'decrypt'])
}

async function encryptSession(session: KapiSession, key: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const cryptoKey = await importSessionKey(key)
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKey, encoder.encode(JSON.stringify(session))))
  return `${bytesToBase64Url(iv)}.${bytesToBase64Url(ciphertext)}`
}

async function decryptSession(ciphertext: string, key: string) {
  const [iv, data] = ciphertext.split('.')
  if (!iv || !data) throw new Error('Session link is invalid.')
  const cryptoKey = await importSessionKey(key)
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64UrlToBytes(iv) }, cryptoKey, base64UrlToBytes(data))
  return JSON.parse(decoder.decode(plaintext)) as KapiSession
}

function localSessionKey(sessionId: string) {
  return `kapi:session:${sessionId}`
}

function localKeyKey(sessionId: string) {
  return `kapi:key:${sessionId}`
}

function audit(actor: string, action: string) {
  return { id: crypto.randomUUID(), at: new Date().toISOString(), actor, action }
}

function makeManualFallback(session: KapiSession): ManualFallbackSummary {
  const names = [...new Set(session.items.map((item) => item.participantName))]
  return {
    restaurantName: session.restaurant.name,
    addressLabel: session.address.label,
    total: session.items.reduce((sum, item) => sum + item.price * item.quantity, 0),
    checklist: session.items.map((item) => `${item.quantity}x ${item.name}${item.note ? ` (${item.note})` : ''} - ${item.participantName}`),
    byParticipant: names.map((participantName) => {
      const items = session.items.filter((item) => item.participantName === participantName)
      return {
        participantName,
        total: items.reduce((sum, item) => sum + item.price * item.quantity, 0),
        items: items.map((item) => `${item.quantity}x ${item.name}${item.note ? ` (${item.note})` : ''}`),
      }
    }),
  }
}

function makeCartPayload(session: KapiSession) {
  const quantities = new Map<string, number>()
  for (const item of session.items) {
    if (item.available) quantities.set(item.swiggyItemId, (quantities.get(item.swiggyItemId) ?? 0) + item.quantity)
  }
  return {
    restaurantId: session.restaurant.id,
    addressId: session.address.id,
    cartItems: [...quantities.entries()].map(([itemId, quantity]) => ({ itemId, quantity })),
  }
}

function formatTimeLabel(value: string) {
  const [hourValue, minuteValue] = value.split(':')
  const hour = Number(hourValue)
  const minute = minuteValue.padStart(2, '0')
  if (!Number.isFinite(hour)) return '12:45 PM'
  return `${hour % 12 || 12}:${minute} ${hour >= 12 ? 'PM' : 'AM'}`
}

function formatAddressOption(address: Address) {
  return address.detail ? `${address.label} - ${address.detail}` : address.label
}

function RouteComponent() {
  const [screen, setScreen] = useState<Screen>('setup')
  const [addresses, setAddresses] = useState<Address[]>([])
  const [restaurants, setRestaurants] = useState<Restaurant[]>([])
  const [menu, setMenu] = useState<MenuItem[]>([])
  const [authStatus, setAuthStatus] = useState<AuthStatus>({ connected: false, expiresAt: null })
  const [selectedAddressId, setSelectedAddressId] = useState('')
  const [selectedRestaurantId, setSelectedRestaurantId] = useState('')
  const [cutoffTime, setCutoffTime] = useState('12:45')
  const [restaurantQuery, setRestaurantQuery] = useState('')
  const [isOrganizer, setIsOrganizer] = useState(false)
  const [session, setSession] = useState<KapiSession | null>(null)
  const [fallback, setFallback] = useState<ManualFallbackSummary | null>(null)
  const [draft, setDraft] = useState<DraftCart>({})
  const [participantName, setParticipantName] = useState('Alex')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function publishSession(nextSession: KapiSession) {
    const key = localStorage.getItem(localKeyKey(nextSession.id)) ?? new URLSearchParams(window.location.hash.slice(1)).get('key')
    if (!key) throw new Error('Session key is missing.')
    localStorage.setItem(localSessionKey(nextSession.id), JSON.stringify(nextSession))
    localStorage.setItem(localKeyKey(nextSession.id), key)
    await api(`/relay/sessions/${nextSession.id}`, {
      method: 'PUT',
      body: JSON.stringify({ ciphertext: await encryptSession(nextSession, key) }),
    })
    setSession(nextSession)
    return nextSession
  }

  async function loadEncryptedSession(sessionId: string, key: string) {
    try {
      const record = await api<{ ciphertext: string }>(`/relay/sessions/${sessionId}`)
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

  async function refreshSessionFromRelay() {
    if (!session) return session
    const key = localStorage.getItem(localKeyKey(session.id)) ?? new URLSearchParams(window.location.hash.slice(1)).get('key')
    if (!key) return session
    const record = await api<{ ciphertext: string }>(`/relay/sessions/${session.id}`)
    const loaded = await decryptSession(record.ciphertext, key)
    localStorage.setItem(localSessionKey(loaded.id), JSON.stringify(loaded))
    setSession(loaded)
    return loaded
  }

  useEffect(() => {
    const sessionId = new URLSearchParams(window.location.search).get('session')
    const owner = new URLSearchParams(window.location.search).get('owner') === '1'
    const key = new URLSearchParams(window.location.hash.slice(1)).get('key') ?? (sessionId ? localStorage.getItem(localKeyKey(sessionId)) : null)
    setIsOrganizer(owner)
    api<AuthStatus>('/auth/status')
      .then(async (status) => {
        setAuthStatus(status)
        if (sessionId) {
          if (!key) throw new Error('Session key is missing from the link.')
          const loaded = await loadEncryptedSession(sessionId, key)
          const loadedMenu = await api<MenuItem[]>(`/food/restaurants/${loaded.restaurant.id}/menu?addressId=${loaded.address.id}`)
          setSession(loaded)
          setMenu(loadedMenu)
          setScreen(owner ? 'review' : 'participant')
          return
        }
        if (status.connected) {
          const nextAddresses = await api<Address[]>('/food/addresses')
          setAddresses(nextAddresses)
          setSelectedAddressId(nextAddresses[0]?.id ?? '')
        }
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
      const shareUrl = `${window.location.origin}/new?session=${id}#key=${key}`
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
      const nextMenu = await api<MenuItem[]>(`/food/restaurants/${restaurant.id}/menu?addressId=${address.id}`)
      localStorage.setItem(localKeyKey(id), key)
      await publishSession(nextSession)
      setIsOrganizer(true)
      window.history.replaceState(null, '', `/new?session=${id}&owner=1#key=${key}`)
      setMenu(nextMenu)
      setDraft({})
      setScreen('review')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not create session.')
    } finally {
      setPending(false)
    }
  }

  function changeDraft(menuItemId: string, delta: number) {
    setDraft((current) => {
      const nextQuantity = Math.max((current[menuItemId] ?? 0) + delta, 0)
      const next = { ...current }
      if (nextQuantity === 0) {
        delete next[menuItemId]
      } else {
        next[menuItemId] = nextQuantity
      }
      return next
    })
  }

  async function submitDraft() {
    if (!session) return
    const items = Object.entries(draft).map(([menuItemId, quantity]) => ({ menuItemId, quantity }))
    if (!items.length) {
      setError('Add at least one item before submitting.')
      return
    }

    setPending(true)
    setError(null)
    try {
      const latest = await refreshSessionFromRelay()
      if (!latest) return
      const submitted: CartLine[] = items.flatMap((line) => {
        const item = menu.find((candidate) => candidate.id === line.menuItemId && candidate.restaurantId === latest.restaurant.id)
        if (!item || line.quantity <= 0) return []
        return {
          id: crypto.randomUUID(),
          participantName: participantName.trim() || 'Guest',
          menuItemId: item.id,
          name: item.name,
          quantity: line.quantity,
          price: item.price,
          available: item.available,
          swiggyItemId: item.swiggyItemId,
        }
      })
      const name = participantName.trim() || 'Guest'
      const existingParticipant = latest.participants.find((participant) => participant.displayName === name)
      const updated: KapiSession = {
        ...latest,
        participants: existingParticipant
          ? latest.participants.map((participant) => participant.displayName === name ? { ...participant, status: 'submitted', submittedAt: new Date().toISOString() } : participant)
          : [...latest.participants, { id: crypto.randomUUID(), displayName: name, status: 'submitted', joinedAt: new Date().toISOString(), submittedAt: new Date().toISOString() }],
        items: [...latest.items.filter((item) => item.participantName !== name), ...submitted],
        audit: [...latest.audit, audit(name, `submitted ${submitted.length} item lines`)],
      }
      await publishSession(updated)
      if (isOrganizer) {
        setScreen('review')
      } else {
        setDraft({})
        setError('Items added to the group cart.')
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not submit items.')
    } finally {
      setPending(false)
    }
  }

  async function syncCart() {
    if (!session) return
    if (!window.confirm('Add these items to your Swiggy cart? This will not place the order.')) return
    setPending(true)
    setError(null)
    try {
      const result = await api<KapiSession['sync']>('/food/cart/sync', {
        method: 'POST',
        body: JSON.stringify(makeCartPayload(session)),
      })
      await publishSession({
        ...session,
        status: result?.status === 'synced' ? 'synced' : 'sync_failed',
        items: session.items.map((item) => ({ ...item, synced: item.available && result?.status === 'synced' })),
        sync: result,
        audit: [...session.audit, audit('Organiser', 'synced cart to Swiggy')],
      })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not sync cart.')
    } finally {
      setPending(false)
    }
  }

  async function lockSession() {
    if (!session) return
    setPending(true)
    setError(null)
    try {
      await publishSession({ ...session, status: 'locked', audit: [...session.audit, audit('Organiser', 'locked session')] })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not lock session.')
    } finally {
      setPending(false)
    }
  }

  async function updateSubmittedItem(itemId: string, quantity: number) {
    if (!session) return
    setPending(true)
    setError(null)
    try {
      await publishSession({
        ...session,
        items: session.items.map((item) => item.id === itemId ? { ...item, quantity: Math.max(1, Math.floor(quantity)) } : item),
        audit: [...session.audit, audit('Organiser', 'updated item')],
      })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not update item.')
    } finally {
      setPending(false)
    }
  }

  async function removeSubmittedItem(itemId: string) {
    if (!session) return
    setPending(true)
    setError(null)
    try {
      await publishSession({
        ...session,
        items: session.items.filter((item) => item.id !== itemId),
        audit: [...session.audit, audit('Organiser', 'removed item')],
      })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not remove item.')
    } finally {
      setPending(false)
    }
  }

  async function loadManualFallback() {
    if (!session) return
    setPending(true)
    setError(null)
    try {
      setFallback(makeManualFallback(session))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not build manual fallback.')
    } finally {
      setPending(false)
    }
  }

  if (screen === 'participant' && session) {
    return (
      <ParticipantMenu
        draft={draft}
        error={error}
        menu={menu}
        participantName={participantName}
        pending={pending}
        session={session}
        onNameChange={setParticipantName}
        onQuantityChange={changeDraft}
        onSubmit={submitDraft}
      />
    )
  }

  if (screen === 'review' && session) {
    return (
      <OrganizerReview
        error={error}
        fallback={fallback}
        isOrganizer={isOrganizer}
        pending={pending}
        session={session}
        onFallback={loadManualFallback}
        onLock={lockSession}
        onRemoveItem={removeSubmittedItem}
        onRefresh={refreshSessionFromRelay}
        onSync={syncCart}
        onUpdateItem={updateSubmittedItem}
      />
    )
  }

  return (
    <OrganizerSetup
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

function OrganizerSetup({
  addresses,
  authStatus,
  error,
  pending,
  restaurantQuery,
  restaurants,
  cutoffTime,
  selectedAddressId,
  selectedRestaurantId,
  onAddressChange,
  onConnect,
  onCutoffTimeChange,
  onCreate,
  onRestaurantChange,
  onRestaurantQueryChange,
}: {
  addresses: Address[]
  authStatus: AuthStatus
  error: string | null
  pending: boolean
  restaurantQuery: string
  restaurants: Restaurant[]
  cutoffTime: string
  selectedAddressId: string
  selectedRestaurantId: string
  onAddressChange: (addressId: string) => void
  onConnect: () => void
  onCutoffTimeChange: (time: string) => void
  onCreate: () => void
  onRestaurantChange: (restaurantId: string) => void
  onRestaurantQueryChange: (query: string) => void
}) {
  const addressItems = [
    { label: authStatus.connected ? 'Choose address' : 'Connect first', value: '', title: authStatus.connected ? 'Choose address' : 'Connect first', detail: '' },
    ...addresses.map((address) => ({ label: formatAddressOption(address), value: address.id, title: address.label, detail: address.detail })),
  ]

  return (
    <main className="flex min-h-svh bg-background text-foreground">
      <aside className="hidden min-h-svh w-80 shrink-0 flex-col justify-between border-r border-border bg-(--kapi-subtle) p-6 md:flex">
        <div>
          <BrandLockup />
          <h1 className="mb-2 text-xl font-semibold leading-7 tracking-normal">
            Start a New <br />
            Group Session.
          </h1>
          <p className="text-[13px] leading-4.5 text-muted-foreground">
            Coordinate office lunches with precision. Set your constraints, pick the spot, and let the team join.
          </p>
        </div>
        <div className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg border border-border/70 bg-background p-4">
          <img src={setupImage} alt="Kapi setup illustration" className="h-auto w-full object-contain" />
        </div>
        <div aria-hidden="true" />
      </aside>

      <section className="flex-1 p-6 md:p-10">
        <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between md:hidden">
          <span className="font-heading text-xl font-bold text-primary">Kapi.run</span>
          <Badge className="rounded-full bg-primary text-primary-foreground">Ops</Badge>
        </div>
        <header className="mb-10">
          <h2 className="text-xl font-semibold leading-7 tracking-normal">Session Configuration</h2>
          <p className="text-[13px] leading-4.5 text-muted-foreground">Provide context to generate the session invite link.</p>
        </header>

        <div className="flex flex-col gap-10">
          <SetupStep active title="Step 1: Auth Context" status={authStatus.connected ? 'CONNECTED' : undefined}>
            <div className="grid items-center gap-4 sm:grid-cols-[auto_auto] sm:justify-start sm:gap-8">
              <div className="flex items-center gap-4">
                <IconTile icon={Utensils} />
                <div>
                  <h4 className="text-sm font-medium">Swiggy Login</h4>
                  <p className="text-sm text-muted-foreground">
                    {authStatus.connected ? 'Ready to choose saved addresses.' : 'Connect your Swiggy account to start.'}
                  </p>
                </div>
              </div>
              <Button onClick={onConnect} variant={authStatus.connected ? 'link' : 'default'} size="sm">
                {authStatus.connected ? 'Reconnect' : 'Connect Swiggy'}
              </Button>
            </div>
          </SetupStep>

          <SetupStep title="Step 2: Logistics">
            <FieldGroup className="grid min-w-0 gap-4 md:grid-cols-2">
              <Field className="min-w-0 gap-1">
                <FieldLabel className="text-[11px] font-medium tracking-[0.03em] text-muted-foreground">Delivery Context</FieldLabel>
                <Select
                  items={addressItems}
                  value={selectedAddressId}
                  onValueChange={(value) => onAddressChange(String(value))}
                  disabled={!authStatus.connected || !addresses.length}
                >
                  <SelectTrigger className="w-full min-w-0">
                    <MapPin className="text-muted-foreground" data-icon="inline-start" />
                    <SelectValue className="min-w-0 truncate" />
                  </SelectTrigger>
                  <SelectContent alignItemWithTrigger={false} className="w-[min(36rem,calc(100vw-2rem))]">
                    <SelectGroup>
                      {addressItems.map((address) => (
                        <SelectItem key={address.value || 'empty'} value={address.value} className="items-start whitespace-normal">
                          <Item size="xs" className="min-w-0 p-0">
                            <ItemContent className="min-w-0">
                              <ItemTitle className="whitespace-normal">{address.title}</ItemTitle>
                              {address.detail ? <ItemDescription className="line-clamp-none whitespace-normal break-words">{address.detail}</ItemDescription> : null}
                            </ItemContent>
                          </Item>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field className="min-w-0 gap-1">
                <FieldLabel htmlFor="cutoff-time" className="text-[11px] font-medium tracking-[0.03em] text-muted-foreground">Cutoff Time</FieldLabel>
                <Input
                  id="cutoff-time"
                  type="time"
                  step="60"
                  value={cutoffTime}
                  onChange={(event) => onCutoffTimeChange(event.target.value)}
                />
              </Field>
            </FieldGroup>
          </SetupStep>

          <SetupStep title="Step 3: Venue">
            <div className="flex flex-col gap-4">
              <InputGroup>
                <InputGroupInput
                  value={restaurantQuery}
                  onChange={(event) => onRestaurantQueryChange(event.target.value)}
                  disabled={!selectedAddressId}
                  placeholder="Search restaurants or cuisine"
                />
                <InputGroupAddon>
                  {pending && restaurantQuery.trim() ? <Loader2 className="animate-spin" /> : <Search />}
                </InputGroupAddon>
              </InputGroup>
              {restaurants.length ? (
                <div className="grid gap-2">
                  {restaurants.map((restaurant) => (
                    <Button
                      key={restaurant.id}
                      type="button"
                      variant="outline"
                      onClick={() => onRestaurantChange(restaurant.id)}
                      disabled={restaurant.availabilityStatus !== 'OPEN'}
                      className={cn(
                        'h-auto justify-start gap-4 p-3 text-left',
                        selectedRestaurantId === restaurant.id && 'border-primary ring-2 ring-primary/10',
                      )}
                    >
                      {restaurant.imageUrl ? <img src={restaurant.imageUrl} alt={restaurant.name} className="size-12 shrink-0 border border-border object-cover grayscale-[0.45]" /> : <IconTile icon={Utensils} className="size-12" />}
                      <span className="min-w-0 flex-1">
                        <span className="block text-base font-semibold leading-6">{restaurant.name}</span>
                        <span className="block text-[13px] leading-4.5 text-muted-foreground">{restaurant.area || restaurant.availabilityStatus}</span>
                      </span>
                      {restaurant.rating ? (
                        <span className="flex items-center gap-1 text-[11px] font-bold text-primary">
                          <Star className="fill-current" /> {restaurant.rating}
                        </span>
                      ) : null}
                    </Button>
                  ))}
                </div>
              ) : null}
            </div>
          </SetupStep>

          <div className="border-t border-border pt-4">
            <ErrorAlert message={error} className="mb-3" />
            <Button onClick={onCreate} disabled={pending || !authStatus.connected || !selectedAddressId || !selectedRestaurantId} className="h-12 w-full rounded-lg text-base font-semibold">
              {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
              Create Group Session
              <ArrowRight data-icon="inline-end" />
            </Button>
            <p className="mt-4 text-center text-[13px] leading-4.5 text-muted-foreground">Invite link will be generated instantly.</p>
          </div>
        </div>
        </div>
      </section>
    </main>
  )
}

function ParticipantMenu({
  draft,
  error,
  menu,
  participantName,
  pending,
  session,
  onNameChange,
  onQuantityChange,
  onSubmit,
}: {
  draft: DraftCart
  error: string | null
  menu: MenuItem[]
  participantName: string
  pending: boolean
  session: KapiSession
  onNameChange: (name: string) => void
  onQuantityChange: (menuItemId: string, delta: number) => void
  onSubmit: () => void
}) {
  const [query, setQuery] = useState('')
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return menu.filter((item) => !normalized || item.name.toLowerCase().includes(normalized) || item.category.toLowerCase().includes(normalized))
  }, [menu, query])
  const categories = useMemo(() => ['All', ...[...new Set(menu.map((item) => item.category).filter(Boolean))].slice(0, 3)], [menu])

  const tileItems = filtered.slice(1, 5)
  const listItems = filtered.slice(5)

  return (
    <main className="flex min-h-svh flex-col bg-background text-foreground">
      <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-border bg-(--kapi-subtle) px-4 md:px-8">
        <div className="flex min-w-0 items-center gap-4">
          <span className="font-heading text-2xl font-extrabold text-primary">Kapi.run</span>
          <Separator orientation="vertical" className="hidden h-6 md:block" />
          <div className="hidden flex-col md:flex">
            <span className="text-base font-semibold leading-6 text-primary">{session.restaurant.name}</span>
            <label className="text-[11px] font-medium tracking-[0.03em] text-muted-foreground">
              Participant:{' '}
              <input className="bg-transparent outline-none" value={participantName} onChange={(event) => onNameChange(event.target.value)} />
            </label>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden flex-col items-end md:flex">
            <span className="text-xs font-bold leading-4">{session.cutoffTime} cutoff</span>
            <span className="text-[11px] font-medium leading-3.5 text-destructive">18m remaining</span>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted px-4 py-2">
            <Clock className="text-[#ff9f1c]" />
            <span className="font-mono text-[13px] font-bold leading-5">17:42</span>
          </div>
          <Button variant="ghost" size="icon-sm" className="rounded-full text-muted-foreground"><Bell /></Button>
          <Avatar>
            <AvatarFallback>{participantName.slice(0, 1) || 'A'}</AvatarFallback>
          </Avatar>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <section className="flex-1 overflow-y-auto p-4 pb-28 md:p-8 lg:pb-8">
          <div className="mx-auto flex max-w-4xl flex-col gap-6">
            <div className="md:hidden">
              <Field className="gap-1">
                <FieldLabel className="text-[11px] font-medium tracking-[0.03em] text-muted-foreground">Participant</FieldLabel>
                <Input value={participantName} onChange={(event) => onNameChange(event.target.value)} className="h-10 rounded-lg border-border bg-background text-sm" />
              </Field>
            </div>
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-4">
                <InputGroup className="flex-1">
                  <InputGroupInput value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${session.restaurant.name} menu...`} />
                  <InputGroupAddon>
                    <Search />
                  </InputGroupAddon>
                </InputGroup>
                <Button variant="outline"><Filter data-icon="inline-start" /> Filters</Button>
              </div>
              <ToggleGroup
                value={categories.includes(query) ? [query] : ['All']}
                onValueChange={(value) => {
                  const next = value[0]
                  if (next) setQuery(next === 'All' ? '' : next)
                }}
                variant="outline"
                size="sm"
                className="max-w-full overflow-x-auto pb-1"
              >
                {categories.map((filter) => (
                  <ToggleGroupItem key={filter} value={filter}>
                    {filter}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>

            <section className="grid grid-cols-12 gap-4">
              {filtered.slice(0, 1).map((item) => <FeaturedItem key={item.id} item={item} onAdd={() => onQuantityChange(item.id, 1)} />)}
              {tileItems.map((item) => <MenuTile key={item.id} item={item} onAdd={() => onQuantityChange(item.id, 1)} />)}
              <MenuList items={listItems} onAdd={(item) => onQuantityChange(item.id, 1)} />
              {!filtered.length ? (
                <Empty className="col-span-12 border">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <Search />
                    </EmptyMedia>
                    <EmptyTitle>No menu items found</EmptyTitle>
                    <EmptyDescription>Try another restaurant item or category.</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : null}
            </section>
          </div>
        </section>
        <CartSidebar draft={draft} error={error} menu={menu} pending={pending} onQuantityChange={onQuantityChange} onSubmit={onSubmit} />
      </div>
      <MobileCartBar draft={draft} error={error} menu={menu} pending={pending} onSubmit={onSubmit} />
    </main>
  )
}

function FeaturedItem({ item, onAdd }: { item: MenuItem; onAdd: () => void }) {
  return (
    <article className="col-span-12 overflow-hidden border border-border">
      <div className="flex flex-col md:flex-row">
        <div className="relative h-48 w-full shrink-0 overflow-hidden bg-muted md:h-auto md:w-48">
          {item.imageUrl ? <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" /> : null}
          {item.tags?.[0] ? <Badge className="absolute left-2 top-2 rounded bg-red-600 text-[10px] font-bold uppercase text-white">{item.tags[0]}</Badge> : null}
        </div>
        <div className="flex flex-1 flex-col justify-between p-6">
          <div>
            <div className="mb-1 flex items-start justify-between gap-4">
              <h2 className="text-xl font-semibold leading-7">{item.name}</h2>
              <span className="font-mono text-[13px] font-bold text-primary">₹{item.price}</span>
            </div>
            <p className="max-w-lg text-[13px] leading-4.5 text-muted-foreground">{item.description}</p>
          </div>
          <div className="mt-6 flex items-center justify-between gap-4">
            <div className="flex gap-1">
              {item.tags?.slice(1).map((tag) => <Badge key={tag} variant="secondary" className="rounded bg-(--kapi-subtle) text-muted-foreground">{tag}</Badge>)}
            </div>
            <Button onClick={onAdd} disabled={!item.available} className="rounded px-10"><Plus data-icon="inline-start" /> Add to Cart</Button>
          </div>
        </div>
      </div>
    </article>
  )
}

function MenuTile({ item, onAdd }: { item: MenuItem; onAdd: () => void }) {
  return (
    <article className="col-span-12 border border-border md:col-span-6">
      <div className="flex gap-4 p-4">
        <div className="relative size-24 shrink-0 overflow-hidden rounded bg-muted">
          {item.imageUrl ? <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" /> : null}
          {item.tags?.includes('Veg') ? <Badge className="absolute left-1 top-1 rounded bg-green-600 px-1.5 py-0 text-[8px] uppercase text-white">Veg</Badge> : null}
        </div>
        <div className="flex flex-1 flex-col justify-between">
          <div>
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-base font-semibold leading-6">{item.name}</h3>
              <span className="font-mono text-[13px] text-muted-foreground">₹{item.price}</span>
            </div>
            <p className="mt-1 text-[13px] leading-4.5 text-muted-foreground">{item.description}</p>
          </div>
          <div className="mt-2 flex justify-end">
            <Button onClick={onAdd} disabled={!item.available} variant="outline" size="icon-sm" className="rounded-full text-primary"><Plus /></Button>
          </div>
        </div>
      </div>
    </article>
  )
}

function MenuList({ items, onAdd }: { items: MenuItem[]; onAdd: (item: MenuItem) => void }) {
  if (!items.length) return null
  return (
    <section className="col-span-12 border border-border">
      <header className="flex items-center justify-between border-b border-border px-4 py-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">More Items</h2>
        <span className="text-[11px] font-medium text-muted-foreground">{items.length} items available</span>
      </header>
      <div className="divide-y divide-border">
        {items.map((item) => (
          <div key={item.id} className="flex cursor-pointer items-center justify-between gap-4 p-4 transition-colors hover:bg-(--kapi-subtle)">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-4">
                <span className="text-sm font-semibold">{item.name}</span>
                {item.tags?.includes('Veg') ? <Badge variant="outline" className="rounded border-green-200 bg-green-50 text-[10px] text-green-700">Veg</Badge> : null}
                {!item.available ? <Badge variant="destructive" className="rounded text-[10px]">Unavailable</Badge> : null}
              </div>
              <p className="truncate text-[13px] leading-4.5 text-muted-foreground">{item.description}</p>
            </div>
            <div className="flex items-center gap-8">
              <span className="font-mono text-[13px]">₹{item.price}</span>
              <Button onClick={() => onAdd(item)} disabled={!item.available} variant="outline" size="sm" className="rounded">Add</Button>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function CartSidebar({
  draft,
  error,
  menu,
  pending,
  onQuantityChange,
  onSubmit,
}: {
  draft: DraftCart
  error: string | null
  menu: MenuItem[]
  pending: boolean
  onQuantityChange: (menuItemId: string, delta: number) => void
  onSubmit: () => void
}) {
  const lines = Object.entries(draft).flatMap(([id, quantity]) => {
    const item = menu.find((candidate) => candidate.id === id)
    return item ? [{ item, quantity }] : []
  })
  const total = lines.reduce((sum, line) => sum + line.item.price * line.quantity, 0)
  const surcharge = lines.length ? 15 : 0

  return (
    <aside className="hidden h-[calc(100vh-4rem)] w-80 shrink-0 flex-col border-l border-border bg-(--kapi-subtle) lg:flex">
      <div className="border-b border-border bg-background/80 p-6 backdrop-blur-sm">
        <h3 className="flex items-center justify-between text-base font-semibold leading-6">
          Your Draft Cart
          <Badge className="rounded bg-primary/10 font-mono text-xs text-primary">{lines.length} Items</Badge>
        </h3>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        <div className="flex flex-col gap-4">
          {lines.map(({ item, quantity }) => (
            <div key={item.id} className="border-b border-border pb-4 last:border-b-0">
              <div className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                  <h4 className="text-xs font-semibold leading-4">{item.name}</h4>
                  <span className="font-mono text-[13px] text-muted-foreground">₹{item.price}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex h-7 items-center overflow-hidden rounded border border-border">
                    <Button onClick={() => onQuantityChange(item.id, -1)} variant="ghost" size="icon-xs" className="rounded-none text-muted-foreground"><Minus /></Button>
                    <span className="px-2 font-mono text-[13px]">{quantity}</span>
                    <Button onClick={() => onQuantityChange(item.id, 1)} variant="ghost" size="icon-xs" className="rounded-none text-muted-foreground"><Plus /></Button>
                  </div>
                  <Button onClick={() => onQuantityChange(item.id, -quantity)} variant="ghost" size="icon-xs" className="rounded text-destructive"><Trash2 /></Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="border-t border-border bg-background p-6 shadow-[0_-4px_12px_rgba(0,0,0,0.02)]">
        <ErrorAlert message={error} className="mb-3" />
        <div className="mb-4 flex flex-col gap-2">
          <SummaryRow label="Items Total" value={`₹${total}.00`} />
          <SummaryRow label="Group Surcharge" value={`₹${surcharge}.00`} />
          <Separator className="mt-1" />
          <div className="flex justify-between pt-1 text-base font-semibold leading-6">
            <span>Your Total</span><span className="font-mono">₹{total + surcharge}.00</span>
          </div>
        </div>
        <Button onClick={onSubmit} disabled={pending} className="h-12 w-full rounded-lg text-base font-semibold">
          {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
          Submit to Group Cart
          <Send data-icon="inline-end" />
        </Button>
      </div>
    </aside>
  )
}

function MobileCartBar({
  draft,
  error,
  menu,
  pending,
  onSubmit,
}: {
  draft: DraftCart
  error: string | null
  menu: MenuItem[]
  pending: boolean
  onSubmit: () => void
}) {
  const lines = Object.entries(draft).flatMap(([id, quantity]) => {
    const item = menu.find((candidate) => candidate.id === id)
    return item ? [{ item, quantity }] : []
  })
  const total = lines.reduce((sum, line) => sum + line.item.price * line.quantity, 0)
  const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0)

  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/95 p-3 shadow-[0_-8px_24px_rgba(0,0,0,0.08)] backdrop-blur lg:hidden">
      <ErrorAlert message={error} className="mb-2" />
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold leading-4">{itemCount} items</p>
          <p className="font-mono text-sm font-bold leading-5">₹{total + (lines.length ? 15 : 0)}.00</p>
        </div>
        <Button onClick={onSubmit} disabled={pending} className="h-11 rounded-lg px-4 text-sm font-semibold">
          {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
          Submit
          <Send data-icon="inline-end" />
        </Button>
      </div>
    </div>
  )
}

function OrganizerReview({
  error,
  fallback,
  isOrganizer,
  pending,
  session,
  onFallback,
  onLock,
  onRemoveItem,
  onRefresh,
  onSync,
  onUpdateItem,
}: {
  error: string | null
  fallback: ManualFallbackSummary | null
  isOrganizer: boolean
  pending: boolean
  session: KapiSession
  onFallback: () => void
  onLock: () => void
  onRemoveItem: (itemId: string) => void
  onRefresh: () => void
  onSync: () => void
  onUpdateItem: (itemId: string, quantity: number) => void
}) {
  const groups = useMemo(() => {
    const names = [...new Set(session.items.map((item) => item.participantName))]
    return names.map((name) => ({
      name,
      items: session.items.filter((item) => item.participantName === name),
    }))
  }, [session.items])
  const subtotal = session.items.reduce((sum, item) => sum + item.price * item.quantity, 0)
  const unavailable = session.items.filter((item) => !item.available)
  const taxes = Math.round(subtotal * 0.12)
  const finalTotal = subtotal + taxes

  return (
    <main className="min-h-svh bg-background text-foreground">
      <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-border bg-background px-4 shadow-sm md:px-8">
        <div className="flex items-center gap-10">
          <span className="font-heading text-2xl font-extrabold text-primary">Kapi.run</span>
          <nav className="hidden h-14 items-center gap-6 lg:flex">
            <a className="flex h-14 items-center border-b-2 border-primary text-xs font-semibold tracking-[0.02em] text-primary" href="#">Review Order</a>
            <a className="flex h-14 items-center px-2 text-xs font-semibold tracking-[0.02em] text-muted-foreground" href="#">Order History</a>
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon-sm" className="rounded text-muted-foreground"><Bell /></Button>
          <Avatar>
            <AvatarFallback><CircleUserRound /></AvatarFallback>
          </Avatar>
        </div>
      </header>

      <section className="mx-auto w-full max-w-6xl p-4 md:p-8">
        <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold leading-8 tracking-normal">Consolidated Review</h1>
            <p className="text-sm leading-5 text-muted-foreground">Order cutoff reached. Please review the items before finalizing with Swiggy.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="w-fit rounded bg-(--kapi-subtle) font-mono text-[11px] text-muted-foreground">SESSION: {session.id.slice(0, 8)}</Badge>
            <Badge variant={session.status === 'open' ? 'secondary' : 'default'} className="rounded">{session.status}</Badge>
            <Button onClick={onLock} disabled={pending || session.status !== 'open'} variant="outline" size="sm" className="rounded">
              <LockKeyhole data-icon="inline-start" />
              Lock
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-12 items-start gap-4">
          <div className="col-span-12 flex flex-col gap-4 lg:col-span-8">
            {isOrganizer ? (
              <section className="border-b border-border pb-4">
                <h2 className="mb-2 text-base font-semibold leading-6">Invite Link</h2>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input readOnly value={session.shareUrl} className="font-mono text-xs" />
                  <Button onClick={() => navigator.clipboard.writeText(session.shareUrl)} variant="outline">Copy</Button>
                  <Button onClick={onRefresh} variant="outline">Refresh</Button>
                </div>
              </section>
            ) : null}
            {!groups.length ? (
              <Empty className="border">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <ShoppingCart />
                  </EmptyMedia>
                  <EmptyTitle>Waiting for items</EmptyTitle>
                  <EmptyDescription>Participants will appear here after they submit their cart.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : null}
            {groups.map((group) => (
              <ParticipantGroup
                key={group.name}
                name={group.name}
                items={group.items}
                onRemoveItem={onRemoveItem}
                onUpdateItem={onUpdateItem}
              />
            ))}
          </div>

          <aside className="col-span-12 flex flex-col gap-4 lg:col-span-4">
            <section className="sticky top-20 border-l border-border pl-4">
              <h2 className="mb-4 text-base font-semibold leading-6">Order Summary</h2>
              <div className="mb-6 flex flex-col gap-2">
                <SummaryRow label="Total Participants" value={String(groups.length)} strong />
                <SummaryRow label="Items Ordered" value={String(session.items.reduce((sum, item) => sum + item.quantity, 0))} strong />
                <SummaryRow label="Subtotal" value={`₹${subtotal}`} strong />
                <SummaryRow label="Taxes & Delivery" value={`₹${taxes}`} strong />
                <Separator className="mt-1" />
                <div className="flex justify-between pt-1 text-base font-semibold leading-6"><span>Final Total</span><span className="text-primary">₹{finalTotal}</span></div>
              </div>
              <div className="flex flex-col gap-2">
                <Button onClick={onSync} disabled={pending || !session.items.length} className="h-12 text-base font-semibold">
                  {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <ShoppingCart data-icon="inline-start" />}
                  {session.status === 'synced' ? 'Cart Ready' : 'Add to Swiggy Cart'}
                </Button>
                <Button variant="outline">Download Receipt</Button>
                <Button onClick={onFallback} variant="outline">
                  <ClipboardList data-icon="inline-start" />
                  Manual Checklist
                </Button>
              </div>
              <ErrorAlert message={error} className="mt-3" />
              {session.sync ? <p className="mt-3 text-[13px] leading-4.5 text-muted-foreground">{session.sync.message}</p> : null}
              {unavailable.length ? (
                <Alert variant="destructive" className="mt-6">
                  <AlertTriangle />
                  <AlertTitle>{unavailable.length} item is unavailable.</AlertTitle>
                  <AlertDescription>Remove or replace before syncing.</AlertDescription>
                </Alert>
              ) : null}
            </section>

            <section className="border-l border-border pl-4">
              <p className="mb-1 text-[11px] font-bold uppercase leading-3.5 tracking-[0.03em] text-primary">Next Step</p>
              <h3 className="mb-2 text-base font-semibold leading-6">Open Swiggy Cart</h3>
              <p className="mb-4 text-[13px] leading-4.5 text-muted-foreground">Review the synced cart in Swiggy, apply coupons or payment details there, then complete checkout.</p>
              <Button variant="link" className="h-auto gap-1 px-0 text-xs"><ShoppingCart data-icon="inline-start" /> Continue in Swiggy</Button>
            </section>

            {fallback ? (
              <section className="border-l border-border pl-4">
                <h3 className="mb-2 text-base font-semibold leading-6">Manual Swiggy Checklist</h3>
                <p className="mb-3 text-[13px] leading-4.5 text-muted-foreground">
                  {fallback.restaurantName} • {fallback.addressLabel} • ₹{fallback.total}
                </p>
                <div className="flex flex-col gap-2">
                  {fallback.checklist.map((line) => (
                    <div key={line} className="border-b border-border pb-2 font-mono text-xs last:border-b-0">
                      {line}
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
          </aside>
        </div>
      </section>
    </main>
  )
}

function ParticipantGroup({
  name,
  items,
  onRemoveItem,
  onUpdateItem,
}: {
  name: string
  items: CartLine[]
  onRemoveItem: (itemId: string) => void
  onUpdateItem: (itemId: string, quantity: number) => void
}) {
  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0)
  return (
    <section className="border border-border">
      <header className="flex items-center justify-between border-b border-border px-4 py-2">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold leading-6">{name}</h2>
          <Badge variant="outline" className="rounded bg-background text-[11px] text-muted-foreground">{items.length} items</Badge>
        </div>
        <span className="font-mono text-[13px] text-muted-foreground">₹{total}.00</span>
      </header>
      <div className="divide-y divide-border">
        {items.map((item) => (
          <ReviewItem
            key={item.id}
            item={item}
            onRemove={() => onRemoveItem(item.id)}
            onUpdate={(quantity) => onUpdateItem(item.id, quantity)}
          />
        ))}
      </div>
    </section>
  )
}

function ReviewItem({
  item,
  onRemove,
  onUpdate,
}: {
  item: CartLine
  onRemove: () => void
  onUpdate: (quantity: number) => void
}) {
  const Icon = item.available ? (item.name.includes('Dal') ? Soup : Utensils) : Ban
  return (
    <div className={cn('flex items-start justify-between gap-4 p-4 transition-colors hover:bg-(--kapi-subtle)', !item.available && 'bg-destructive/5 hover:bg-destructive/10')}>
      <div className="flex gap-4">
        <IconTile icon={Icon} className={!item.available ? 'border-destructive bg-destructive/10 text-destructive' : undefined} />
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-xs font-semibold leading-4">{item.name}</h3>
            {!item.available ? <Badge className="rounded bg-destructive text-[10px] font-bold uppercase tracking-wider text-white">Out of Stock</Badge> : null}
          </div>
          <p className="text-[13px] leading-4.5 text-muted-foreground">{item.note || 'Standard Portion'}</p>
        </div>
      </div>
      <div className="text-right">
        <p className={cn('text-xs font-semibold leading-4', !item.available && 'text-destructive')}>₹{item.price}</p>
        <p className="text-[11px] font-medium leading-3.5 text-muted-foreground">Qty: {item.quantity}</p>
        <div className="mt-2 flex items-center justify-end gap-1">
          <Button onClick={() => onUpdate(item.quantity - 1)} variant="outline" size="icon-xs" className="rounded"><Minus /></Button>
          <Button onClick={() => onUpdate(item.quantity + 1)} variant="outline" size="icon-xs" className="rounded"><Plus /></Button>
          <Button onClick={onRemove} variant="ghost" size="icon-xs" className="rounded text-destructive"><Trash2 /></Button>
        </div>
      </div>
    </div>
  )
}

function SetupStep({ title, active, status, children }: { title: string; active?: boolean; status?: string; children: React.ReactNode }) {
  return (
    <section className={cn('relative border-l-2 pl-6', active ? 'border-primary' : 'border-border')}>
      <span className={cn('absolute -left-2.25 top-0 size-4 rounded-full border-2', active ? 'border-background bg-primary' : 'border-border bg-muted')} />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h3 className="text-xs font-semibold uppercase leading-4 tracking-[0.02em]">{title}</h3>
        {status ? <Badge variant="outline"><CheckCircle2 data-icon="inline-start" /> {status}</Badge> : null}
      </div>
      {children}
    </section>
  )
}

function SummaryRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between text-[13px] leading-4.5 text-muted-foreground">
      <span>{label}</span>
      <span className={cn('font-mono', strong && 'font-medium text-foreground')}>{value}</span>
    </div>
  )
}

function ErrorAlert({ message, className }: { message: string | null; className?: string }) {
  if (!message) return null
  return (
    <Alert variant="destructive" className={className}>
      <AlertTriangle />
      <AlertTitle>Something went wrong</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  )
}

function IconTile({ icon: Icon, className }: { icon: typeof Utensils; className?: string }) {
  return (
    <div className={cn('flex size-12 shrink-0 items-center justify-center rounded border border-border bg-muted text-muted-foreground', className)}>
      <Icon />
    </div>
  )
}

function BrandLockup() {
  return (
    <div className="mb-6 flex items-center gap-2">
      <span className="font-heading text-2xl font-extrabold text-primary">Kapi.run</span>
      <Badge className="h-5 rounded-full bg-primary px-2 text-[10px] font-bold uppercase tracking-widest text-primary-foreground">Ops</Badge>
    </div>
  )
}
