import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import {
  createSessionInputSchema,
  getStubMenu,
  getStubRestaurant,
  joinSessionInputSchema,
  submitItemInputSchema,
  stubRestaurants,
  type KapiSession,
  type Participant,
  type ParticipantItem,
} from "@kapi/spec";
import * as v from "valibot";

const port = Number(process.env.PORT ?? 3001);
const sessions = new Map<string, KapiSession>();

function nowIso() {
  return new Date().toISOString();
}

function newId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

function assertSession(sessionId: string) {
  const session = sessions.get(sessionId);

  if (!session) {
    throw new Response("Session not found", { status: 404 });
  }

  if (session.state === "open" && Date.now() >= Date.parse(session.cutoffAt)) {
    session.state = "locked";
    session.items = session.items.map((item) =>
      item.state === "submitted" ? { ...item, state: "locked" } : item,
    );
  }

  return session;
}

function parseBody<TSchema extends v.GenericSchema>(schema: TSchema, body: unknown) {
  const result = v.safeParse(schema, body);

  if (!result.success) {
    throw new Response("Invalid request body", { status: 400 });
  }

  return result.output;
}

const app = new Elysia()
  .use(
    cors({
      origin: ["http://localhost:3000", "http://127.0.0.1:3000"],
    }),
  )
  .get("/", () => ({ name: "kapi-api", status: "ok" }))
  .get("/health", () => ({ status: "ok" }))
  .get("/restaurants", () => ({ restaurants: stubRestaurants.filter((restaurant) => restaurant.isOpen) }))
  .get("/restaurants/:restaurantId/menu", ({ params }) => ({
    menu: getStubMenu(params.restaurantId).filter((item) => item.isAvailable),
  }))
  .post("/sessions", ({ body }) => {
    const input = parseBody(createSessionInputSchema, body);
    const restaurant = getStubRestaurant(input.restaurantId);

    if (!restaurant || !restaurant.isOpen) {
      throw new Response("Restaurant not available", { status: 404 });
    }

    const createdAt = nowIso();
    const session: KapiSession = {
      id: newId("ses"),
      restaurant,
      cutoffAt: new Date(Date.now() + input.cutoffMinutes * 60_000).toISOString(),
      state: "open",
      createdAt,
      participants: [],
      items: [],
    };

    sessions.set(session.id, session);

    return { session };
  })
  .get("/sessions/:sessionId", ({ params }) => ({ session: assertSession(params.sessionId) }))
  .post("/sessions/:sessionId/join", ({ params, body }) => {
    const session = assertSession(params.sessionId);

    if (session.state !== "open") {
      throw new Response("Session is locked", { status: 409 });
    }

    const input = parseBody(joinSessionInputSchema, body);
    const participant: Participant = {
      id: newId("par"),
      displayName: input.displayName,
      joinedAt: nowIso(),
    };

    session.participants.push(participant);

    return { participant, session };
  })
  .post("/sessions/:sessionId/items", ({ params, body }) => {
    const session = assertSession(params.sessionId);

    if (session.state !== "open") {
      throw new Response("Session is locked", { status: 409 });
    }

    const input = parseBody(submitItemInputSchema, body);
    const participant = session.participants.find((entry) => entry.id === input.participantId);
    const menuItem = getStubMenu(session.restaurant.id).find((entry) => entry.id === input.menuItemId);

    if (!participant) {
      throw new Response("Participant not found", { status: 404 });
    }

    if (!menuItem || !menuItem.isAvailable) {
      throw new Response("Menu item not available", { status: 404 });
    }

    const item: ParticipantItem = {
      id: newId("itm"),
      participantId: participant.id,
      participantName: participant.displayName,
      menuItemId: menuItem.id,
      name: menuItem.name,
      category: menuItem.category,
      imageUrl: menuItem.imageUrl,
      quantity: input.quantity,
      unitPricePaise: menuItem.pricePaise,
      notes: input.notes,
      state: "submitted",
      submittedAt: nowIso(),
    };

    session.items.push(item);

    return { item, session };
  })
  .post("/sessions/:sessionId/lock", ({ params }) => {
    const session = assertSession(params.sessionId);
    session.state = "locked";
    session.items = session.items.map((item) =>
      item.state === "submitted" ? { ...item, state: "locked" } : item,
    );

    return { session };
  })
  .listen(port);

console.log(`Kapi API running at http://${app.server?.hostname}:${app.server?.port}`);

export type App = typeof app;
