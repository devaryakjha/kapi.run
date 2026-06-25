import { useEffect, useMemo, useReducer, useState } from 'react'
import type {
  CartCustomization,
  KapiSession,
  MenuAddonGroup,
  MenuCustomization,
  MenuItem,
  MenuVariantGroup,
} from '@kapi/spec'
import {
  AlertTriangle,
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
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

import type { DraftCart, DraftCartLine } from './shared'
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
  organizerReviewPath,
  participantName,
  pending,
  session,
  stale,
  submittedDraft,
  onAddCustomItem,
  onAddPlainItem,
  onLoadCustomization,
  onNameChange,
  onQuantityChange,
  onSubmittedQuantityChange,
  onSubmit,
}: {
  draft: DraftCart
  error: string | null
  menu: MenuItem[]
  notice: string | null
  organizerReviewPath: string | null
  participantName: string
  pending: boolean
  session: KapiSession
  stale: boolean
  submittedDraft: DraftCart
  onAddCustomItem: (line: Omit<DraftCartLine, 'id'>) => void
  onAddPlainItem: (menuItemId: string) => void
  onLoadCustomization: (item: MenuItem) => Promise<MenuCustomization>
  onNameChange: (name: string) => void
  onQuantityChange: (lineId: string, delta: number) => void
  onSubmittedQuantityChange: (lineId: string, delta: number) => void
  onSubmit: () => void
}) {
  const [query, setQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState('All')
  const [customizing, setCustomizing] = useState<MenuItem | null>(null)
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

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
  const draftItemIndex = useMemo(() => indexDraftItems(draft), [draft])

  const locked = isSessionLockedForParticipants(session, now)
  const remainingTime = formatRemainingTime(session, now)

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
          {organizerReviewPath ? (
            <div className="hidden items-center rounded-lg border border-border p-0.5 sm:flex">
              <span className="rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground">
                Menu
              </span>
              <Button
                onClick={() => {
                  window.location.href = organizerReviewPath
                }}
                variant="ghost"
                size="sm"
                className="h-7 rounded-md px-2.5 text-xs"
              >
                Review
              </Button>
            </div>
          ) : null}
          <TimerPill remainingTime={remainingTime} locked={locked} />
          {organizerReviewPath ? (
            <Button
              onClick={() => {
                window.location.href = organizerReviewPath
              }}
              variant="outline"
              size="sm"
              className="h-9 rounded-lg px-2.5 text-xs transition-[colors,scale] active:scale-[0.96] sm:hidden"
            >
              Review
            </Button>
          ) : null}
          <Avatar className="size-8">
            <AvatarFallback className="text-xs font-semibold">
              {participantName.slice(0, 1).toUpperCase() || 'A'}
            </AvatarFallback>
          </Avatar>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <section className="flex-1 overflow-y-auto">
          <div className="sticky top-0 z-5 border-b border-border bg-background/95 px-4 pb-3 pt-3 backdrop-blur-sm md:px-6">
            <div className="mx-auto max-w-3xl">
              <div className="relative">
                <label htmlFor="menu-search" className="sr-only">
                  Search menu
                </label>
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  id="menu-search"
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
                    type="button"
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
              {stale ? (
                <Alert className="mb-4">
                  <AlertTriangle />
                  <AlertDescription>
                    Showing a saved copy. Refresh before changing this order.
                  </AlertDescription>
                </Alert>
              ) : null}

              <div className="mb-4 md:hidden">
                <Field className="gap-1.5">
                  <FieldLabel
                    htmlFor="participant-name"
                    className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground"
                  >
                    Your name
                  </FieldLabel>
                  <Input
                    id="participant-name"
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
                  {filtered.map((item, index) => (
                    <MenuCard
                      key={`${item.id}:${index}`}
                      item={item}
                      quantity={draftItemIndex.get(item.id)?.quantity ?? 0}
                      locked={locked}
                      onAdd={() =>
                        item.hasVariants || item.hasAddons
                          ? setCustomizing(item)
                          : onAddPlainItem(item.id)
                      }
                      onRemove={() => {
                        const lineId = draftItemIndex.get(item.id)?.firstLineId
                        if (lineId) onQuantityChange(lineId, -1)
                      }}
                      onView={() => setCustomizing(item)}
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
          onSubmittedQuantityChange={onSubmittedQuantityChange}
          onSubmit={onSubmit}
          submittedDraft={submittedDraft}
        />
      </div>

      <MobileCartBar
        draft={draft}
        error={error}
        locked={locked}
        menu={menu}
        notice={notice}
        pending={pending}
        submittedDraft={submittedDraft}
        onSubmit={onSubmit}
      />

      {customizing ? (
        <ItemDetailDialog
          item={customizing}
          locked={locked}
          onAddCustomItem={onAddCustomItem}
          onAddPlainItem={onAddPlainItem}
          onClose={() => setCustomizing(null)}
          onLoadCustomization={onLoadCustomization}
        />
      ) : null}
    </main>
  )
}

function indexDraftItems(draft: DraftCart) {
  const index = new Map<string, { quantity: number; firstLineId: string }>()
  for (const line of Object.values(draft)) {
    const current = index.get(line.menuItemId)
    index.set(line.menuItemId, {
      quantity: (current?.quantity ?? 0) + line.quantity,
      firstLineId: current?.firstLineId ?? line.id,
    })
  }
  return index
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
      <span className="font-mono text-xs font-semibold tabular-nums">
        {remainingTime}
      </span>
    </div>
  )
}

function MenuCard({
  item,
  quantity,
  locked,
  onAdd,
  onRemove,
  onView,
}: {
  item: MenuItem
  quantity: number
  locked: boolean
  onAdd: () => void
  onRemove: () => void
  onView: () => void
}) {
  return (
    <article
      className={cn(
        'flex gap-3 rounded-4xl border border-border bg-background p-3 transition-colors',
        !item.available && 'opacity-50',
        quantity > 0 && 'border-primary/30 bg-primary/2',
      )}
    >
      <button
        type="button"
        onClick={onView}
        className="relative size-18 shrink-0 overflow-hidden rounded-lg bg-muted text-left transition-opacity duration-150 active:opacity-75"
      >
        {item.imageUrl ? (
          <img
            src={item.imageUrl}
            alt={item.name}
            className="h-full w-full object-cover outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10"
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
      </button>

      <div className="mt-0 flex min-w-0 flex-1 flex-col justify-between">
        <div>
          <button
            type="button"
            onClick={onView}
            className="block text-left text-sm font-semibold leading-tight transition-colors duration-150 hover:text-primary"
          >
            {item.name}
          </button>
          {item.description ? (
            <p className="mt-0.5 line-clamp-2 text-[12px] leading-[1.4] text-muted-foreground">
              {item.description}
            </p>
          ) : null}
        </div>
        <div className="mt-2 flex items-center justify-between">
          <span className="font-mono text-sm font-bold tabular-nums">
            ₹{item.price}
          </span>
          {quantity > 0 ? (
            <div className="flex h-8 items-center rounded-full border border-primary/40 bg-primary/5">
              <button
                type="button"
                aria-label={`Remove ${item.name}`}
                onClick={onRemove}
                disabled={locked}
                className="flex size-8 items-center justify-center rounded-full text-primary transition-[colors,scale] duration-150 hover:bg-primary/10 active:scale-[0.96] disabled:pointer-events-none"
              >
                <Minus className="size-3" />
              </button>
              <span className="min-w-5 text-center font-mono text-xs font-bold tabular-nums text-primary">
                {quantity}
              </span>
              <button
                type="button"
                aria-label={`Add ${item.name}`}
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
              {item.hasVariants || item.hasAddons ? 'Customize' : 'Add'}
            </Button>
          )}
        </div>
        {item.hasVariants || item.hasAddons ? (
          <button
            type="button"
            onClick={onView}
            className="mt-1 w-fit text-[11px] font-medium text-primary transition-[scale,opacity] duration-150 hover:opacity-70 active:scale-[0.96]"
          >
            Customizable
          </button>
        ) : null}
      </div>
    </article>
  )
}

function ItemDetailDialog({
  item,
  locked,
  onAddCustomItem,
  onAddPlainItem,
  onClose,
  onLoadCustomization,
}: {
  item: MenuItem
  locked: boolean
  onAddCustomItem: (line: Omit<DraftCartLine, 'id'>) => void
  onAddPlainItem: (menuItemId: string) => void
  onClose: () => void
  onLoadCustomization: (item: MenuItem) => Promise<MenuCustomization>
}) {
  const customizable = Boolean(item.hasVariants || item.hasAddons)
  const [storedDetailState, dispatchDetail] = useReducer(
    itemDetailReducer,
    item.id,
    initialItemDetailState,
  )
  const detailState =
    storedDetailState.itemId === item.id
      ? storedDetailState
      : initialItemDetailState(item.id)
  const { detail, selectedVariants, selectedAddons, pending, error } =
    detailState

  useEffect(() => {
    let cancelled = false
    onLoadCustomization(item)
      .then((next) => {
        if (cancelled) return
        dispatchDetail({ type: 'loaded', itemId: item.id, detail: next })
      })
      .catch((caught: Error) => {
        if (!cancelled) {
          dispatchDetail({
            type: 'failed',
            itemId: item.id,
            error: caught.message,
          })
        }
      })

    return () => {
      cancelled = true
    }
  }, [item, onLoadCustomization])

  const selected = detail
    ? buildCartCustomization(detail, selectedVariants, selectedAddons)
    : { customization: undefined, summary: '', addonTotal: 0 }
  const total = item.price + selected.addonTotal
  const description = detail?.description || item.description
  const imageUrl = detail?.imageUrl || item.imageUrl
  const rating = detail?.rating || item.rating
  const totalRatings = detail?.totalRatings || item.totalRatings

  function addItem() {
    if (locked || !item.available) return
    if (!customizable) {
      onAddPlainItem(item.id)
      onClose()
      return
    }
    if (!detail) return

    const validationError = validateAddonSelections(
      detail.addons ?? [],
      selectedAddons,
    )
    if (validationError) {
      dispatchDetail({ type: 'setError', error: validationError })
      return
    }

    onAddCustomItem({
      menuItemId: item.id,
      quantity: 1,
      customization: selected.customization,
      customizationSummary: selected.summary,
      unitPrice: total,
    })
    onClose()
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[min(820px,calc(100svh-2rem))] overflow-hidden p-0 sm:max-w-2xl">
        <div className="max-h-[min(820px,calc(100svh-2rem))] overflow-y-auto">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={item.name}
              className="h-64 w-full object-cover outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10"
            />
          ) : (
            <div className="flex h-40 w-full items-center justify-center bg-muted">
              <Utensils className="size-8 text-muted-foreground" />
            </div>
          )}

          <div className="space-y-5 p-5">
            <DialogHeader>
              <DialogTitle className="text-2xl leading-tight">
                {item.name}
              </DialogTitle>
              <DialogDescription className="sr-only">
                Menu item details
              </DialogDescription>
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <span className="font-mono font-semibold tabular-nums text-foreground">
                  ₹{item.price}
                </span>
                {rating ? (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 font-medium tabular-nums text-primary">
                    ★ {formatRating(rating)}
                    {totalRatings ? ` (${totalRatings})` : ''}
                  </span>
                ) : null}
                {item.category ? <span>{item.category}</span> : null}
                {!item.available ? <span>Unavailable</span> : null}
              </div>
            </DialogHeader>

            {description ? (
              <p className="text-sm leading-6 text-muted-foreground">
                {description}
              </p>
            ) : null}

            {customizable ? (
              <div className="space-y-4">
                {pending ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" />
                    Loading options
                  </div>
                ) : null}

                {error ? <ErrorAlert message={error} /> : null}

                {detail?.variantsV2?.map((group) => (
                  <VariantGroupControl
                    key={group.groupId}
                    group={group}
                    value={selectedVariants[group.groupId]}
                    onChange={(variationId) =>
                      dispatchDetail({
                        type: 'selectVariant',
                        groupId: group.groupId,
                        variationId,
                      })
                    }
                  />
                ))}

                {detail?.addons?.map((group) => (
                  <AddonGroupControl
                    key={group.groupId}
                    group={group}
                    value={selectedAddons[group.groupId] ?? []}
                    onChange={(choiceIds) =>
                      dispatchDetail({
                        type: 'selectAddons',
                        groupId: group.groupId,
                        choiceIds,
                      })
                    }
                  />
                ))}
              </div>
            ) : null}

            <div className="sticky bottom-0 -mx-5 -mb-5 border-t border-border bg-background p-5">
              <Button
                onClick={addItem}
                disabled={locked || !item.available || pending}
                className="h-11 w-full rounded-xl text-sm font-semibold tabular-nums"
              >
                {pending ? (
                  <Loader2 className="animate-spin" data-icon="inline-start" />
                ) : (
                  <Plus className="size-4" data-icon="inline-start" />
                )}
                Add item · ₹{total}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

type ItemDetailState = {
  itemId: string
  detail: MenuCustomization | null
  selectedVariants: Record<string, string>
  selectedAddons: Record<string, string[]>
  pending: boolean
  error: string | null
}

type ItemDetailAction =
  | { type: 'loaded'; itemId: string; detail: MenuCustomization }
  | { type: 'failed'; itemId: string; error: string }
  | { type: 'selectVariant'; groupId: string; variationId: string }
  | { type: 'selectAddons'; groupId: string; choiceIds: string[] }
  | { type: 'setError'; error: string | null }

function initialItemDetailState(itemId: string): ItemDetailState {
  return {
    itemId,
    detail: null,
    selectedVariants: {},
    selectedAddons: {},
    pending: true,
    error: null,
  }
}

function itemDetailReducer(
  state: ItemDetailState,
  action: ItemDetailAction,
): ItemDetailState {
  switch (action.type) {
    case 'loaded':
      return {
        itemId: action.itemId,
        detail: action.detail,
        selectedVariants: defaultVariantSelections(
          action.detail.variantsV2 ?? [],
        ),
        selectedAddons: defaultAddonSelections(action.detail.addons ?? []),
        pending: false,
        error: null,
      }
    case 'failed':
      return {
        ...initialItemDetailState(action.itemId),
        pending: false,
        error: action.error,
      }
    case 'selectVariant':
      return {
        ...state,
        selectedVariants: {
          ...state.selectedVariants,
          [action.groupId]: action.variationId,
        },
      }
    case 'selectAddons':
      return {
        ...state,
        selectedAddons: {
          ...state.selectedAddons,
          [action.groupId]: action.choiceIds,
        },
      }
    case 'setError':
      return { ...state, error: action.error }
  }
}

function VariantGroupControl({
  group,
  value,
  onChange,
}: {
  group: MenuVariantGroup
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
        {group.name}
      </p>
      <div className="grid gap-2">
        {group.variations.map((choice) => (
          <label
            key={`${group.groupId}:${choice.id}`}
            className={cn(
              'flex min-h-10 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm transition-[colors,scale] duration-150 active:scale-[0.96]',
              value === choice.id
                ? 'border-primary/40 bg-primary/5'
                : 'border-border hover:border-primary/30 hover:bg-primary/2',
              choice.inStock === false && 'pointer-events-none opacity-40',
            )}
          >
            <input
              type="radio"
              name={`variant-${group.groupId}`}
              value={choice.id}
              checked={value === choice.id}
              onChange={() => onChange(choice.id)}
              disabled={choice.inStock === false}
              className="size-4 accent-primary"
            />
            <span className="min-w-0 flex-1">{choice.name}</span>
            {choice.price ? (
              <span className="font-mono text-xs tabular-nums text-muted-foreground">
                +₹{choice.price}
              </span>
            ) : null}
          </label>
        ))}
      </div>
    </div>
  )
}

function AddonGroupControl({
  group,
  value,
  onChange,
}: {
  group: MenuAddonGroup
  value: string[]
  onChange: (value: string[]) => void
}) {
  const max =
    group.maxAddons && group.maxAddons > 0 ? group.maxAddons : Infinity

  function toggle(choiceId: string) {
    if (value.includes(choiceId)) {
      onChange(value.filter((id) => id !== choiceId))
      return
    }
    if (value.length >= max) return
    onChange([...value, choiceId])
  }

  return (
    <div className="space-y-2">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
          {group.groupName}
        </p>
        {group.minAddons || group.maxAddons ? (
          <p className="text-xs text-muted-foreground">
            {addonRuleText(group)}
          </p>
        ) : null}
      </div>
      <div className="grid gap-2">
        {group.choices.map((choice) => (
          <label
            key={`${group.groupId}:${choice.id}`}
            className={cn(
              'flex min-h-10 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm transition-[colors,scale] duration-150 active:scale-[0.96]',
              value.includes(choice.id)
                ? 'border-primary/40 bg-primary/5'
                : 'border-border hover:border-primary/30 hover:bg-primary/2',
            )}
          >
            <input
              type="checkbox"
              checked={value.includes(choice.id)}
              onChange={() => toggle(choice.id)}
              className="size-4 accent-primary"
            />
            <span className="min-w-0 flex-1">{choice.name}</span>
            <span className="font-mono text-xs tabular-nums text-muted-foreground">
              {choice.price ? `₹${choice.price}` : 'Free'}
            </span>
          </label>
        ))}
      </div>
    </div>
  )
}

function defaultVariantSelections(groups: MenuVariantGroup[]) {
  return Object.fromEntries(
    groups.map((group) => {
      const selected =
        group.variations.find(
          (choice) => choice.default && choice.inStock !== false,
        ) ??
        group.variations.find((choice) => choice.inStock !== false) ??
        group.variations[0]
      return [group.groupId, selected.id]
    }),
  )
}

function defaultAddonSelections(groups: MenuAddonGroup[]) {
  return Object.fromEntries(
    groups.map((group) => [
      group.groupId,
      group.choices
        .slice(0, Math.max(group.minAddons ?? 0, 0))
        .map((c) => c.id),
    ]),
  )
}

function buildCartCustomization(
  detail: MenuCustomization,
  selectedVariants: Record<string, string>,
  selectedAddons: Record<string, string[]>,
) {
  const variants =
    detail.variantsV2?.flatMap((group) => {
      const selected = group.variations.find(
        (choice) => choice.id === selectedVariants[group.groupId],
      )
      return selected
        ? [
            {
              group_id: group.groupId,
              variation_id: selected.id,
              groupName: group.name,
              name: selected.name,
              price: selected.price,
            },
          ]
        : []
    }) ?? []

  const addons =
    detail.addons?.flatMap((group) =>
      (selectedAddons[group.groupId] ?? []).flatMap((choiceId) => {
        const selected = group.choices.find((choice) => choice.id === choiceId)
        return selected
          ? [
              {
                group_id: group.groupId,
                choice_id: selected.id,
                groupName: group.groupName,
                name: selected.name,
                price: selected.price,
              },
            ]
          : []
      }),
    ) ?? []

  const summary = [...variants, ...addons]
    .map((selection) => `${selection.groupName}: ${selection.name}`)
    .join(', ')

  return {
    customization: {
      ...(variants.length ? { variantsV2: variants } : {}),
      ...(addons.length ? { addons } : {}),
    } satisfies CartCustomization,
    summary,
    addonTotal: addons.reduce((sum, addon) => sum + addon.price, 0),
  }
}

function validateAddonSelections(
  groups: MenuAddonGroup[],
  selectedAddons: Record<string, string[]>,
) {
  for (const group of groups) {
    const count = (selectedAddons[group.groupId] ?? []).length
    if (count < (group.minAddons ?? 0)) {
      return `Choose at least ${group.minAddons} from ${group.groupName}.`
    }
    if (group.maxAddons && group.maxAddons > 0 && count > group.maxAddons) {
      return `Choose at most ${group.maxAddons} from ${group.groupName}.`
    }
  }
  return null
}

function addonRuleText(group: MenuAddonGroup) {
  if (group.minAddons && group.maxAddons) {
    return `Choose ${group.minAddons}-${group.maxAddons}`
  }
  if (group.minAddons) return `Choose at least ${group.minAddons}`
  if (group.maxAddons) return `Choose up to ${group.maxAddons}`
  return ''
}

function formatRating(value: string) {
  const rating = Number(value)
  return Number.isFinite(rating) ? rating.toFixed(1) : value
}

function CartSidebar({
  draft,
  error,
  locked,
  menu,
  notice,
  participantName,
  pending,
  submittedDraft,
  onNameChange,
  onQuantityChange,
  onSubmittedQuantityChange,
  onSubmit,
}: {
  draft: DraftCart
  error: string | null
  locked: boolean
  menu: MenuItem[]
  notice: string | null
  participantName: string
  pending: boolean
  submittedDraft: DraftCart
  onNameChange: (name: string) => void
  onQuantityChange: (menuItemId: string, delta: number) => void
  onSubmittedQuantityChange: (lineId: string, delta: number) => void
  onSubmit: () => void
}) {
  const lines = draftLinesWithItems(draft, menu)
  const submittedLines = draftLinesWithItems(submittedDraft, menu)
  const total = lines.reduce(
    (sum, l) => sum + (l.line.unitPrice ?? l.item.price) * l.line.quantity,
    0,
  )
  const itemCount = lines.reduce((sum, l) => sum + l.line.quantity, 0)
  const submittedItemCount = submittedLines.reduce(
    (sum, l) => sum + l.line.quantity,
    0,
  )
  const hasSubmitted = submittedItemCount > 0

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
          <label
            htmlFor="cart-participant-name"
            className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground"
          >
            Your name
          </label>
          <input
            id="cart-participant-name"
            value={participantName}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="Enter your name"
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none ring-primary/30 transition-shadow placeholder:text-muted-foreground focus:ring-2"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {submittedLines.length ? (
          <div className="mb-5">
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
              Submitted items
            </h4>
            <CartLineList
              lines={submittedLines}
              locked={locked}
              onQuantityChange={onSubmittedQuantityChange}
            />
          </div>
        ) : null}

        {lines.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <div className="flex size-10 items-center justify-center rounded-xl bg-muted">
              <Utensils className="size-4 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">Nothing here yet.</p>
            <p className="text-xs text-muted-foreground">
              Add items from the menu to your draft.
            </p>
          </div>
        ) : (
          <>
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
              Your draft
            </h4>
            <CartLineList
              lines={lines}
              locked={locked}
              onQuantityChange={onQuantityChange}
            />
          </>
        )}
      </div>

      <div className="border-t border-border px-5 py-4">
        <ErrorAlert message={error} className="mb-3" />
        <NoticeAlert message={notice} className="mb-3" />
        <div className="mb-4 flex flex-col gap-1.5">
          <SummaryRow label="Items" value={`₹${total}`} />
          <Separator className="my-1" />
          <div className="flex justify-between text-sm font-semibold">
            <span>Draft subtotal</span>
            <span className="font-mono tabular-nums">₹{total}</span>
          </div>
        </div>
        <Button
          onClick={onSubmit}
          disabled={locked || pending || (!lines.length && !hasSubmitted)}
          className="h-10 w-full rounded-xl text-sm font-semibold"
        >
          {pending ? (
            <Loader2 className="animate-spin" data-icon="inline-start" />
          ) : null}
          {hasSubmitted ? 'Update my items' : 'Submit items'}
          <Send className="size-3.5" data-icon="inline-end" />
        </Button>
      </div>
    </aside>
  )
}

