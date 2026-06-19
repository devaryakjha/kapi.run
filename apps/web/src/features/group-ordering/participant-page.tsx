import { useMemo, useState } from 'react'
import type { KapiSession, MenuItem } from '@kapi/spec'
import {
  Bell,
  Clock,
  Filter,
  Loader2,
  Minus,
  Plus,
  Search,
  Send,
  Trash2,
} from 'lucide-react'

import { Avatar, AvatarFallback } from '#/components/ui/avatar'
import { Badge } from '#/components/ui/badge'
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
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '#/components/ui/input-group'
import { Separator } from '#/components/ui/separator'
import { ToggleGroup, ToggleGroupItem } from '#/components/ui/toggle-group'

import type { DraftCart } from './shared'
import { ErrorAlert, SummaryRow } from './shared'

export function ParticipantMenuPage({
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
    return menu.filter(
      (item) =>
        !normalized ||
        item.name.toLowerCase().includes(normalized) ||
        item.category.toLowerCase().includes(normalized),
    )
  }, [menu, query])
  const categories = useMemo(
    () => [
      'All',
      ...[
        ...new Set(
          menu.flatMap((item) => (item.category ? [item.category] : [])),
        ),
      ].slice(0, 3),
    ],
    [menu],
  )

  const tileItems = filtered.slice(1, 5)
  const listItems = filtered.slice(5)

  return (
    <main className="flex min-h-svh flex-col bg-background text-foreground">
      <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-border bg-(--kapi-subtle) px-4 md:px-8">
        <div className="flex min-w-0 items-center gap-4">
          <span className="font-heading text-2xl font-extrabold text-primary">
            Kapi.run
          </span>
          <Separator orientation="vertical" className="hidden h-6 md:block" />
          <div className="hidden flex-col md:flex">
            <span className="text-base font-semibold leading-6 text-primary">
              {session.restaurant.name}
            </span>
            <label className="text-[11px] font-medium tracking-[0.03em] text-muted-foreground">
              Participant:{' '}
              <input
                className="bg-transparent outline-none"
                value={participantName}
                onChange={(event) => onNameChange(event.target.value)}
              />
            </label>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden flex-col items-end md:flex">
            <span className="text-xs font-bold leading-4">
              {session.cutoffTime} cutoff
            </span>
            <span className="text-[11px] font-medium leading-3.5 text-destructive">
              18m remaining
            </span>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted px-4 py-2">
            <Clock className="text-[#ff9f1c]" />
            <span className="font-mono text-[13px] font-bold leading-5">
              17:42
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            className="rounded-full text-muted-foreground"
          >
            <Bell />
          </Button>
          <Avatar>
            <AvatarFallback>
              {participantName.slice(0, 1) || 'A'}
            </AvatarFallback>
          </Avatar>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <section className="flex-1 overflow-y-auto p-4 pb-28 md:p-8 lg:pb-8">
          <div className="mx-auto flex max-w-4xl flex-col gap-6">
            <div className="md:hidden">
              <Field className="gap-1">
                <FieldLabel className="text-[11px] font-medium tracking-[0.03em] text-muted-foreground">
                  Participant
                </FieldLabel>
                <Input
                  value={participantName}
                  onChange={(event) => onNameChange(event.target.value)}
                  className="h-10 rounded-lg border-border bg-background text-sm"
                />
              </Field>
            </div>
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-4">
                <InputGroup className="flex-1">
                  <InputGroupInput
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={`Search ${session.restaurant.name} menu...`}
                  />
                  <InputGroupAddon>
                    <Search />
                  </InputGroupAddon>
                </InputGroup>
                <Button variant="outline">
                  <Filter data-icon="inline-start" /> Filters
                </Button>
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
              {filtered.slice(0, 1).map((item) => (
                <FeaturedItem
                  key={item.id}
                  item={item}
                  onAdd={() => onQuantityChange(item.id, 1)}
                />
              ))}
              {tileItems.map((item) => (
                <MenuTile
                  key={item.id}
                  item={item}
                  onAdd={() => onQuantityChange(item.id, 1)}
                />
              ))}
              <MenuList
                items={listItems}
                onAdd={(item) => onQuantityChange(item.id, 1)}
              />
              {!filtered.length ? (
                <Empty className="col-span-12 border">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <Search />
                    </EmptyMedia>
                    <EmptyTitle>No menu items found</EmptyTitle>
                    <EmptyDescription>
                      Try another restaurant item or category.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : null}
            </section>
          </div>
        </section>
        <CartSidebar
          draft={draft}
          error={error}
          menu={menu}
          pending={pending}
          onQuantityChange={onQuantityChange}
          onSubmit={onSubmit}
        />
      </div>
      <MobileCartBar
        draft={draft}
        error={error}
        menu={menu}
        pending={pending}
        onSubmit={onSubmit}
      />
    </main>
  )
}

