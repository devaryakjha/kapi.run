import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ClockIcon,
  LockIcon,
  MinusIcon,
  PlusIcon,
  SendIcon,
  StarIcon,
  UsersIcon,
} from "lucide-react";
import type { KapiSession, MenuItem, Participant, Restaurant } from "@kapi/spec";
import {
  defaultRestaurantId,
  formatMoney,
  sessionTotalPaise,
} from "@kapi/spec";

import {
  createSession,
  getRestaurantMenu,
  getRestaurants,
  getSession,
  joinSession,
  lockSession,
  submitItem,
} from "#/lib/api";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "#/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import { Separator } from "#/components/ui/separator";
import { Skeleton } from "#/components/ui/skeleton";
import { Toaster } from "#/components/ui/sonner";
import { toast } from "sonner";

export const Route = createFileRoute("/")({ component: Home });

type DraftItem = {
  menuItem: MenuItem;
  quantity: number;
};

function Home() {
  const queryClient = useQueryClient();
  const [selectedRestaurantId, setSelectedRestaurantId] = useState(defaultRestaurantId);
  const [sessionId, setSessionId] = useState("");
  const [participant, setParticipant] = useState<Participant | null>(null);
  const [draftItems, setDraftItems] = useState<DraftItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("All");

  const restaurantsQuery = useQuery({
    queryKey: ["restaurants"],
    queryFn: getRestaurants,
  });

  const sessionQuery = useQuery({
    queryKey: ["session", sessionId],
    queryFn: () => getSession(sessionId),
    enabled: Boolean(sessionId),
    refetchInterval: sessionId ? 3000 : false,
  });

  const activeSession = sessionQuery.data?.session;
  const activeRestaurantId = activeSession?.restaurant.id ?? selectedRestaurantId;

  const menuQuery = useQuery({
    queryKey: ["menu", activeRestaurantId],
    queryFn: () => getRestaurantMenu(activeRestaurantId),
    enabled: Boolean(activeRestaurantId),
  });

  const categories = useMemo(() => {
    const menu = menuQuery.data?.menu ?? [];
    return ["All", ...new Set(menu.map((item) => item.category))];
  }, [menuQuery.data?.menu]);

  const visibleMenu = useMemo(() => {
    const menu = menuQuery.data?.menu ?? [];

    if (selectedCategory === "All") {
      return menu;
    }

    return menu.filter((item) => item.category === selectedCategory);
  }, [menuQuery.data?.menu, selectedCategory]);

  const selectedRestaurant = useMemo(
    () =>
      restaurantsQuery.data?.restaurants.find(
        (restaurant) => restaurant.id === selectedRestaurantId,
      ),
    [restaurantsQuery.data?.restaurants, selectedRestaurantId],
  );

  const draftTotalPaise = draftItems.reduce(
    (total, item) => total + item.menuItem.pricePaise * item.quantity,
    0,
  );

  const createSessionMutation = useMutation({
    mutationFn: createSession,
    onSuccess: ({ session }) => {
      setSessionId(session.id);
      setParticipant(null);
      setDraftItems([]);
      toast.success("Session opened");
    },
    onError: (error) => toast.error(error.message),
  });

  const joinSessionMutation = useMutation({
    mutationFn: ({ displayName }: { displayName: string }) =>
      joinSession(sessionId, { displayName }),
    onSuccess: ({ participant: joined, session }) => {
      setParticipant(joined);
      queryClient.setQueryData(["session", session.id], { session });
      toast.success("Joined");
    },
    onError: (error) => toast.error(error.message),
  });

  const submitDraftMutation = useMutation({
    mutationFn: async ({
      items,
      participantId,
    }: {
      items: DraftItem[];
      participantId: string;
    }) => {
      let latestSession: KapiSession | null = null;

      for (const item of items) {
        const result = await submitItem(sessionId, {
          participantId,
          menuItemId: item.menuItem.id,
          quantity: item.quantity,
        });
        latestSession = result.session;
      }

      return latestSession;
    },
    onSuccess: (session) => {
      if (session) {
        queryClient.setQueryData(["session", session.id], { session });
      }

      setDraftItems([]);
      toast.success("Submitted to group cart");
    },
    onError: (error) => toast.error(error.message),
  });

  const lockSessionMutation = useMutation({
    mutationFn: () => lockSession(sessionId),
    onSuccess: ({ session }) => {
      queryClient.setQueryData(["session", session.id], { session });
      toast.success("Session locked");
    },
    onError: (error) => toast.error(error.message),
  });

  const addDraftItem = (menuItem: MenuItem) => {
    setDraftItems((items) => {
      const existing = items.find((item) => item.menuItem.id === menuItem.id);

      if (existing) {
        return items.map((item) =>
          item.menuItem.id === menuItem.id
            ? { ...item, quantity: Math.min(item.quantity + 1, 20) }
            : item,
        );
      }

      return [...items, { menuItem, quantity: 1 }];
    });
  };

  const changeDraftQuantity = (menuItemId: string, delta: number) => {
    setDraftItems((items) =>
      items
        .map((item) =>
          item.menuItem.id === menuItemId
            ? { ...item, quantity: item.quantity + delta }
            : item,
        )
        .filter((item) => item.quantity > 0),
    );
  };

  const submitDraft = () => {
    if (!participant) {
      toast.error("Join first");
      return;
    }

    submitDraftMutation.mutate({
      items: draftItems,
      participantId: participant.id,
    });
  };

  return (
    <main className="min-h-screen bg-muted/40">
      <Toaster />
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-4 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-3 rounded-4xl bg-background px-5 py-4 shadow-sm ring-1 ring-border/80 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-normal">Kapi.run</h1>
            <p className="text-sm text-muted-foreground">
              Build a group cart before it goes to Swiggy.
            </p>
          </div>
          <SessionStatus session={activeSession} />
        </header>

        <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="flex min-w-0 flex-col gap-5">
            <RestaurantRail
              isLoading={restaurantsQuery.isLoading}
              restaurants={restaurantsQuery.data?.restaurants ?? []}
              selectedRestaurantId={activeRestaurantId}
              session={activeSession}
              onSelect={(restaurantId) => {
                setSelectedRestaurantId(restaurantId);
                setDraftItems([]);
                setSelectedCategory("All");
              }}
            />

            <MenuSection
              categories={categories}
              draftItems={draftItems}
              isLoading={menuQuery.isLoading}
              menu={visibleMenu}
              selectedCategory={selectedCategory}
              session={activeSession}
              onAdd={addDraftItem}
              onCategoryChange={setSelectedCategory}
            />
          </div>

          <aside className="flex flex-col gap-5 xl:sticky xl:top-4 xl:self-start">
            <OrganizerPanel
              isPending={createSessionMutation.isPending}
              restaurant={selectedRestaurant}
              session={activeSession}
              onCreate={(restaurantId, cutoffMinutes) =>
                createSessionMutation.mutate({ restaurantId, cutoffMinutes })
              }
            />
            <JoinPanel
              isPending={joinSessionMutation.isPending}
              participant={participant}
              sessionId={sessionId}
              onJoin={(displayName) => joinSessionMutation.mutate({ displayName })}
              onSessionIdChange={setSessionId}
            />
            <DraftCart
              draftItems={draftItems}
              isSubmitting={submitDraftMutation.isPending}
              participant={participant}
              session={activeSession}
              totalPaise={draftTotalPaise}
              onQuantityChange={changeDraftQuantity}
              onSubmit={submitDraft}
            />
            <ReviewPanel
              isLocking={lockSessionMutation.isPending || submitDraftMutation.isPending}
              session={activeSession}
              onLock={() => lockSessionMutation.mutate()}
            />
          </aside>
        </section>
      </div>
    </main>
  );
}

