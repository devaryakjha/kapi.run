import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { useRouter } from '@tanstack/react-router'
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
  ClipboardList,
  Loader2,
  Minus,
  Plus,
  Search,
  Send,
  ShoppingCart,
  Trash2,
  Utensils,
  X,
} from 'lucide-react'

import { AppHeader } from '#/components/app-header'
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
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '#/components/ui/drawer'
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
import { useIsMobile } from '#/hooks/use-mobile'
import { cn } from '#/lib/utils'

import type { DraftCart, DraftCartLine } from './shared'
import { AccountMenu } from './account-menu'
import { ErrorAlert } from './error-alert'
import { isSessionLockedForParticipants } from './shared'
import { SummaryRow } from './summary-row'
import { TimerPill } from './timer-pill'

export function ParticipantMenuPage({
  draft,
  error,
  menu,
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
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState('All')
  const [customizing, setCustomizing] = useState<MenuItem | null>(null)
  const [cartOpen, setCartOpen] = useState(false)
  const [cartPulse, setCartPulse] = useState(0)
  const [now, setNow] = useState(() => new Date())
  const previousCartCount = useRef(0)
  const isMobile = useIsMobile()

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!organizerReviewPath) return
    void router.preloadRoute({ to: '/review' }).catch(() => undefined)
  }, [organizerReviewPath, router])

  const categories = useMemo(
    () => [
      'All',
      ...new Set(
        menu.flatMap((item) => (item.category ? [item.category] : [])),
      ),
    ],
    [menu],
  )
  const visibleMenu = useMemo(
    () => [...new Map(menu.map((item) => [item.id, item])).values()],
    [menu],
  )

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return visibleMenu.filter((item) => {
      const matchesCategory =
        activeCategory === 'All' || item.category === activeCategory
      const matchesQuery =
        !normalized ||
        item.name.toLowerCase().includes(normalized) ||
        item.category.toLowerCase().includes(normalized) ||
        item.description.toLowerCase().includes(normalized)
      return matchesCategory && matchesQuery
    })
  }, [visibleMenu, query, activeCategory])
  const showCategoryFilters = categories.length > 2
  const draftItemIndex = useMemo(() => indexDraftItems(draft), [draft])
  const cartItemCount = useMemo(
    () =>
      [...Object.values(draft), ...Object.values(submittedDraft)].reduce(
        (total, line) => total + line.quantity,
        0,
      ),
    [draft, submittedDraft],
  )

  useEffect(() => {
    if (cartItemCount > previousCartCount.current) {
      setCartPulse((value) => value + 1)
    }
    previousCartCount.current = cartItemCount
  }, [cartItemCount])

  const locked = isSessionLockedForParticipants(session, now)
  return (
    <Drawer
      open={cartOpen}
      onOpenChange={setCartOpen}
      showSwipeHandle={isMobile}
      swipeDirection={isMobile ? 'down' : 'right'}
    >
      <main className="flex h-svh flex-col bg-background text-foreground">
        <AppHeader
          context={session.restaurant.name}
          actions={
            <>
              {organizerReviewPath ? (
                <Button
                  onClick={() => {
                    router.history.push(organizerReviewPath)
                  }}
                  variant="outline"
                  size="sm"
                  className="h-8 w-20 rounded-lg px-2.5 text-xs"
                >
                  <ClipboardList className="size-3.5" />
                  Review
                </Button>
              ) : null}
              <TimerPill session={session} />
              <DrawerTrigger
                aria-label={`Open cart, ${cartItemCount} ${cartItemCount === 1 ? 'item' : 'items'}`}
                render={
                  <Button
                    variant="outline"
                    size="icon-sm"
                    className="relative rounded-lg"
                  />
                }
              >
                <ShoppingCart />
                {cartItemCount > 0 ? (
                  <span
                    key={cartPulse}
                    className="cart-count-pop absolute -right-1.5 -top-1.5 flex min-w-4.5 items-center justify-center rounded-full bg-primary px-1 font-mono text-[9px] font-bold leading-4 text-primary-foreground"
                  >
                    {cartItemCount > 99 ? '99+' : cartItemCount}
                  </span>
                ) : null}
              </DrawerTrigger>
              <AccountMenu
                addressDetail={session.address.detail}
                addressLabel={session.address.label}
                connected={Boolean(organizerReviewPath)}
                name={participantName || session.organiserName}
              />
            </>
          }
        />

        <div className="flex min-h-0 flex-1 overflow-hidden">
          <section className="flex-1 overflow-y-auto">
            <div className="sticky top-0 z-5 border-b border-border bg-background/95 px-4 pb-3 pt-3 backdrop-blur-sm md:px-6">
              <div className="mx-auto max-w-5xl">
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
                {showCategoryFilters ? (
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
                ) : null}
              </div>
            </div>

            <div className="px-4 py-4 pb-28 md:px-6 lg:pb-6">
              <div className="mx-auto max-w-5xl">
                {stale ? (
                  <Alert className="mb-4">
                    <AlertTriangle />
                    <AlertDescription>
                      Showing a saved copy. Refresh before changing this order.
                    </AlertDescription>
                  </Alert>
                ) : null}

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
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                    {filtered.map((item) => (
                      <MenuCard
                        key={item.id}
                        item={item}
                        quantity={draftItemIndex.get(item.id)?.quantity ?? 0}
                        locked={locked}
                        onAdd={() =>
                          item.hasVariants || item.hasAddons
                            ? setCustomizing(item)
                            : onAddPlainItem(item.id)
                        }
                        onRemove={() => {
                          const lineId = draftItemIndex.get(
                            item.id,
                          )?.firstLineId
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
        </div>

        <CartDrawerContent
          draft={draft}
          error={error}
          locked={locked}
          menu={menu}
          participantName={participantName}
          pending={pending}
          submittedDraft={submittedDraft}
          onNameChange={onNameChange}
          onQuantityChange={onQuantityChange}
          onSubmittedQuantityChange={onSubmittedQuantityChange}
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
    </Drawer>
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
        'flex gap-3 rounded-xl border border-border bg-background p-3 transition-[border-color,background-color,box-shadow]',
        !item.available && 'opacity-50',
        quantity > 0 && 'border-primary/35 bg-primary/3 shadow-sm',
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
            loading="lazy"
            decoding="async"
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
  const selectedChoiceIds = new Set(value)

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
              selectedChoiceIds.has(choice.id)
                ? 'border-primary/40 bg-primary/5'
                : 'border-border hover:border-primary/30 hover:bg-primary/2',
            )}
          >
            <input
              type="checkbox"
              checked={selectedChoiceIds.has(choice.id)}
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

function CartDrawerContent({
  draft,
  error,
  locked,
  menu,
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
    <DrawerContent>
      <DrawerHeader className="border-b border-border p-5 pb-4 text-left">
        <div className="flex items-start justify-between gap-4">
          <div>
            <DrawerTitle>Your cart</DrawerTitle>
            <DrawerDescription>
              <span className="tabular-nums">
                {itemCount + submittedItemCount}{' '}
                {itemCount + submittedItemCount === 1 ? 'item' : 'items'}
              </span>
            </DrawerDescription>
          </div>
          <DrawerClose
            render={
              <Button variant="ghost" size="icon-sm" className="rounded-full" />
            }
          >
            <X />
            <span className="sr-only">Close cart</span>
          </DrawerClose>
        </div>
        <Field className="mt-3 gap-1.5">
          <FieldLabel
            htmlFor="cart-participant-name"
            className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground"
          >
            Your name
          </FieldLabel>
          <Input
            id="cart-participant-name"
            value={participantName}
            onChange={(event) => onNameChange(event.target.value)}
            placeholder="Enter your name"
            className="h-9 text-sm"
          />
        </Field>
      </DrawerHeader>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
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
          <Empty className="border-0 py-8">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Utensils />
              </EmptyMedia>
              <EmptyTitle>Your cart is empty</EmptyTitle>
              <EmptyDescription>
                Add an item to build your order.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
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

      {lines.length || hasSubmitted || error ? (
        <DrawerFooter className="border-t border-border pt-4">
          <ErrorAlert message={error} />
          <div className="flex flex-col gap-1.5">
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
            <Send data-icon="inline-end" />
          </Button>
        </DrawerFooter>
      ) : null}
    </DrawerContent>
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