function FeaturedItem({ item, onAdd }: { item: MenuItem; onAdd: () => void }) {
  return (
    <article className="col-span-12 overflow-hidden border border-border">
      <div className="flex flex-col md:flex-row">
        <div className="relative h-48 w-full shrink-0 overflow-hidden bg-muted md:h-auto md:w-48">
          {item.imageUrl ? (
            <img
              src={item.imageUrl}
              alt={item.name}
              className="h-full w-full object-cover"
            />
          ) : null}
          {item.tags?.[0] ? (
            <Badge className="absolute left-2 top-2 rounded bg-red-600 text-[10px] font-bold uppercase text-white">
              {item.tags[0]}
            </Badge>
          ) : null}
        </div>
        <div className="flex flex-1 flex-col justify-between p-6">
          <div>
            <div className="mb-1 flex items-start justify-between gap-4">
              <h2 className="text-xl font-semibold leading-7">{item.name}</h2>
              <span className="font-mono text-[13px] font-bold text-primary">
                ₹{item.price}
              </span>
            </div>
            <p className="max-w-lg text-[13px] leading-4.5 text-muted-foreground">
              {item.description}
            </p>
          </div>
          <div className="mt-6 flex items-center justify-between gap-4">
            <div className="flex gap-1">
              {item.tags?.slice(1).map((tag) => (
                <Badge
                  key={tag}
                  variant="secondary"
                  className="rounded bg-(--kapi-subtle) text-muted-foreground"
                >
                  {tag}
                </Badge>
              ))}
            </div>
            <Button
              onClick={onAdd}
              disabled={!item.available}
              className="rounded px-10"
            >
              <Plus data-icon="inline-start" /> Add to Cart
            </Button>
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
          {item.imageUrl ? (
            <img
              src={item.imageUrl}
              alt={item.name}
              className="h-full w-full object-cover"
            />
          ) : null}
          {item.tags?.includes('Veg') ? (
            <Badge className="absolute left-1 top-1 rounded bg-green-600 px-1.5 py-0 text-[8px] uppercase text-white">
              Veg
            </Badge>
          ) : null}
        </div>
        <div className="flex flex-1 flex-col justify-between">
          <div>
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-base font-semibold leading-6">{item.name}</h3>
              <span className="font-mono text-[13px] text-muted-foreground">
                ₹{item.price}
              </span>
            </div>
            <p className="mt-1 text-[13px] leading-4.5 text-muted-foreground">
              {item.description}
            </p>
          </div>
          <div className="mt-2 flex justify-end">
            <Button
              onClick={onAdd}
              disabled={!item.available}
              variant="outline"
              size="icon-sm"
              className="rounded-full text-primary"
            >
              <Plus />
            </Button>
          </div>
        </div>
      </div>
    </article>
  )
}

