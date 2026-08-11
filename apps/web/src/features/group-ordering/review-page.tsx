import { useMemo } from 'react'
import { toast } from 'sonner'
import type { CartLine, KapiSession, SwiggyCartSummary } from '@kapi/spec'
import {
  AlertTriangle,
  Link2,
  Loader2,
  LockKeyhole,
  Minus,
  Plus,
  RefreshCw,
  ShoppingCart,
  Trash2,
  Utensils,
  UsersRound,
} from 'lucide-react'

import { AppHeader } from '#/components/app-header'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '#/components/ui/alert-dialog'
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
  groupCartLinesByParticipant,
  getOrderQuantity,
  getOrderSubtotal,
} from './shared'
import { AccountMenu } from './account-menu'
import { ErrorAlert } from './error-alert'
import { SummaryRow } from './summary-row'
import { TimerPill } from './timer-pill'

type OrganizerReviewPageProps = {
  error: string | null
  isOrganizer: boolean
  pending: boolean
  session: KapiSession
  stale: boolean
  swiggyCart: SwiggyCartSummary | null
  onCancelSync: () => void
  onConfirmSync: () => void
  onLock: () => void
  onOpenMenuMode: () => void
  onRemoveItem: (itemId: string) => void
  onRefresh: () => void
  onSync: () => void
  onUpdateItem: (itemId: string, quantity: number) => void
}

type ReviewGroup = {
  key: string
  name: string
  items: CartLine[]
}