function SessionStatus({ session }: { session?: KapiSession }) {
  if (!session) {
    return <Badge variant="outline">No session</Badge>;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge>{session.state}</Badge>
      <Badge variant="secondary">
        <ClockIcon data-icon="inline-start" />
        {new Date(session.cutoffAt).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })}
      </Badge>
      <Badge variant="secondary">
        <UsersIcon data-icon="inline-start" />
        {session.participants.length}
      </Badge>
    </div>
  );
}

function RestaurantRail({
  isLoading,
  restaurants,
  selectedRestaurantId,
  session,
  onSelect,
}: {
  isLoading: boolean;
  restaurants: Restaurant[];
  selectedRestaurantId: string;
  session?: KapiSession;
  onSelect: (restaurantId: string) => void;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Restaurants</h2>
        {session && <Badge variant="secondary">{session.restaurant.name}</Badge>}
      </div>
      {isLoading ? (
        <div className="grid gap-3 md:grid-cols-3">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-3">
          {restaurants.map((restaurant) => {
            const isSelected = restaurant.id === selectedRestaurantId;

            return (
              <button
                key={restaurant.id}
                className={`group overflow-hidden rounded-4xl bg-background text-left shadow-sm ring-1 transition hover:-translate-y-0.5 hover:shadow-md ${
                  isSelected ? "ring-primary" : "ring-border/80"
                }`}
                disabled={!!session}
                type="button"
                onClick={() => onSelect(restaurant.id)}
              >
                <img
                  alt=""
                  className="h-32 w-full object-cover"
                  src={restaurant.imageUrl}
                />
                <span className="flex flex-col gap-2 p-4">
                  <span className="flex items-start justify-between gap-3">
                    <span className="flex flex-col gap-1">
                      <span className="font-medium">{restaurant.name}</span>
                      <span className="text-sm text-muted-foreground">{restaurant.cuisine}</span>
                    </span>
                    <Badge variant={isSelected ? "default" : "secondary"}>
                      <StarIcon data-icon="inline-start" />
                      {restaurant.rating.toFixed(1)}
                    </Badge>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {restaurant.locality} · {restaurant.etaMinutes} min
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

function MenuSection({
  categories,
  draftItems,
  isLoading,
  menu,
  selectedCategory,
  session,
  onAdd,
  onCategoryChange,
}: {
  categories: string[];
  draftItems: DraftItem[];
  isLoading: boolean;
  menu: MenuItem[];
  selectedCategory: string;
  session?: KapiSession;
  onAdd: (menuItem: MenuItem) => void;
  onCategoryChange: (category: string) => void;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 rounded-4xl bg-background p-4 shadow-sm ring-1 ring-border/80">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold">Menu</h2>
          <p className="text-sm text-muted-foreground">
            {session?.restaurant.name ?? "Choose a restaurant, then open a cart."}
          </p>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {categories.map((category) => (
            <Button
              key={category}
              size="sm"
              type="button"
              variant={category === selectedCategory ? "default" : "outline"}
              onClick={() => onCategoryChange(category)}
            >
              {category}
            </Button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-3 md:grid-cols-2">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {menu.map((item) => {
            const draftQuantity =
              draftItems.find((draftItem) => draftItem.menuItem.id === item.id)?.quantity ?? 0;

            return (
              <article
                key={item.id}
                className="grid min-h-44 grid-cols-[132px_minmax(0,1fr)] overflow-hidden rounded-4xl bg-background shadow-sm ring-1 ring-border/80"
              >
                <img alt="" className="h-full w-full object-cover" src={item.imageUrl} />
                <div className="flex min-w-0 flex-col justify-between gap-4 p-4">
                  <div className="flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 flex-col gap-1">
                        <h3 className="truncate text-base font-medium">{item.name}</h3>
                        <p className="line-clamp-2 text-sm text-muted-foreground">
                          {item.description}
                        </p>
                      </div>
                      <Badge variant={item.isVeg ? "secondary" : "outline"}>
                        {item.isVeg ? "Veg" : "Non-veg"}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                      <span>{formatMoney(item.pricePaise)}</span>
                      {item.isBestseller && <Badge variant="secondary">Bestseller</Badge>}
                    </div>
                  </div>
                  <Button
                    disabled={!session || session.state !== "open"}
                    type="button"
                    variant={draftQuantity ? "secondary" : "default"}
                    onClick={() => onAdd(item)}
                  >
                    <PlusIcon data-icon="inline-start" />
                    {draftQuantity ? `${draftQuantity} in draft` : "Add"}
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function OrganizerPanel({
  isPending,
  restaurant,
  session,
  onCreate,
}: {
  isPending: boolean;
  restaurant?: Restaurant;
  session?: KapiSession;
  onCreate: (restaurantId: string, cutoffMinutes: number) => void;
}) {
  const [cutoffMinutes, setCutoffMinutes] = useState(30);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Organizer</CardTitle>
        <CardDescription>{session?.id ?? restaurant?.name ?? "No restaurant"}</CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="cutoff">Cutoff minutes</FieldLabel>
            <Input
              id="cutoff"
              max={180}
              min={5}
              type="number"
              value={cutoffMinutes}
              onChange={(event) => setCutoffMinutes(Number(event.target.value))}
            />
            <FieldDescription>Locks participant changes at cutoff.</FieldDescription>
          </Field>
          <Button
            disabled={!restaurant || !!session || isPending}
            type="button"
            onClick={() => restaurant && onCreate(restaurant.id, cutoffMinutes)}
          >
            Open group cart
          </Button>
        </FieldGroup>
      </CardContent>
    </Card>
  );
}

function JoinPanel({
  isPending,
  participant,
  sessionId,
  onJoin,
  onSessionIdChange,
}: {
  isPending: boolean;
  participant: Participant | null;
  sessionId: string;
  onJoin: (displayName: string) => void;
  onSessionIdChange: (sessionId: string) => void;
}) {
  const [displayName, setDisplayName] = useState("");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Participant</CardTitle>
        <CardDescription>{participant?.displayName ?? "Join the cart"}</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onJoin(displayName);
          }}
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="session-id">Session id</FieldLabel>
              <Input
                id="session-id"
                value={sessionId}
                onChange={(event) => onSessionIdChange(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="display-name">Name</FieldLabel>
              <Input
                id="display-name"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
              />
            </Field>
            <Button disabled={!sessionId || !displayName || isPending} type="submit">
              Join
            </Button>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}

function DraftCart({
  draftItems,
  isSubmitting,
  participant,
  session,
  totalPaise,
  onQuantityChange,
  onSubmit,
}: {
  draftItems: DraftItem[];
  isSubmitting: boolean;
  participant: Participant | null;
  session?: KapiSession;
  totalPaise: number;
  onQuantityChange: (menuItemId: string, delta: number) => void;
  onSubmit: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Draft cart</CardTitle>
        <CardDescription>{participant?.displayName ?? "Not joined"}</CardDescription>
        <CardAction>
          <Badge variant="secondary">{formatMoney(totalPaise)}</Badge>
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-3">
          {draftItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">No draft items.</p>
          ) : (
            draftItems.map((item) => (
              <div
                key={item.menuItem.id}
                className="grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3"
              >
                <img alt="" className="size-11 rounded-2xl object-cover" src={item.menuItem.imageUrl} />
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="truncate text-sm font-medium">{item.menuItem.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatMoney(item.menuItem.pricePaise)}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    aria-label={`Decrease ${item.menuItem.name}`}
                    size="icon-xs"
                    type="button"
                    variant="outline"
                    onClick={() => onQuantityChange(item.menuItem.id, -1)}
                  >
                    <MinusIcon data-icon="inline-start" />
                  </Button>
                  <span className="w-6 text-center text-sm">{item.quantity}</span>
                  <Button
                    aria-label={`Increase ${item.menuItem.name}`}
                    size="icon-xs"
                    type="button"
                    variant="outline"
                    onClick={() => onQuantityChange(item.menuItem.id, 1)}
                  >
                    <PlusIcon data-icon="inline-start" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
      <Separator />
      <CardFooter>
        <Button
          className="w-full"
          disabled={!participant || !session || session.state !== "open" || draftItems.length === 0 || isSubmitting}
          type="button"
          onClick={onSubmit}
        >
          <SendIcon data-icon="inline-start" />
          Submit items
        </Button>
      </CardFooter>
    </Card>
  );
}

function ReviewPanel({
  isLocking,
  session,
  onLock,
}: {
  isLocking: boolean;
  session?: KapiSession;
  onLock: () => void;
}) {
  const activeItems = session?.items.filter((item) => item.state !== "removed") ?? [];
  const participantCount = session?.participants.length ?? 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Group cart</CardTitle>
        <CardDescription>
          {participantCount} joined · {activeItems.length} submitted
        </CardDescription>
        <CardAction>
          <Badge variant="secondary">{formatMoney(session ? sessionTotalPaise(session) : 0)}</Badge>
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-3">
          {activeItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">No submitted items.</p>
          ) : (
            activeItems.map((item) => (
              <div
                key={item.id}
                className="grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3"
              >
                <img alt="" className="size-11 rounded-2xl object-cover" src={item.imageUrl} />
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="truncate text-sm font-medium">{item.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {item.participantName} · Qty {item.quantity}
                  </span>
                </div>
                <span className="text-sm">{formatMoney(item.quantity * item.unitPricePaise)}</span>
              </div>
            ))
          )}
        </div>
      </CardContent>
      <Separator />
      <CardFooter className="justify-between gap-3">
        <Badge variant={session?.state === "locked" ? "default" : "outline"}>
          {session?.state ?? "idle"}
        </Badge>
        <Button
          disabled={!session || session.state !== "open" || isLocking}
          type="button"
          variant="outline"
          onClick={onLock}
        >
          <LockIcon data-icon="inline-start" />
          Lock
        </Button>
      </CardFooter>
    </Card>
  );
}
