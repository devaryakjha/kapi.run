import { useState } from 'react'
import type { Address, AuthStatus, Restaurant } from '@kapi/spec'
import {
  ArrowRight,
  Check,
  Loader2,
  MapPin,
  Search,
  Star,
  Utensils,
} from 'lucide-react'

import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { buttonVariants } from '#/components/ui/button-variants'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '#/components/ui/command'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { Field, FieldGroup, FieldLabel } from '#/components/ui/field'
import { Input } from '#/components/ui/input'
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from '#/components/ui/item'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import { cn } from '#/lib/utils'

import {
  ErrorAlert,
  IconTile,
  formatAddressOption,
  formatRestaurantLocationMeta,
  formatRestaurantValueMeta,
} from './shared'

type AddressItem = {
  label: string
  value: string
  title: string
  detail: string
}

export function OrganizerSetupPage({
  addresses,
  authStatus,
  error,
  pending,
  restaurantQuery,
  restaurants,
  cutoffError,
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
  cutoffError: string | null
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
  const addressItems = makeAddressItems(authStatus, addresses)
  const selectedRestaurant = restaurants.find(
    (r) => r.id === selectedRestaurantId,
  )

  return (
    <main className="flex min-h-svh flex-col bg-background text-foreground">
      <nav className="flex h-14 shrink-0 items-center justify-between border-b border-border px-6">
        <span className="text-base font-bold tracking-tight text-primary">
          kapi.run
        </span>
        <Badge
          variant="secondary"
          className="rounded-full text-[10px] font-semibold uppercase tracking-wider"
        >
          Ops
        </Badge>
      </nav>

      <div className="flex flex-1 flex-col items-center px-4 py-10 md:py-16">
        <div className="w-full max-w-110">
          <div className="mb-8">
            <h1 className="text-[26px] font-semibold leading-8 tracking-tight">
              Start a group order
            </h1>
            <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
              Connect Swiggy, pick a spot, share the link.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <StepCard
              number={1}
              title="Swiggy account"
              done={authStatus.connected}
              doneLabel="Connected"
            >
              {authStatus.connected ? (
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[13px] leading-5 text-muted-foreground">
                    Your Swiggy addresses are ready to use.
                  </p>
                  <button
                    type="button"
                    onClick={onConnect}
                    className="shrink-0 text-xs text-muted-foreground transition-colors hover:text-foreground"
                  >
                    Reconnect
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted">
                      <Utensils className="size-4 text-muted-foreground" />
                    </div>
                    <p className="text-[13px] leading-5 text-muted-foreground">
                      Sign in to access your saved addresses.
                    </p>
                  </div>
                  <Button onClick={onConnect} size="sm" className="shrink-0">
                    Connect
                  </Button>
                </div>
              )}
            </StepCard>

            <StepCard number={2} title="Address & cutoff">
              <FieldGroup className="grid gap-3 sm:grid-cols-2">
                <Field className="gap-1.5">
                  <FieldLabel className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    Delivery address
                  </FieldLabel>
                  <Select
                    items={addressItems}
                    value={selectedAddressId}
                    onValueChange={(value) => onAddressChange(String(value))}
                    disabled={!authStatus.connected || !addresses.length}
                  >
                    <SelectTrigger className="w-full min-w-0">
                      <MapPin
                        className="text-muted-foreground"
                        data-icon="inline-start"
                      />
                      <SelectValue className="min-w-0 truncate" />
                    </SelectTrigger>
                    <SelectContent
                      alignItemWithTrigger={false}
                      className="w-[min(36rem,calc(100vw-2rem))]"
                    >
                      <SelectGroup>
                        {addressItems.map((address, index) => (
                          <SelectItem
                            key={`${address.value || 'empty'}:${index}`}
                            value={address.value}
                            className="items-start whitespace-normal"
                          >
                            <Item size="xs" className="min-w-0 p-0">
                              <ItemContent className="min-w-0">
                                <ItemTitle className="whitespace-normal">
                                  {address.title}
                                </ItemTitle>
                                {address.detail ? (
                                  <ItemDescription className="line-clamp-none whitespace-normal wrap-break-word">
                                    {address.detail}
                                  </ItemDescription>
                                ) : null}
                              </ItemContent>
                            </Item>
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                <Field className="gap-1.5">
                  <FieldLabel
                    htmlFor="cutoff-time"
                    className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground"
                  >
                    Order cutoff
                  </FieldLabel>
                  <Input
                    id="cutoff-time"
                    type="time"
                    step="60"
                    value={cutoffTime}
                    onChange={(e) => onCutoffTimeChange(e.target.value)}
                  />
                  {cutoffError ? (
                    <p className="text-xs leading-5 text-destructive">
                      {cutoffError}
                    </p>
                  ) : null}
                </Field>
              </FieldGroup>
            </StepCard>

            <StepCard number={3} title="Restaurant">
              <VenueStep
                pending={pending}
                restaurantQuery={restaurantQuery}
                restaurants={restaurants}
                selectedAddressId={selectedAddressId}
                selectedRestaurant={selectedRestaurant}
                onRestaurantChange={onRestaurantChange}
                onRestaurantQueryChange={onRestaurantQueryChange}
              />
            </StepCard>
          </div>

          <div className="mt-6 flex flex-col gap-3">
            <ErrorAlert message={error} />
            <Button
              onClick={onCreate}
              disabled={
                pending ||
                !authStatus.connected ||
                !selectedAddressId ||
                Boolean(cutoffError) ||
                !selectedRestaurantId
              }
              className="h-12 w-full rounded-xl text-base font-semibold"
            >
              {pending ? (
                <Loader2 className="animate-spin" data-icon="inline-start" />
              ) : null}
              Create session
              <ArrowRight data-icon="inline-end" />
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              The invite link is generated instantly.
            </p>
          </div>
        </div>
      </div>
    </main>
  )
}

function makeAddressItems(
  authStatus: AuthStatus,
  addresses: Address[],
): AddressItem[] {
  return [
    {
      label: authStatus.connected ? 'Choose address' : 'Connect first',
      value: '',
      title: authStatus.connected ? 'Choose address' : 'Connect first',
      detail: '',
    },
    ...addresses.map((address) => ({
      label: formatAddressOption(address),
      value: address.id,
      title: address.label,
      detail: address.detail,
    })),
  ]
}

function StepCard({
  number,
  title,
  done,
  doneLabel,
  children,
}: {
  number: number
  title: string
  done?: boolean
  doneLabel?: string
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        'rounded-xl border p-5 transition-colors',
        done
          ? 'border-primary/25 bg-primary/2.5'
          : 'border-border bg-background',
      )}
    >
      <div className="mb-4 flex items-center gap-2.5">
        <span
          className={cn(
            'flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold',
            done
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground',
          )}
        >
          {done ? <Check className="size-3" /> : number}
        </span>
        <span className="text-sm font-semibold leading-5">{title}</span>
        {done && doneLabel ? (
          <span className="ml-auto text-[11px] font-medium text-primary">
            ✓ {doneLabel}
          </span>
        ) : null}
      </div>
      {children}
    </div>
  )
}

function VenueStep({
  pending,
  restaurantQuery,
  restaurants,
  selectedAddressId,
  selectedRestaurant,
  onRestaurantChange,
  onRestaurantQueryChange,
}: {
  pending: boolean
  restaurantQuery: string
  restaurants: Restaurant[]
  selectedAddressId: string
  selectedRestaurant?: Restaurant
  onRestaurantChange: (restaurantId: string) => void
  onRestaurantQueryChange: (query: string) => void
}) {
  const [isOpen, setOpen] = useState(false)

  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      <RestaurantTrigger
        selectedAddressId={selectedAddressId}
        selectedRestaurant={selectedRestaurant}
        onOpen={() => setOpen(true)}
      />
      <RestaurantCommand
        pending={pending}
        restaurantQuery={restaurantQuery}
        restaurants={restaurants}
        selectedAddressId={selectedAddressId}
        onRestaurantChange={(id) => {
          onRestaurantChange(id)
          setOpen(false)
        }}
        onRestaurantQueryChange={onRestaurantQueryChange}
      />
    </Dialog>
  )
}

function RestaurantTrigger({
  selectedAddressId,
  selectedRestaurant,
  onOpen,
}: {
  selectedAddressId: string
  selectedRestaurant?: Restaurant
  onOpen: () => void
}) {
  return (
    <button
      type="button"
      disabled={!selectedAddressId}
      onClick={onOpen}
      className={cn(
        buttonVariants({ variant: 'outline' }),
        selectedRestaurant
          ? 'h-auto min-h-16 w-full items-start justify-start gap-3 rounded-lg p-3 text-left font-normal whitespace-normal'
          : 'h-9 w-full justify-start gap-2 rounded-lg px-3 text-left font-normal',
      )}
    >
      {selectedRestaurant ? (
        <RestaurantTileContent restaurant={selectedRestaurant} />
      ) : (
        <>
          <Search data-icon="inline-start" />
          <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
            Search restaurants or cuisine…
          </span>
        </>
      )}
    </button>
  )
}

function RestaurantCommand({
  pending,
  restaurantQuery,
  restaurants,
  selectedAddressId,
  onRestaurantChange,
  onRestaurantQueryChange,
}: {
  pending: boolean
  restaurantQuery: string
  restaurants: Restaurant[]
  selectedAddressId: string
  onRestaurantChange: (restaurantId: string) => void
  onRestaurantQueryChange: (query: string) => void
}) {
  return (
    <DialogContent
      className="top-1/3 translate-y-0 overflow-hidden rounded-4xl! p-0"
      showCloseButton={false}
    >
      <DialogHeader className="sr-only">
        <DialogTitle>Choose Restaurant</DialogTitle>
        <DialogDescription>Search restaurants or cuisine</DialogDescription>
      </DialogHeader>
      <Command shouldFilter={false}>
        <CommandInput
          value={restaurantQuery}
          onValueChange={onRestaurantQueryChange}
          disabled={!selectedAddressId}
          placeholder="Search restaurants or cuisine"
        />
        <CommandList>
          <CommandEmpty>
            {restaurantQuery.trim()
              ? pending
                ? 'Searching…'
                : 'No restaurants found.'
              : 'Type to search restaurants.'}
          </CommandEmpty>
          {restaurants.length ? (
            <CommandGroup heading="Restaurants">
              {restaurants.map((restaurant, index) => (
                <CommandItem
                  key={`${restaurant.id}:${index}`}
                  value={`${restaurant.name} ${restaurant.area} ${restaurant.availabilityStatus}`}
                  disabled={restaurant.availabilityStatus !== 'OPEN'}
                  onSelect={() => onRestaurantChange(restaurant.id)}
                  className="items-start gap-3 data-[disabled=true]:opacity-45"
                >
                  <RestaurantTileContent restaurant={restaurant} />
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}
        </CommandList>
      </Command>
    </DialogContent>
  )
}

function RestaurantTileContent({ restaurant }: { restaurant: Restaurant }) {
  const locationMeta = formatRestaurantLocationMeta(restaurant)
  const valueMeta = formatRestaurantValueMeta(restaurant)

  return (
    <>
      {restaurant.imageUrl ? (
        <img
          src={restaurant.imageUrl}
          alt={restaurant.name}
          className="size-10 shrink-0 rounded object-cover outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10"
        />
      ) : (
        <IconTile icon={Utensils} className="size-10" />
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold leading-5">
          {restaurant.name}
        </span>
        {locationMeta ? (
          <span className="mt-0.5 block truncate text-[13px] leading-4.5 text-muted-foreground">
            {locationMeta}
          </span>
        ) : null}
        {valueMeta ? (
          <span className="block truncate text-[12px] leading-4 text-muted-foreground">
            {valueMeta}
          </span>
        ) : null}
      </span>
      {restaurant.rating ? (
        <span className="ml-auto flex w-12 shrink-0 items-center justify-end gap-1 text-[11px] font-bold tabular-nums text-primary">
          <Star className="fill-current" />
          <span className="w-5 text-left">
            {Number(restaurant.rating).toFixed(1)}
          </span>
        </span>
      ) : (
        <span className="w-12 shrink-0" />
      )}
    </>
  )
}