export function OrganizerReviewPage({
  error,
  isOrganizer,
  pending,
  session,
  stale,
  swiggyCart,
  onCancelSync,
  onConfirmSync,
  onLock,
  onOpenMenuMode,
  onRemoveItem,
  onRefresh,
  onSync,
  onUpdateItem,
}: OrganizerReviewPageProps) {
  const groups = useMemo(
    () => groupCartLinesByParticipant(session.items),
    [session.items],
  )

  const subtotal = getOrderSubtotal(session)
  const unavailable = session.items.filter((item) => !item.available)
  const totalQty = getOrderQuantity(session)

  return (
    <main className="min-h-svh bg-background text-foreground">
      <ReviewPageHeader
        isOrganizer={isOrganizer}
        session={session}
        onOpenMenuMode={onOpenMenuMode}
      />

      <div className="mx-auto max-w-6xl px-4 py-6 md:px-6 md:py-8">
        <ReviewPageIntro
          isOrganizer={isOrganizer}
          pending={pending}
          session={session}
          onLock={onLock}
        />
        <OrderReviewContent
          error={error}
          groups={groups}
          isOrganizer={isOrganizer}
          pending={pending}
          session={session}
          stale={stale}
          subtotal={subtotal}
          totalQty={totalQty}
          unavailable={unavailable}
          onRefresh={onRefresh}
          onRemoveItem={onRemoveItem}
          onSync={onSync}
          onUpdateItem={onUpdateItem}
        />
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

function ReviewPageHeader({
  isOrganizer,
  session,
  onOpenMenuMode,
}: {
  isOrganizer: boolean
  session: KapiSession
  onOpenMenuMode: () => void
}) {
  return (
    <AppHeader
      context={session.restaurant.name}
      actions={
        <>
          <Button
            onClick={onOpenMenuMode}
            variant="outline"
            size="sm"
            className="h-8 w-20 rounded-lg px-2.5 text-xs"
          >
            <Utensils className="size-3.5" />
            Menu
          </Button>
          <TimerPill session={session} />
          <AccountMenu
            addressDetail={session.address.detail}
            addressLabel={session.address.label}
            connected={isOrganizer}
            name={session.organiserName}
          />
        </>
      }
    />
  )
}

function ReviewPageIntro({
  isOrganizer,
  pending,
  session,
  onLock,
}: {
  isOrganizer: boolean
  pending: boolean
  session: KapiSession
  onLock: () => void
}) {
  return (
    <div className="mb-5 flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">Review order</h1>
        <p className="mt-1 truncate text-sm text-muted-foreground">
          {session.restaurant.name} · {session.address.label}
        </p>
      </div>
      {isOrganizer && session.status === 'open' ? (
        <AlertDialog>
          <AlertDialogTrigger
            disabled={pending}
            render={
              <Button
                variant="outline"
                size="sm"
                className="h-8 shrink-0 rounded-lg text-xs"
              />
            }
          >
            <LockKeyhole data-icon="inline-start" />
            Lock order
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Lock this group order?</AlertDialogTitle>
              <AlertDialogDescription>
                No one can change their items after you lock the order.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep open</AlertDialogCancel>
              <AlertDialogAction
                onClick={onLock}
                disabled={pending}
                variant="destructive"
              >
                {pending ? (
                  <Loader2 className="animate-spin" data-icon="inline-start" />
                ) : (
                  <LockKeyhole data-icon="inline-start" />
                )}
                Lock order
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </div>
  )
}

function OrderReviewContent({
  error,
  groups,
  isOrganizer,
  pending,
  session,
  stale,
  subtotal,
  totalQty,
  unavailable,
  onRefresh,
  onRemoveItem,
  onSync,
  onUpdateItem,
}: {
  error: string | null
  groups: ReviewGroup[]
  isOrganizer: boolean
  pending: boolean
  session: KapiSession
  stale: boolean
  subtotal: number
  totalQty: number
  unavailable: CartLine[]
  onRefresh: () => void
  onRemoveItem: (itemId: string) => void
  onSync: () => void
  onUpdateItem: (itemId: string, quantity: number) => void
}) {
  return (
    <div className="flex flex-col gap-5">
      {stale ? <StaleSessionAlert /> : null}
      {isOrganizer ? <ShareActionsPanel session={session} /> : null}

      <div
        className={cn(
          'grid grid-cols-1 items-start gap-6 md:grid-cols-[minmax(0,1fr)_18rem]',
          !groups.length && 'md:items-stretch',
        )}
      >
        <section
          className="flex min-w-0 flex-col"
          aria-labelledby="orders-heading"
        >
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <h2 id="orders-heading" className="text-base font-semibold">
                Orders
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {groups.length} {groups.length === 1 ? 'person' : 'people'} ·{' '}
                {totalQty} {totalQty === 1 ? 'item' : 'items'}
              </p>
            </div>
            {isOrganizer ? (
              <Button
                onClick={onRefresh}
                variant="ghost"
                size="sm"
                className="h-8 rounded-lg text-xs"
              >
                <RefreshCw data-icon="inline-start" />
                Refresh
              </Button>
            ) : null}
          </div>
          <OrderGroups
            groups={groups}
            isOrganizer={isOrganizer}
            onRemoveItem={onRemoveItem}
            onUpdateItem={onUpdateItem}
          />
        </section>

        <OrderSummarySidebar
          error={error}
          groups={groups}
          isOrganizer={isOrganizer}
          pending={pending}
          session={session}
          subtotal={subtotal}
          totalQty={totalQty}
          unavailable={unavailable}
          fillHeight={!groups.length}
          onSync={onSync}
        />
      </div>
    </div>
  )
}

function StaleSessionAlert() {
  return (
    <Alert>
      <AlertTriangle />
      <AlertDescription>
        Showing a saved copy. Refresh before changing this order.
      </AlertDescription>
    </Alert>
  )
}

function ShareActionsPanel({ session }: { session: KapiSession }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm shadow-primary/5">
      <div className="mb-3 flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <UsersRound className="size-5" aria-hidden="true" />
        </div>
        <div>
          <h2 className="text-base font-semibold">Invite your group</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Share the link. New orders appear below after submission.
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          aria-label="Invite link"
          readOnly
          value={session.shareUrl}
          className="min-w-0 flex-1 bg-muted/60 font-mono text-xs"
        />
        <Button
          onClick={() => {
            navigator.clipboard
              .writeText(session.shareUrl)
              .then(() => toast.success('Invite link copied'))
              .catch(() => toast.error('Could not copy the link'))
          }}
          size="sm"
          className="h-9 shrink-0 rounded-lg text-xs"
        >
          <Link2 data-icon="inline-start" />
          Copy invite link
        </Button>
      </div>
    </section>
  )
}

function OrderGroups({
  groups,
  isOrganizer,
  onRemoveItem,
  onUpdateItem,
}: {
  groups: ReviewGroup[]
  isOrganizer: boolean
  onRemoveItem: (itemId: string) => void
  onUpdateItem: (itemId: string, quantity: number) => void
}) {
  if (!groups.length) {
    return (
      <Empty className="min-h-72 rounded-2xl border border-solid border-border bg-card p-8">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ShoppingCart />
          </EmptyMedia>
          <EmptyTitle>No orders yet</EmptyTitle>
          <EmptyDescription>
            Share the invite link. Submitted orders will appear here.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return groups.map((group) => (
    <ParticipantGroup
      key={group.key}
      isOrganizer={isOrganizer}
      name={group.name}
      items={group.items}
      onRemoveItem={onRemoveItem}
      onUpdateItem={onUpdateItem}
    />
  ))
}

function OrderSummarySidebar({
  error,
  groups,
  isOrganizer,
  pending,
  session,
  subtotal,
  totalQty,
  unavailable,
  fillHeight,
  onSync,
}: {
  error: string | null
  groups: ReviewGroup[]
  isOrganizer: boolean
  pending: boolean
  session: KapiSession
  subtotal: number
  totalQty: number
  unavailable: CartLine[]
  fillHeight: boolean
  onSync: () => void
}) {
  return (
    <aside
      className={cn('md:sticky md:top-20', fillHeight && 'md:flex md:flex-col')}
      aria-labelledby="summary-heading"
    >
      <div className="mb-3">
        <h2 id="summary-heading" className="text-base font-semibold">
          Order summary
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {totalQty} {totalQty === 1 ? 'item' : 'items'}
        </p>
      </div>
      <OrderSummaryCard
        error={error}
        groups={groups}
        isOrganizer={isOrganizer}
        pending={pending}
        session={session}
        subtotal={subtotal}
        totalQty={totalQty}
        unavailable={unavailable}
        fillHeight={fillHeight}
        onSync={onSync}
      />
    </aside>
  )
}

function OrderSummaryCard({
  error,
  groups,
  isOrganizer,
  pending,
  session,
  subtotal,
  totalQty,
  unavailable,
  fillHeight,
  onSync,
}: {
  error: string | null
  groups: ReviewGroup[]
  isOrganizer: boolean
  pending: boolean
  session: KapiSession
  subtotal: number
  totalQty: number
  unavailable: CartLine[]
  fillHeight: boolean
  onSync: () => void
}) {
  return (
    <div
      className={cn(
        'flex flex-col rounded-2xl border border-border bg-card p-5 shadow-sm shadow-primary/5',
        fillHeight && 'md:flex-1',
      )}
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2.5">
          <SummaryRow label="People" value={String(groups.length)} strong />
          <SummaryRow label="Items" value={String(totalQty)} strong />
          <SummaryRow label="Subtotal" value={`₹${subtotal}`} strong />
        </div>
        <Separator />
        <p className="text-[11px] leading-5 text-muted-foreground">
          Swiggy adds taxes, fees, coupons, and the final total.
        </p>
      </div>

      <ErrorAlert message={error} className="mt-4" />

      {unavailable.length ? (
        <Alert variant="destructive" className="mt-4">
          <AlertTriangle />
          <AlertTitle>
            {unavailable.length} {unavailable.length === 1 ? 'item' : 'items'}{' '}
            unavailable
          </AlertTitle>
          <AlertDescription>Remove or replace before syncing.</AlertDescription>
        </Alert>
      ) : null}

      {session.sync ? (
        <p className="mt-3 text-[12px] leading-5 text-muted-foreground">
          {session.sync.message}
        </p>
      ) : null}

      {isOrganizer ? (
        <OrderSummaryActions
          pending={pending}
          session={session}
          onSync={onSync}
        />
      ) : null}
    </div>
  )
}

function OrderSummaryActions({
  pending,
  session,
  onSync,
}: {
  pending: boolean
  session: KapiSession
  onSync: () => void
}) {
  return (
    <div className="mt-auto flex flex-col gap-2 pt-5">
      <Button
        onClick={onSync}
        disabled={pending || !session.items.length}
        className="h-10 w-full rounded-xl text-sm font-semibold"
      >
        {pending ? (
          <Loader2 className="animate-spin" data-icon="inline-start" />
        ) : (
          <ShoppingCart className="size-4" data-icon="inline-start" />
        )}
        {session.status === 'synced' ? 'Cart synced' : 'Sync to Swiggy cart'}
      </Button>
    </div>
  )
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
