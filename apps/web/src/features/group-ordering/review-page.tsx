import { useMemo } from 'react'
import type { CartLine, KapiSession, ManualFallbackSummary } from '@kapi/spec'
import {
  AlertTriangle,
  Ban,
  Bell,
  CircleUserRound,
  ClipboardList,
  Loader2,
  LockKeyhole,
  Minus,
  Plus,
  ShoppingCart,
  Soup,
  Trash2,
  Utensils,
} from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '#/components/ui/alert'
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
import { Input } from '#/components/ui/input'
import { Separator } from '#/components/ui/separator'
import { cn } from '#/lib/utils'

import { ErrorAlert, IconTile, SummaryRow } from './shared'

export function OrganizerReviewPage({
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
    const names = [
      ...new Set(session.items.map((item) => item.participantName)),
    ]
    return names.map((name) => ({
      name,
      items: session.items.filter((item) => item.participantName === name),
    }))
  }, [session.items])
  const subtotal = session.items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  )
  const unavailable = session.items.filter((item) => !item.available)
  const taxes = Math.round(subtotal * 0.12)
  const finalTotal = subtotal + taxes

  return (
    <main className="min-h-svh bg-background text-foreground">
      <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-border bg-background px-4 shadow-sm md:px-8">
        <div className="flex items-center gap-10">
          <span className="font-heading text-2xl font-extrabold text-primary">
            Kapi.run
          </span>
          <nav className="hidden h-14 items-center gap-6 lg:flex">
            <span className="flex h-14 items-center border-b-2 border-primary text-xs font-semibold tracking-[0.02em] text-primary">
              Review Order
            </span>
            <span className="flex h-14 items-center px-2 text-xs font-semibold tracking-[0.02em] text-muted-foreground">
              Order History
            </span>
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon-sm"
            className="rounded text-muted-foreground"
          >
            <Bell />
          </Button>
          <Avatar>
            <AvatarFallback>
              <CircleUserRound />
            </AvatarFallback>
          </Avatar>
        </div>
      </header>

      <section className="mx-auto w-full max-w-6xl p-4 md:p-8">
        <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold leading-8 tracking-normal">
              Consolidated Review
            </h1>
            <p className="text-sm leading-5 text-muted-foreground">
              Order cutoff reached. Please review the items before finalizing
              with Swiggy.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className="w-fit rounded bg-(--kapi-subtle) font-mono text-[11px] text-muted-foreground"
            >
              SESSION: {session.id.slice(0, 8)}
            </Badge>
            <Badge
              variant={session.status === 'open' ? 'secondary' : 'default'}
              className="rounded"
            >
              {session.status}
            </Badge>
            {isOrganizer ? (
              <Button
                onClick={onLock}
                disabled={pending || session.status !== 'open'}
                variant="outline"
                size="sm"
                className="rounded"
              >
                <LockKeyhole data-icon="inline-start" />
                Lock
              </Button>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-12 items-start gap-4">
          <div className="col-span-12 flex flex-col gap-4 lg:col-span-8">
            {isOrganizer ? (
              <section className="border-b border-border pb-4">
                <h2 className="mb-2 text-base font-semibold leading-6">
                  Invite Link
                </h2>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    readOnly
                    value={session.shareUrl}
                    className="font-mono text-xs"
                  />
                  <Button
                    onClick={() =>
                      navigator.clipboard.writeText(session.shareUrl)
                    }
                    variant="outline"
                  >
                    Copy
                  </Button>
                  <Button onClick={onRefresh} variant="outline">
                    Refresh
                  </Button>
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
                  <EmptyDescription>
                    Participants will appear here after they submit their cart.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : null}
            {groups.map((group) => (
              <ParticipantGroup
                key={group.name}
                isOrganizer={isOrganizer}
                name={group.name}
                items={group.items}
                onRemoveItem={onRemoveItem}
                onUpdateItem={onUpdateItem}
              />
            ))}
          </div>

          <aside className="col-span-12 flex flex-col gap-4 lg:col-span-4">
            <section className="sticky top-20 border-l border-border pl-4">
              <h2 className="mb-4 text-base font-semibold leading-6">
                Order Summary
              </h2>
              <div className="mb-6 flex flex-col gap-2">
                <SummaryRow
                  label="Total Participants"
                  value={String(groups.length)}
                  strong
                />
                <SummaryRow
                  label="Items Ordered"
                  value={String(
                    session.items.reduce((sum, item) => sum + item.quantity, 0),
                  )}
                  strong
                />
                <SummaryRow label="Subtotal" value={`₹${subtotal}`} strong />
                <SummaryRow
                  label="Taxes & Delivery"
                  value={`₹${taxes}`}
                  strong
                />
                <Separator className="mt-1" />
                <div className="flex justify-between pt-1 text-base font-semibold leading-6">
                  <span>Final Total</span>
                  <span className="text-primary">₹{finalTotal}</span>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                {isOrganizer ? (
                  <Button
                    onClick={onSync}
                    disabled={pending || !session.items.length}
                    className="h-12 text-base font-semibold"
                  >
                    {pending ? (
                      <Loader2
                        className="animate-spin"
                        data-icon="inline-start"
                      />
                    ) : (
                      <ShoppingCart data-icon="inline-start" />
                    )}
                    {session.status === 'synced'
                      ? 'Cart Ready'
                      : 'Add to Swiggy Cart'}
                  </Button>
                ) : null}
                <Button variant="outline">Download Receipt</Button>
                {isOrganizer ? (
                  <Button onClick={onFallback} variant="outline">
                    <ClipboardList data-icon="inline-start" />
                    Manual Checklist
                  </Button>
                ) : null}
              </div>
              <ErrorAlert message={error} className="mt-3" />
              {session.sync ? (
                <p className="mt-3 text-[13px] leading-4.5 text-muted-foreground">
                  {session.sync.message}
                </p>
              ) : null}
              {unavailable.length ? (
                <Alert variant="destructive" className="mt-6">
                  <AlertTriangle />
                  <AlertTitle>
                    {unavailable.length} item is unavailable.
                  </AlertTitle>
                  <AlertDescription>
                    Remove or replace before syncing.
                  </AlertDescription>
                </Alert>
              ) : null}
            </section>

            {isOrganizer ? (
              <section className="border-l border-border pl-4">
                <p className="mb-1 text-[11px] font-bold uppercase leading-3.5 tracking-[0.03em] text-primary">
                  Next Step
                </p>
                <h3 className="mb-2 text-base font-semibold leading-6">
                  Open Swiggy Cart
                </h3>
                <p className="mb-4 text-[13px] leading-4.5 text-muted-foreground">
                  Review the synced cart in Swiggy, apply coupons or payment
                  details there, then complete checkout.
                </p>
                <Button variant="link" className="h-auto gap-1 px-0 text-xs">
                  <ShoppingCart data-icon="inline-start" /> Continue in Swiggy
                </Button>
              </section>
            ) : null}

            {isOrganizer && fallback ? (
              <section className="border-l border-border pl-4">
                <h3 className="mb-2 text-base font-semibold leading-6">
                  Manual Swiggy Checklist
                </h3>
                <p className="mb-3 text-[13px] leading-4.5 text-muted-foreground">
                  {fallback.restaurantName} • {fallback.addressLabel} • ₹
                  {fallback.total}
                </p>
                <div className="flex flex-col gap-2">
                  {fallback.checklist.map((line) => (
                    <div
                      key={line}
                      className="border-b border-border pb-2 font-mono text-xs last:border-b-0"
                    >
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
  return (
    <section className="border border-border">
      <header className="flex items-center justify-between border-b border-border px-4 py-2">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold leading-6">{name}</h2>
          <Badge
            variant="outline"
            className="rounded bg-background text-[11px] text-muted-foreground"
          >
            {items.length} items
          </Badge>
        </div>
        <span className="font-mono text-[13px] text-muted-foreground">
          ₹{total}.00
        </span>
      </header>
      <div className="divide-y divide-border">
        {items.map((item) => (
          <ReviewItem
            key={item.id}
            isOrganizer={isOrganizer}
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
  const Icon = item.available
    ? item.name.includes('Dal')
      ? Soup
      : Utensils
    : Ban
  return (
    <div
      className={cn(
        'flex items-start justify-between gap-4 p-4 transition-colors hover:bg-(--kapi-subtle)',
        !item.available && 'bg-destructive/5 hover:bg-destructive/10',
      )}
    >
      <div className="flex gap-4">
        <IconTile
          icon={Icon}
          className={
            !item.available
              ? 'border-destructive bg-destructive/10 text-destructive'
              : undefined
          }
        />
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-xs font-semibold leading-4">{item.name}</h3>
            {!item.available ? (
              <Badge className="rounded bg-destructive text-[10px] font-bold uppercase tracking-wider text-white">
                Out of Stock
              </Badge>
            ) : null}
          </div>
          <p className="text-[13px] leading-4.5 text-muted-foreground">
            {item.note || 'Standard Portion'}
          </p>
        </div>
      </div>
      <div className="text-right">
        <p
          className={cn(
            'text-xs font-semibold leading-4',
            !item.available && 'text-destructive',
          )}
        >
          ₹{item.price}
        </p>
        <p className="text-[11px] font-medium leading-3.5 text-muted-foreground">
          Qty: {item.quantity}
        </p>
        {isOrganizer ? (
          <div className="mt-2 flex items-center justify-end gap-1">
            <Button
              onClick={() => onUpdate(item.quantity - 1)}
              variant="outline"
              size="icon-xs"
              className="rounded"
            >
              <Minus />
            </Button>
            <Button
              onClick={() => onUpdate(item.quantity + 1)}
              variant="outline"
              size="icon-xs"
              className="rounded"
            >
              <Plus />
            </Button>
            <Button
              onClick={onRemove}
              variant="ghost"
              size="icon-xs"
              className="rounded text-destructive"
            >
              <Trash2 />
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
