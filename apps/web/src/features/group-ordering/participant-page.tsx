import { useMemo, useState } from 'react'
import type { KapiSession, MenuItem } from '@kapi/spec'
import {
  CheckCircle2,
  Loader2,
  Minus,
  Plus,
  Search,
  Send,
  Trash2,
  Utensils,
} from 'lucide-react'

import { Avatar, AvatarFallback } from '#/components/ui/avatar'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Button } from '#/components/ui/button'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '#/components/ui/empty'
import { Field, FieldLabel } from '#/components/ui/field'
import { Input } from '#/components/ui/input'
import { Separator } from '#/components/ui/separator'
import { cn } from '#/lib/utils'

import type { DraftCart } from './shared'
import {
  ErrorAlert,
  SummaryRow,
  formatRemainingTime,
  isSessionLockedForParticipants,
} from './shared'

export function ParticipantMenuPage({
  draft,
  error,
  menu,
  notice,
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
  notice: string | null
  participantName: string
  pending: boolean
  session: KapiSession
  onNameChange: (name: string) => void
  onQuantityChange: (menuItemId: string, delta: number) => void
  onSubmit: () => void
}) {
  const [query, setQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState('All')

  const categories = useMemo(
    () => [
      'All',
      ...[
        ...new Set(
          menu.flatMap((item) => (item.category ? [item.category] : [])),
        ),
      ].slice(0, 5),
    ],
    [menu],
  )

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return menu.filter((item) => {
      const matchesCategory =
        activeCategory === 'All' || item.category === activeCategory
      const matchesQuery =
        !normalized ||
        item.name.toLowerCase().includes(normalized) ||
        item.category.toLowerCase().includes(normalized)
      return matchesCategory && matchesQuery
    })
  }, [menu, query, activeCategory])

  const locked = isSessionLockedForParticipants(session)
  const remainingTime = formatRemainingTime(session)

  return (
    <main className="flex h-svh flex-col bg-background text-foreground">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur-sm md:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <span className="text-base font-bold tracking-tight text-primary">
            kapi.run
          </span>
          <span className="hidden h-4 w-px bg-border md:block" />
          <span className="hidden truncate text-sm font-medium text-foreground md:block">
            {session.restaurant.name}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <TimerPill remainingTime={remainingTime} locked={locked} />
          <Avatar className="size-8">
            <AvatarFallback className="text-xs font-semibold">
              {participantName.slice(0, 1).toUpperCase() || 'A'}
            </AvatarFallback>
          </Avatar>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <section className="flex-1 overflow-y-auto">
          <div className="sticky top-0 z-[5] border-b border-border bg-background/95 px-4 pb-3 pt-3 backdrop-blur-sm md:px-6">
            <div className="mx-auto max-w-3xl">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value)
                    if (e.target.value) setActiveCategory('All')
                  }}
                  placeholder={`Search ${session.restaurant.name} menu…`}
                  className="h-9 w-full rounded-lg border border-border bg-background pl-9 pr-4 text-sm outline-none ring-primary/30 transition-shadow placeholder:text-muted-foreground focus:ring-2"
                />
              </div>
              <div className="mt-2.5 flex gap-1.5 overflow-x-auto pb-0.5">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => {
                      setActiveCategory(cat)
                      setQuery('')
                    }}
                    className={cn(
                      'shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-[colors,scale] duration-150 active:scale-[0.96]',
                      activeCategory === cat && !query
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-background text-muted-foreground hover:border-foreground/20 hover:text-foreground',
                    )}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="px-4 py-4 pb-28 md:px-6 lg:pb-6">
            <div className="mx-auto max-w-3xl">
              <div className="mb-4 md:hidden">
                <Field className="gap-1.5">
                  <FieldLabel className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    Your name
                  </FieldLabel>
                  <Input
                    value={participantName}
                    onChange={(e) => onNameChange(e.target.value)}
                    placeholder="Enter your name"
                    className="h-9 text-sm"
                  />
                </Field>
              </div>

              {!filtered.length ? (
                <Empty className="border border-border">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <Search />
                    </EmptyMedia>
                    <EmptyTitle>No items found</EmptyTitle>
                    <EmptyDescription>
                      Try a different search or category.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {filtered.map((item) => (
                    <MenuCard
                      key={item.id}
                      item={item}
                      quantity={draft[item.id] ?? 0}
                      locked={locked}
                      onAdd={() => onQuantityChange(item.id, 1)}
                      onRemove={() => onQuantityChange(item.id, -1)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        <CartSidebar
          draft={draft}
          error={error}
          locked={locked}
          menu={menu}
          notice={notice}
          participantName={participantName}
          pending={pending}
          onNameChange={onNameChange}
          onQuantityChange={onQuantityChange}
          onSubmit={onSubmit}
        />
      </div>

      <MobileCartBar
        draft={draft}
        error={error}
        locked={locked}
        menu={menu}
        notice={notice}
        pending={pending}
        onSubmit={onSubmit}
      />
    </main>
  )
}

function TimerPill({
  remainingTime,
  locked,
}: {
  remainingTime: string
  locked: boolean
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-full border px-3 py-1.5',
        locked
          ? 'border-destructive/30 bg-destructive/10 text-destructive'
          : 'border-border bg-(--kapi-subtle) text-foreground',
      )}
    >
      {!locked && (
        <span className="relative flex size-1.5 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
          <span className="relative inline-flex size-1.5 rounded-full bg-primary" />
        </span>
      )}
      <span className="font-mono text-xs font-semibold tabular-nums">{remainingTime}</span>
    </div>
  )
}

function MenuCard({
  item,
  quantity,
  locked,
  onAdd,
  onRemove,
}: {
  item: MenuItem
  quantity: number
  locked: boolean
  onAdd: () => void
  onRemove: () => void
}) {
  return (
    <article
      className={cn(
        'flex gap-3 rounded-4xl border border-border bg-background p-3 transition-colors',
        !item.available && 'opacity-50',
        quantity > 0 && 'border-primary/30 bg-primary/[0.02]',
      )}
    >
      <div className="relative size-[72px] shrink-0 overflow-hidden rounded-lg bg-muted">
        {item.imageUrl ? (
          <img
            src={item.imageUrl}
            alt={item.name}
            className="h-full w-full object-cover outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Utensils className="size-5 text-muted-foreground" />
          </div>
        )}
        {item.tags?.includes('Veg') ? (
          <span className="absolute bottom-1 left-1 flex size-3.5 items-center justify-center rounded border-[1.5px] border-green-600 bg-background">
            <span className="size-1.5 rounded-full bg-green-600" />
          </span>
        ) : null}
      </div>

      <div className="mt-0 flex min-w-0 flex-1 flex-col justify-between">
        <div>
          <h3 className="text-sm font-semibold leading-tight">{item.name}</h3>
          {item.description ? (
            <p className="mt-0.5 line-clamp-2 text-[12px] leading-[1.4] text-muted-foreground">
              {item.description}
            </p>
          ) : null}
        </div>
        <div className="mt-2 flex items-center justify-between">
          <span className="font-mono text-sm font-bold tabular-nums">₹{item.price}</span>
          {quantity > 0 ? (
            <div className="flex h-8 items-center rounded-full border border-primary/40 bg-primary/5">
              <button
                onClick={onRemove}
                disabled={locked}
                className="flex size-8 items-center justify-center rounded-full text-primary transition-[colors,scale] duration-150 hover:bg-primary/10 active:scale-[0.96] disabled:pointer-events-none"
              >
                <Minus className="size-3" />
              </button>
              <span className="min-w-[1.25rem] text-center font-mono text-xs font-bold tabular-nums text-primary">
                {quantity}
              </span>
              <button
                onClick={onAdd}
                disabled={locked || !item.available}
                className="flex size-8 items-center justify-center rounded-full text-primary transition-[colors,scale] duration-150 hover:bg-primary/10 active:scale-[0.96] disabled:pointer-events-none"
              >
                <Plus className="size-3" />
              </button>
            </div>
          ) : (
            <Button
              onClick={onAdd}
              disabled={locked || !item.available}
              variant="outline"
              size="sm"
              className="h-8 rounded-full px-3 text-xs"
            >
              <Plus className="size-3" data-icon="inline-start" />
              Add
            </Button>
          )}
        </div>
      </div>
    </article>
  )
}

function CartSidebar({
  draft,
  error,
  locked,
  menu,
  notice,
  participantName,
  pending,
  onNameChange,
  onQuantityChange,
  onSubmit,
}: {
  draft: DraftCart
  error: string | null
  locked: boolean
  menu: MenuItem[]
  notice: string | null
  participantName: string
  pending: boolean
  onNameChange: (name: string) => void
  onQuantityChange: (menuItemId: string, delta: number) => void
  onSubmit: () => void
}) {
  const lines = Object.entries(draft).flatMap(([id, quantity]) => {
    const item = menu.find((c) => c.id === id)
    return item && quantity > 0 ? [{ item, quantity }] : []
  })
  const total = lines.reduce((sum, l) => sum + l.item.price * l.quantity, 0)
  const surcharge = lines.length ? 15 : 0
  const itemCount = lines.reduce((sum, l) => sum + l.quantity, 0)

  return (
    <aside className="hidden w-72 shrink-0 flex-col border-l border-border lg:flex">
      <div className="border-b border-border px-5 py-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Your cart</h3>
          {itemCount > 0 ? (
            <span className="flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold tabular-nums text-primary-foreground">
              {itemCount}
            </span>
          ) : null}
        </div>
        <div className="mt-3">
          <label className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
            Your name
          </label>
          <input
            value={participantName}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="Enter your name"
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none ring-primary/30 transition-shadow placeholder:text-muted-foreground focus:ring-2"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {lines.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <div className="flex size-10 items-center justify-center rounded-xl bg-muted">
              <Utensils className="size-4 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">Nothing here yet.</p>
            <p className="text-xs text-muted-foreground">
              Add items from the menu.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {lines.map(({ item, quantity }) => (
              <div key={item.id} className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium leading-5">
                    {item.name}
                  </p>
                  <p className="font-mono text-xs tabular-nums text-muted-foreground">
                    ₹{item.price} × {quantity}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <div className="flex h-7 items-center rounded-full border border-border">
                    <button
                      onClick={() => onQuantityChange(item.id, -1)}
                      className="flex size-7 items-center justify-center rounded-full text-muted-foreground transition-[colors,scale] duration-150 hover:bg-muted active:scale-[0.96]"
                    >
                      <Minus className="size-2.5" />
                    </button>
                    <span className="min-w-[1.1rem] text-center font-mono text-xs font-medium tabular-nums">
                      {quantity}
                    </span>
                    <button
                      onClick={() => onQuantityChange(item.id, 1)}
                      disabled={locked}
                      className="flex size-7 items-center justify-center rounded-full text-muted-foreground transition-[colors,scale] duration-150 hover:bg-muted active:scale-[0.96] disabled:pointer-events-none"
                    >
                      <Plus className="size-2.5" />
                    </button>
                  </div>
                  <button
                    onClick={() => onQuantityChange(item.id, -quantity)}
                    className="flex size-7 items-center justify-center rounded-full text-muted-foreground transition-[colors,scale] duration-150 hover:bg-destructive/10 hover:text-destructive active:scale-[0.96]"
                  >
                    <Trash2 className="size-2.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-border px-5 py-4">
        <ErrorAlert message={error} className="mb-3" />
        <NoticeAlert message={notice} className="mb-3" />
        <div className="mb-4 flex flex-col gap-1.5">
          <SummaryRow label="Items" value={`₹${total}`} />
          <SummaryRow label="Surcharge" value={`₹${surcharge}`} />
          <Separator className="my-1" />
          <div className="flex justify-between text-sm font-semibold">
            <span>Total</span>
            <span className="font-mono tabular-nums">₹{total + surcharge}</span>
          </div>
        </div>
        <Button
          onClick={onSubmit}
          disabled={locked || pending || lines.length === 0}
          className="h-10 w-full rounded-xl text-sm font-semibold"
        >
          {pending ? (
            <Loader2 className="animate-spin" data-icon="inline-start" />
          ) : null}
          Submit to group
          <Send className="size-3.5" data-icon="inline-end" />
        </Button>
      </div>
    </aside>
  )
}

function MobileCartBar({
  draft,
  error,
  locked,
  menu,
  notice,
  pending,
  onSubmit,
}: {
  draft: DraftCart
  error: string | null
  locked: boolean
  menu: MenuItem[]
  notice: string | null
  pending: boolean
  onSubmit: () => void
}) {
  const lines = Object.entries(draft).flatMap(([id, quantity]) => {
    const item = menu.find((c) => c.id === id)
    return item && quantity > 0 ? [{ item, quantity }] : []
  })
  const total = lines.reduce((sum, l) => sum + l.item.price * l.quantity, 0)
  const itemCount = lines.reduce((sum, l) => sum + l.quantity, 0)

  if (itemCount === 0 && !error && !notice) return null

  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/95 px-4 py-3 backdrop-blur-sm lg:hidden">
      <ErrorAlert message={error} className="mb-2" />
      <NoticeAlert message={notice} className="mb-2" />
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold leading-4 tabular-nums">
            {itemCount} {itemCount === 1 ? 'item' : 'items'}
          </p>
          <p className="font-mono text-sm font-bold tabular-nums leading-5">
            ₹{total + (lines.length ? 15 : 0)}
          </p>
        </div>
        <Button
          onClick={onSubmit}
          disabled={locked || pending || lines.length === 0}
          className="h-10 rounded-xl px-5 text-sm font-semibold"
        >
          {pending ? (
            <Loader2 className="animate-spin" data-icon="inline-start" />
          ) : null}
          Submit
          <Send className="size-3.5" data-icon="inline-end" />
        </Button>
      </div>
    </div>
  )
}

function NoticeAlert({
  message,
  className,
}: {
  message: string | null
  className?: string
}) {
  if (!message) return null
  return (
    <Alert className={className}>
      <CheckCircle2 />
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  )
}