function MenuList({
  items,
  onAdd,
}: {
  items: MenuItem[]
  onAdd: (item: MenuItem) => void
}) {
  if (!items.length) return null
  return (
    <section className="col-span-12 border border-border">
      <header className="flex items-center justify-between border-b border-border px-4 py-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          More Items
        </h2>
        <span className="text-[11px] font-medium text-muted-foreground">
          {items.length} items available
        </span>
      </header>
      <div className="divide-y divide-border">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex cursor-pointer items-center justify-between gap-4 p-4 transition-colors hover:bg-(--kapi-subtle)"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-4">
                <span className="text-sm font-semibold">{item.name}</span>
                {item.tags?.includes('Veg') ? (
                  <Badge
                    variant="outline"
                    className="rounded border-green-200 bg-green-50 text-[10px] text-green-700"
                  >
                    Veg
                  </Badge>
                ) : null}
                {!item.available ? (
                  <Badge variant="destructive" className="rounded text-[10px]">
                    Unavailable
                  </Badge>
                ) : null}
              </div>
              <p className="truncate text-[13px] leading-4.5 text-muted-foreground">
                {item.description}
              </p>
            </div>
            <div className="flex items-center gap-8">
              <span className="font-mono text-[13px]">₹{item.price}</span>
              <Button
                onClick={() => onAdd(item)}
                disabled={!item.available}
                variant="outline"
                size="sm"
                className="rounded"
              >
                Add
              </Button>
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
  const total = lines.reduce(
    (sum, line) => sum + line.item.price * line.quantity,
    0,
  )
  const surcharge = lines.length ? 15 : 0

  return (
    <aside className="hidden h-[calc(100vh-4rem)] w-80 shrink-0 flex-col border-l border-border bg-(--kapi-subtle) lg:flex">
      <div className="border-b border-border bg-background/80 p-6 backdrop-blur-sm">
        <h3 className="flex items-center justify-between text-base font-semibold leading-6">
          Your Draft Cart
          <Badge className="rounded bg-primary/10 font-mono text-xs text-primary">
            {lines.length} Items
          </Badge>
        </h3>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        <div className="flex flex-col gap-4">
          {lines.map(({ item, quantity }) => (
            <div
              key={item.id}
              className="border-b border-border pb-4 last:border-b-0"
            >
              <div className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                  <h4 className="text-xs font-semibold leading-4">
                    {item.name}
                  </h4>
                  <span className="font-mono text-[13px] text-muted-foreground">
                    ₹{item.price}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex h-7 items-center overflow-hidden rounded border border-border">
                    <Button
                      onClick={() => onQuantityChange(item.id, -1)}
                      variant="ghost"
                      size="icon-xs"
                      className="rounded-none text-muted-foreground"
                    >
                      <Minus />
                    </Button>
                    <span className="px-2 font-mono text-[13px]">
                      {quantity}
                    </span>
                    <Button
                      onClick={() => onQuantityChange(item.id, 1)}
                      variant="ghost"
                      size="icon-xs"
                      className="rounded-none text-muted-foreground"
                    >
                      <Plus />
                    </Button>
                  </div>
                  <Button
                    onClick={() => onQuantityChange(item.id, -quantity)}
                    variant="ghost"
                    size="icon-xs"
                    className="rounded text-destructive"
                  >
                    <Trash2 />
                  </Button>
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
            <span>Your Total</span>
            <span className="font-mono">₹{total + surcharge}.00</span>
          </div>
        </div>
        <Button
          onClick={onSubmit}
          disabled={pending}
          className="h-12 w-full rounded-lg text-base font-semibold"
        >
          {pending ? (
            <Loader2 className="animate-spin" data-icon="inline-start" />
          ) : null}
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
  const total = lines.reduce(
    (sum, line) => sum + line.item.price * line.quantity,
    0,
  )
  const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0)

  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/95 p-3 shadow-[0_-8px_24px_rgba(0,0,0,0.08)] backdrop-blur lg:hidden">
      <ErrorAlert message={error} className="mb-2" />
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold leading-4">{itemCount} items</p>
          <p className="font-mono text-sm font-bold leading-5">
            ₹{total + (lines.length ? 15 : 0)}.00
          </p>
        </div>
        <Button
          onClick={onSubmit}
          disabled={pending}
          className="h-11 rounded-lg px-4 text-sm font-semibold"
        >
          {pending ? (
            <Loader2 className="animate-spin" data-icon="inline-start" />
          ) : null}
          Submit
          <Send data-icon="inline-end" />
        </Button>
      </div>
    </div>
  )
}
