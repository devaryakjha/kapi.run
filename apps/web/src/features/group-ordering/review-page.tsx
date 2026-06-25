import { useMemo } from 'react'
import type {
  CartLine,
  KapiSession,
  ManualFallbackSummary,
  SwiggyCartSummary,
} from '@kapi/spec'
import {
  AlertTriangle,
  Check,
  ClipboardList,
  Loader2,
  LockKeyhole,
  Minus,
  Plus,
  ShoppingCart,
  Trash2,
} from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '#/components/ui/alert'
import { Avatar, AvatarFallback } from '#/components/ui/avatar'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { Input } from '#/components/ui/input'
import { Separator } from '#/components/ui/separator'
import { cn } from '#/lib/utils'

import {
  ErrorAlert,
  SummaryRow,
  getOrderQuantity,
  getOrderSubtotal,
} from './shared'

export function OrganizerReviewPage({
  error,
  fallback,
  isOrganizer,
  pending,
  session,
  stale,
  swiggyCart,
  onCancelSync,
  onConfirmSync,
  onFallback,
  onLock,
  onOpenMenuMode,
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
  stale: boolean
  swiggyCart: SwiggyCartSummary | null
  onCancelSync: () => void
  onConfirmSync: () => void
  onFallback: () => void
  onLock: () => void
  onOpenMenuMode: () => void
  onRemoveItem: (itemId: string) => void
  onRefresh: () => void
  onSync: () => void
  onUpdateItem: (itemId: string, quantity: number) => void
}) {
  const groups = useMemo(() => {
    const keys = [
      ...new Set(
        session.items.map(
          (item) => item.participantId || `name:${item.participantName}`,
        ),
      ),
    ]
    return keys.map((key) => {
      const items = session.items.filter(
        (item) =>
          (item.participantId || `name:${item.participantName}`) === key,
      )
      return {
        key,
        name: items.at(-1)?.participantName ?? 'Guest',
        items,
      }
    })
  }, [session.items])

  const subtotal = getOrderSubtotal(session)
  const unavailable = session.items.filter((item) => !item.available)
  const totalQty = getOrderQuantity(session)

  return (
    <main className="min-h-svh bg-background text-foreground">
      <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur-sm md:px-6">
        <div className="flex items-center gap-3">
          <span className="text-base font-bold tracking-tight text-primary">
            kapi.run
          </span>
          <span className="h-4 w-px bg-border" />
          <span className="text-sm font-medium">{session.restaurant.name}</span>
        </div>
        <div className="flex items-center gap-2">
          {isOrganizer ? (
            <div className="hidden items-center rounded-lg border border-border p-0.5 sm:flex">
              <span className="rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground">
                Review
              </span>
              <Button
                onClick={onOpenMenuMode}
                variant="ghost"
                size="sm"
                className="h-7 rounded-md px-2.5 text-xs"
              >
                Menu
              </Button>
            </div>
          ) : null}
          <Badge
            variant={session.status === 'open' ? 'secondary' : 'default'}
            className="rounded-full text-[11px]"
          >
            {statusLabel(session.status)}
          </Badge>
          {isOrganizer ? (
            <Button
              onClick={onLock}
              disabled={pending || session.status !== 'open'}
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 rounded-lg text-xs"
            >
              <LockKeyhole className="size-3" />
              Lock session
            </Button>
          ) : null}
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-6 md:px-6 md:py-8">
        <div className="mb-6">
          <h1 className="text-xl font-semibold tracking-tight">
            Group Order Review
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {session.address.label} ·{' '}
            <span className="font-mono text-[11px]">
              {session.id.slice(0, 8)}
            </span>
          </p>
        </div>

        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[1fr_280px]">
          <div className="flex flex-col gap-4">
            {stale ? (
              <Alert>
                <AlertTriangle />
                <AlertDescription>
                  Showing a saved copy. Refresh before changing this order.
                </AlertDescription>
              </Alert>
            ) : null}

            {isOrganizer ? (
              <div className="flex flex-col gap-2 rounded-xl border border-border p-4 sm:flex-row sm:items-center">
                <Input
                  aria-label="Share link"
                  readOnly
                  value={session.shareUrl}
                  className="min-w-0 flex-1 font-mono text-xs"
                />
                <div className="flex gap-2">
                  <div className="flex items-center rounded-lg border border-border p-0.5 sm:hidden">
                    <span className="rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground">
                      Review
                    </span>
                    <Button
                      onClick={onOpenMenuMode}
                      variant="ghost"
                      size="sm"
                      className="h-7 rounded-md px-2.5 text-xs"
                    >
                      Menu
                    </Button>
                  </div>
                  <Button
                    onClick={() =>
                      navigator.clipboard.writeText(session.shareUrl)
                    }
                    variant="outline"
                    size="sm"
                    className="h-8 rounded-lg text-xs"
                  >
                    Copy link
                  </Button>
                  <Button
                    onClick={onRefresh}
                    variant="outline"
                    size="sm"
                    className="h-8 rounded-lg text-xs"
                  >
                    Refresh
                  </Button>
                </div>
              </div>
            ) : null}

            {!groups.length ? (
              <Empty className="rounded-xl border border-border">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <ShoppingCart />
                  </EmptyMedia>
                  <EmptyTitle>Waiting for orders</EmptyTitle>
                  <EmptyDescription>
                    Participants will appear here after they submit.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : null}

            {groups.map((group) => (
              <ParticipantGroup
                key={group.key}
                isOrganizer={isOrganizer}
                name={group.name}
                items={group.items}
                onRemoveItem={onRemoveItem}
                onUpdateItem={onUpdateItem}
              />
            ))}
          </div>

          <div className="lg:sticky lg:top-20">
            <div className="rounded-xl border border-border bg-(--kapi-subtle) p-5">
              <h2 className="mb-4 text-sm font-semibold">Order summary</h2>
              <div className="flex flex-col gap-2">
                <SummaryRow
                  label="Participants"
                  value={String(groups.length)}
                  strong
                />
                <SummaryRow
                  label="Total items"
                  value={String(totalQty)}
                  strong
                />
                <SummaryRow
                  label="Item subtotal"
                  value={`₹${subtotal}`}
                  strong
                />
                <Separator className="my-1" />
                <p className="text-[11px] leading-5 text-muted-foreground">
                  Taxes, delivery fees, coupons, and final charges are handled
                  in Swiggy.
                </p>
              </div>

              <div className="mt-5 flex flex-col gap-2">
                {isOrganizer ? (
                  <Button
                    onClick={onSync}
                    disabled={pending || !session.items.length}
                    className="h-10 w-full rounded-xl text-sm font-semibold"
                  >
                    {pending ? (
                      <Loader2
                        className="animate-spin"
                        data-icon="inline-start"
                      />
                    ) : (
                      <ShoppingCart
                        className="size-4"
                        data-icon="inline-start"
                      />
                    )}
                    {session.status === 'synced'
                      ? 'Cart synced'
                      : 'Sync to Swiggy cart'}
                  </Button>
                ) : null}
                {isOrganizer ? (
                  <Button
                    onClick={onFallback}
                    variant="outline"
                    className="h-9 w-full rounded-xl text-sm"
                  >
                    <ClipboardList
                      className="size-3.5"
                      data-icon="inline-start"
                    />
                    Manual checklist
                  </Button>
                ) : null}
              </div>

              <ErrorAlert message={error} className="mt-4" />

              {unavailable.length ? (
                <Alert variant="destructive" className="mt-4">
                  <AlertTriangle />
                  <AlertTitle>{unavailable.length} item unavailable</AlertTitle>
                  <AlertDescription>
                    Remove or replace before syncing.
                  </AlertDescription>
                </Alert>
              ) : null}

              {session.sync ? (
                <p className="mt-3 text-[12px] leading-5 text-muted-foreground">
                  {session.sync.message}
                </p>
              ) : null}
            </div>

            {isOrganizer ? (
              <div className="mt-4 rounded-xl border border-primary/20 bg-primary/2.5 p-4">
                <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.08em] text-primary">
                  Next step
                </p>
                <p className="text-sm font-semibold">Open Swiggy cart</p>
                <p className="mt-1 text-[12px] leading-5 text-muted-foreground">
                  Apply coupons or payment details in Swiggy, then place the
                  order.
                </p>
              </div>
            ) : null}

            {isOrganizer && fallback ? (
              <div className="mt-4 rounded-xl border border-border p-4">
                <p className="mb-1 text-xs font-semibold">Manual checklist</p>
                <p className="mb-3 text-[11px] text-muted-foreground">
                  {fallback.restaurantName} · {fallback.addressLabel} · ₹
                  {fallback.total}
                </p>
                <div className="flex flex-col gap-1.5">
                  {fallback.checklist.map((line, index) => (
                    <div
                      key={`${line}:${index}`}
                      className="flex items-start gap-2 text-[11px] leading-5"
                    >
                      <Check className="mt-0.5 size-3 shrink-0 text-primary" />
                      <span className="font-mono">{line}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
      <SwiggySyncDialog
        cart={swiggyCart}
        pending={pending}
        onCancel={onCancelSync}
        onConfirm={onConfirmSync}
      />
    </main>
  )
}

function statusLabel(status: KapiSession['status']) {
  return {
    open: 'Open',
    locked: 'Locked',
    syncing: 'Syncing',
    synced: 'Synced',
    sync_failed: 'Sync failed',
    closed: 'Closed',
  }[status]
}

function SwiggySyncDialog({
  cart,
  pending,
  onCancel,
  onConfirm,
}: {
  cart: SwiggyCartSummary | null
  pending: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  if (!cart) return null

  const hasExistingCart = !cart.empty
  const details = [
    cart.itemCount
      ? `${cart.itemCount} item${cart.itemCount === 1 ? '' : 's'}`
      : '',
    cart.restaurantName ? `from ${cart.restaurantName}` : '',
    typeof cart.total === 'number' ? `totalling ₹${cart.total}` : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <Dialog open={Boolean(cart)} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {hasExistingCart
              ? 'Replace your Swiggy cart?'
              : 'Add group cart to Swiggy?'}
          </DialogTitle>
          <DialogDescription>
            {hasExistingCart
              ? `Your Swiggy cart already has ${details || 'items'}. Replacing it will clear those items and add this group cart. You will still review and place the order in Swiggy.`
              : 'This adds the available items to your Swiggy cart. You will still review and place the order in Swiggy.'}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={pending}>
            {hasExistingCart ? 'Keep current cart' : 'Cancel'}
          </Button>
          <Button onClick={onConfirm} disabled={pending}>
            {pending ? (
              <Loader2 className="animate-spin" data-icon="inline-start" />
            ) : null}
            {hasExistingCart ? 'Replace cart' : 'Add to Swiggy cart'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ParticipantGroup({
  isOrganizer,
  name,
  items,
  onRemoveItem,
  onUpdateItem,
}: {
  isOrganizer: boolean
  name: string
  items: CartLine[]
  onRemoveItem: (itemId: string) => void
  onUpdateItem: (itemId: string, quantity: number) => void
}) {
  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0)
  const initial = name.slice(0, 1).toUpperCase()

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-background">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <Avatar className="size-7">
            <AvatarFallback className="text-[11px] font-bold">
              {initial}
            </AvatarFallback>
          </Avatar>
          <span className="text-sm font-semibold">{name}</span>
          <span className="text-[11px] text-muted-foreground">
            {items.length} {items.length === 1 ? 'item' : 'items'}
          </span>
        </div>
        <span className="font-mono text-sm font-semibold">₹{total}</span>
      </div>
      <div className="divide-y divide-border">
        {items.map((item) => (
          <ReviewItem
            key={item.id}
            isOrganizer={isOrganizer}
            item={item}
            onRemove={() => onRemoveItem(item.id)}
            onUpdate={(qty) => onUpdateItem(item.id, qty)}
          />
        ))}
      </div>
    </div>
  )
}

function ReviewItem({
  isOrganizer,
  item,
  onRemove,
  onUpdate,
}: {
  isOrganizer: boolean
  item: CartLine
  onRemove: () => void
  onUpdate: (quantity: number) => void
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-4 px-4 py-3 transition-colors',
        !item.available ? 'bg-destructive/5' : 'hover:bg-(--kapi-subtle)',
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              'text-sm font-medium leading-5',
              !item.available && 'text-destructive',
            )}
          >
            {item.name}
          </span>
          {!item.available ? (
            <Badge className="rounded-full bg-destructive/10 text-[10px] font-semibold text-destructive">
              Out of stock
            </Badge>
          ) : null}
        </div>
        {item.customizationSummary ? (
          <p className="text-[12px] text-muted-foreground">
            {item.customizationSummary}
          </p>
        ) : null}
      </div>

      <div className="flex items-center gap-3">
        <span className="font-mono text-sm font-semibold tabular-nums">
          ₹{item.price}
          <span className="ml-1 text-[11px] font-normal tabular-nums text-muted-foreground">
            ×{item.quantity}
          </span>
        </span>
        {isOrganizer ? (
          <div className="flex items-center gap-1">
            <div className="flex h-7 items-center rounded-full border border-border">
              <button
                type="button"
                aria-label={`Decrease ${item.name}`}
                onClick={() => onUpdate(item.quantity - 1)}
                className="flex size-7 items-center justify-center rounded-full text-muted-foreground transition-[colors,scale] duration-150 hover:bg-muted active:scale-[0.96]"
              >
                <Minus className="size-2.5" />
              </button>
              <span className="min-w-[1.1rem] text-center font-mono text-xs font-medium tabular-nums">
                {item.quantity}
              </span>
              <button
                type="button"
                aria-label={`Increase ${item.name}`}
                onClick={() => onUpdate(item.quantity + 1)}
                className="flex size-7 items-center justify-center rounded-full text-muted-foreground transition-[colors,scale] duration-150 hover:bg-muted active:scale-[0.96]"
              >
                <Plus className="size-2.5" />
              </button>
            </div>
            <button
              type="button"
              aria-label={`Remove ${item.name}`}
              onClick={onRemove}
              className="flex size-7 items-center justify-center rounded-full text-muted-foreground transition-[colors,scale] duration-150 hover:bg-destructive/10 hover:text-destructive active:scale-[0.96]"
            >
              <Trash2 className="size-2.5" />
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
