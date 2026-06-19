import { useState } from 'react'
import type { Address, AuthStatus, Restaurant } from '@kapi/spec'
import {
  ArrowRight,
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
  BrandLockup,
  ErrorAlert,
  IconTile,
  SetupStep,
  formatAddressOption,
  formatRestaurantLocationMeta,
  formatRestaurantValueMeta,
  setupImage,
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
  const addressItems = makeAddressItems(authStatus, addresses)
  const selectedRestaurant = restaurants.find(
    (restaurant) => restaurant.id === selectedRestaurantId,
  )

  return (
    <main className="flex min-h-svh bg-background text-foreground">
      <SetupSidebar />
      <section className="flex-1 p-6 md:p-10">
        <div className="mx-auto max-w-5xl">
          <MobileBrand />
          <SetupHeader />
          <div className="flex flex-col gap-10">
            <AuthStep authStatus={authStatus} onConnect={onConnect} />
            <LogisticsStep
              addressItems={addressItems}
              addresses={addresses}
              authStatus={authStatus}
              cutoffTime={cutoffTime}
              selectedAddressId={selectedAddressId}
              onAddressChange={onAddressChange}
              onCutoffTimeChange={onCutoffTimeChange}
            />
            <VenueStep
              pending={pending}
              restaurantQuery={restaurantQuery}
              restaurants={restaurants}
              selectedAddressId={selectedAddressId}
              selectedRestaurant={selectedRestaurant}
              onRestaurantChange={onRestaurantChange}
              onRestaurantQueryChange={onRestaurantQueryChange}
            />
            <SetupActions
              authStatus={authStatus}
              error={error}
              pending={pending}
              selectedAddressId={selectedAddressId}
              selectedRestaurantId={selectedRestaurantId}
              onCreate={onCreate}
            />
          </div>
        </div>
      </section>
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

function SetupSidebar() {
  return (
    <aside className="hidden min-h-svh w-80 shrink-0 flex-col justify-between border-r border-border bg-(--kapi-subtle) p-6 md:flex">
      <div>
        <BrandLockup />
        <h1 className="mb-2 text-xl font-semibold leading-7 tracking-normal">
          Start a New <br />
          Group Session.
        </h1>
        <p className="text-[13px] leading-4.5 text-muted-foreground">
          Coordinate office lunches with precision. Set your constraints, pick
          the spot, and let the team join.
        </p>
      </div>
      <div className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg border border-border/70 bg-background p-4">
        <img
          src={setupImage}
          alt="Kapi setup illustration"
          className="h-auto w-full object-contain"
        />
      </div>
      <div aria-hidden="true" />
    </aside>
  )
}

function MobileBrand() {
  return (
    <div className="mb-6 flex items-center justify-between md:hidden">
      <span className="font-heading text-xl font-bold text-primary">
        Kapi.run
      </span>
      <Badge className="rounded-full bg-primary text-primary-foreground">
        Ops
      </Badge>
    </div>
  )
}

function SetupHeader() {
  return (
    <header className="mb-10">
      <h2 className="text-xl font-semibold leading-7 tracking-normal">
        Session Configuration
      </h2>
      <p className="text-[13px] leading-4.5 text-muted-foreground">
        Provide context to generate the session invite link.
      </p>
    </header>
  )
}

function AuthStep({
  authStatus,
  onConnect,
}: {
  authStatus: AuthStatus
  onConnect: () => void
}) {
  return (
    <SetupStep
      active
      title="Step 1: Auth Context"
      status={authStatus.connected ? 'CONNECTED' : undefined}
    >
      <div className="grid items-center gap-4 sm:grid-cols-[auto_auto] sm:justify-start sm:gap-8">
        <div className="flex items-center gap-4">
          <IconTile icon={Utensils} />
          <div>
            <h4 className="text-sm font-medium">Swiggy Login</h4>
            <p className="text-sm text-muted-foreground">
              {authStatus.connected
                ? 'Ready to choose saved addresses.'
                : 'Connect your Swiggy account to start.'}
            </p>
          </div>
        </div>
        <Button
          onClick={onConnect}
          variant={authStatus.connected ? 'link' : 'default'}
          size="sm"
        >
          {authStatus.connected ? 'Reconnect' : 'Connect Swiggy'}
        </Button>
      </div>
    </SetupStep>
  )
}

function LogisticsStep({
  addressItems,
  addresses,
  authStatus,
  cutoffTime,
  selectedAddressId,
  onAddressChange,
  onCutoffTimeChange,
}: {
  addressItems: AddressItem[]
  addresses: Address[]
  authStatus: AuthStatus
  cutoffTime: string
  selectedAddressId: string
  onAddressChange: (addressId: string) => void
  onCutoffTimeChange: (time: string) => void
}) {
  return (
    <SetupStep title="Step 2: Logistics">
      <FieldGroup className="grid min-w-0 gap-4 md:grid-cols-2">
        <Field className="min-w-0 gap-1">
          <FieldLabel className="text-[11px] font-medium tracking-[0.03em] text-muted-foreground">
            Delivery Context
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
                {addressItems.map((address) => (
                  <SelectItem
                    key={address.value || 'empty'}
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
        <Field className="min-w-0 gap-1">
          <FieldLabel
            htmlFor="cutoff-time"
            className="text-[11px] font-medium tracking-[0.03em] text-muted-foreground"
          >
            Cutoff Time
          </FieldLabel>
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
  const [isRestaurantCommandOpen, setRestaurantCommandOpen] = useState(false)

  return (
    <SetupStep title="Step 3: Venue">
      <div className="flex flex-col gap-4">
        <Dialog
          open={isRestaurantCommandOpen}
          onOpenChange={setRestaurantCommandOpen}
        >
          <RestaurantTrigger
            selectedAddressId={selectedAddressId}
            selectedRestaurant={selectedRestaurant}
            onOpen={() => setRestaurantCommandOpen(true)}
          />
          <RestaurantCommand
            pending={pending}
            restaurantQuery={restaurantQuery}
            restaurants={restaurants}
            selectedAddressId={selectedAddressId}
            onRestaurantChange={(restaurantId) => {
              onRestaurantChange(restaurantId)
              setRestaurantCommandOpen(false)
            }}
            onRestaurantQueryChange={onRestaurantQueryChange}
          />
        </Dialog>
      </div>
    </SetupStep>
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
          <span className="min-w-0 flex-1 truncate text-sm">
            Search restaurants or cuisine
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
                ? 'Searching restaurants...'
                : 'No restaurants found.'
              : 'Type to search restaurants.'}
          </CommandEmpty>
          {restaurants.length ? (
            <CommandGroup heading="Restaurants">
              {restaurants.map((restaurant) => (
                <CommandItem
                  key={restaurant.id}
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
          className="size-10 shrink-0 border border-border object-cover grayscale-[0.45]"
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

function SetupActions({
  authStatus,
  error,
  pending,
  selectedAddressId,
  selectedRestaurantId,
  onCreate,
}: {
  authStatus: AuthStatus
  error: string | null
  pending: boolean
  selectedAddressId: string
  selectedRestaurantId: string
  onCreate: () => void
}) {
  return (
    <div className="border-t border-border pt-4">
      <ErrorAlert message={error} className="mb-3" />
      <Button
        onClick={onCreate}
        disabled={
          pending ||
          !authStatus.connected ||
          !selectedAddressId ||
          !selectedRestaurantId
        }
        className="h-12 w-full rounded-lg text-base font-semibold"
      >
        {pending ? (
          <Loader2 className="animate-spin" data-icon="inline-start" />
        ) : null}
        Create Group Session
        <ArrowRight data-icon="inline-end" />
      </Button>
      <p className="mt-4 text-center text-[13px] leading-4.5 text-muted-foreground">
        Invite link will be generated instantly.
      </p>
    </div>
  )
}