function draftLinesWithItems(draft: DraftCart, menu: MenuItem[]) {
  const menuById = new Map(menu.map((item) => [item.id, item]))
  return Object.values(draft).flatMap((line) => {
    const item = menuById.get(line.menuItemId)
    return item && line.quantity > 0 ? [{ item, line }] : []
  })
}

function CartLineList({
  lines,
  locked,
  onQuantityChange,
}: {
  lines: Array<{ item: MenuItem; line: DraftCartLine }>
  locked: boolean
  onQuantityChange: (lineId: string, delta: number) => void
}) {
  return (
    <div className="flex flex-col gap-3">
      {lines.map(({ item, line }) => (
        <div key={line.id} className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium leading-5">{item.name}</p>
            <p className="font-mono text-xs tabular-nums text-muted-foreground">
              ₹{line.unitPrice ?? item.price} × {line.quantity}
            </p>
            {line.customizationSummary ? (
              <p className="text-[11px] leading-4 text-muted-foreground">
                {line.customizationSummary}
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-1">
            <div className="flex h-7 items-center rounded-full border border-border">
              <button
                type="button"
                aria-label={`Decrease ${item.name}`}
                onClick={() => onQuantityChange(line.id, -1)}
                disabled={locked}
                className="flex size-7 items-center justify-center rounded-full text-muted-foreground transition-[colors,scale] duration-150 hover:bg-muted active:scale-[0.96] disabled:pointer-events-none"
              >
                <Minus className="size-2.5" />
              </button>
              <span className="min-w-[1.1rem] text-center font-mono text-xs font-medium tabular-nums">
                {line.quantity}
              </span>
              <button
                type="button"
                aria-label={`Increase ${item.name}`}
                onClick={() => onQuantityChange(line.id, 1)}
                disabled={locked}
                className="flex size-7 items-center justify-center rounded-full text-muted-foreground transition-[colors,scale] duration-150 hover:bg-muted active:scale-[0.96] disabled:pointer-events-none"
              >
                <Plus className="size-2.5" />
              </button>
            </div>
            <button
              type="button"
              aria-label={`Remove ${item.name}`}
              onClick={() => onQuantityChange(line.id, -line.quantity)}
              disabled={locked}
              className="flex size-7 items-center justify-center rounded-full text-muted-foreground transition-[colors,scale] duration-150 hover:bg-destructive/10 hover:text-destructive active:scale-[0.96] disabled:pointer-events-none"
            >
              <Trash2 className="size-2.5" />
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

function MobileCartBar({
  draft,
  error,
  locked,
  menu,
  notice,
  pending,
  submittedDraft,
  onSubmit,
}: {
  draft: DraftCart
  error: string | null
  locked: boolean
  menu: MenuItem[]
  notice: string | null
  pending: boolean
  submittedDraft: DraftCart
  onSubmit: () => void
}) {
  const lines = draftLinesWithItems(draft, menu)
  const submittedLines = draftLinesWithItems(submittedDraft, menu)
  const total = lines.reduce(
    (sum, l) => sum + (l.line.unitPrice ?? l.item.price) * l.line.quantity,
    0,
  )
  const itemCount = lines.reduce((sum, l) => sum + l.line.quantity, 0)
  const submittedItemCount = submittedLines.reduce(
    (sum, l) => sum + l.line.quantity,
    0,
  )
  const hasSubmitted = submittedItemCount > 0

  if (itemCount === 0 && !hasSubmitted && !error && !notice) return null

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
            ₹{total}
          </p>
          {hasSubmitted ? (
            <p className="text-[11px] tabular-nums leading-4 text-muted-foreground">
              {submittedItemCount} submitted
            </p>
          ) : null}
        </div>
        <Button
          onClick={onSubmit}
          disabled={locked || pending || (!lines.length && !hasSubmitted)}
          className="h-10 rounded-xl px-5 text-sm font-semibold"
        >
          {pending ? (
            <Loader2 className="animate-spin" data-icon="inline-start" />
          ) : null}
          {hasSubmitted ? 'Update' : 'Submit'}
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
