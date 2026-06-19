import cors from "@elysiajs/cors";
import { Elysia, t } from "elysia";
import { unlink } from "node:fs/promises";
import type { Address, MenuItem, Restaurant, SwiggyCartPayload } from "@kapi/spec";

const port = Number(process.env.PORT ?? 3001);
const publicWebUrl = process.env.KAPI_WEB_URL ?? "http://127.0.0.1:3000";
const redirectUri = process.env.SWIGGY_REDIRECT_URI ?? `http://localhost:${port}/auth/callback`;
const swiggyBase = "https://mcp.swiggy.com";
const swiggyFoodUrl = `${swiggyBase}/food`;
const tokenFile = ".kapi-swiggy-token.json";
const relayFile = ".kapi-session-relay.json";
const allowedOrigins = new Set([
  new URL(publicWebUrl).origin,
  "http://127.0.0.1:3000",
  "http://localhost:3000",
]);

type OAuthClient = { client_id: string };
type Token = { access_token: string; expires_at: number };
type ToolEnvelope = { success?: boolean; data?: unknown; message?: string; error?: { message?: string } };
type RelayStore = Record<string, { ciphertext: string; updatedAt: string }>;
type RelayWrite = { ciphertext: string; expectedUpdatedAt?: string | null };

const authStates = new Map<string, { codeVerifier: string; next: string }>();
const relay: RelayStore = await readJson<RelayStore>(relayFile, {});
let oauthClient: OAuthClient | null = null;
let token: Token | null = process.env.SWIGGY_MCP_ACCESS_TOKEN
  ? { access_token: process.env.SWIGGY_MCP_ACCESS_TOKEN, expires_at: Date.now() + 4 * 24 * 60 * 60 * 1000 }
  : await readJson<Token | null>(tokenFile, null);

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    return await Bun.file(path).json() as T;
  } catch {
    return fallback;
  }
}

async function writeJson(path: string, value: unknown) {
  await Bun.write(path, JSON.stringify(value));
}

async function saveToken(nextToken: Token | null) {
  token = nextToken;
  if (nextToken) await writeJson(tokenFile, nextToken);
  else await unlink(tokenFile).catch(() => {});
}

function assertConnected() {
  if (!token || token.expires_at <= Date.now() + 60_000) {
    throw Object.assign(new Error("Connect Swiggy to continue."), { status: 401 });
  }
  return token.access_token;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function isAllowedOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || allowedOrigins.has(origin);
}

function assertAllowedOrigin(request: Request) {
  if (!isAllowedOrigin(request)) {
    throw Object.assign(new Error("Origin not allowed."), { status: 403 });
  }
}

function randomBase64Url(bytes = 32) {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(bytes))).toString("base64url");
}

async function sha256Base64Url(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Buffer.from(digest).toString("base64url");
}

async function getOAuthClient() {
  if (oauthClient) return oauthClient;
  const response = await fetch(`${swiggyBase}/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_name: "Kapi.run Local",
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      scope: "mcp:tools",
    }),
  });
  if (!response.ok) throw new Error("Could not register Swiggy client.");
  oauthClient = await response.json() as OAuthClient;
  return oauthClient;
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function number(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function findArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  for (const key of ["addresses", "restaurants", "items", "cartItems", "categories", "data"]) {
    const found = findArray((value as Record<string, unknown>)[key]);
    if (found.length) return found;
  }
  return [];
}

function unwrapToolPayload(json: unknown): ToolEnvelope {
  const response = json as Record<string, unknown>;
  const result = response.result as Record<string, unknown> | undefined;
  if (result?.structuredContent) return result.structuredContent as ToolEnvelope;

  const content = result?.content;
  if (Array.isArray(content)) {
    const block = content.find((item) => typeof (item as { text?: unknown }).text === "string") as { text?: string } | undefined;
    if (block?.text) {
      try {
        return JSON.parse(block.text) as ToolEnvelope;
      } catch {
        return { data: block.text };
      }
    }
  }
  return (result ?? response) as ToolEnvelope;
}

async function parseMcpResponse(response: Response): Promise<ToolEnvelope> {
  const body = await response.text();
  if (!response.ok) throw Object.assign(new Error(response.status === 401 ? "Connect Swiggy to continue." : "Swiggy request failed."), { status: response.status });
  if (response.headers.get("content-type")?.includes("text/event-stream")) {
    const line = body.split("\n").find((candidate) => candidate.startsWith("data:"));
    if (!line) throw new Error("Swiggy returned an empty response.");
    return unwrapToolPayload(JSON.parse(line.slice(5).trim()));
  }
  return unwrapToolPayload(JSON.parse(body));
}

async function callSwiggyTool(name: string, args: Record<string, unknown> = {}) {
  const response = await fetch(swiggyFoodUrl, {
    method: "POST",
    headers: {
      "accept": "application/json, text/event-stream",
      "authorization": `Bearer ${assertConnected()}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: crypto.randomUUID(), method: "tools/call", params: { name, arguments: args } }),
  });
  const payload = await parseMcpResponse(response);
  if (payload.success === false) throw new Error(payload.error?.message ?? payload.message ?? "Swiggy request failed.");
  return payload.data ?? payload;
}

function normalizeAddress(raw: unknown): Address {
  const item = raw as Record<string, unknown>;
  const id = text(item.id, text(item.addressId));
  return {
    id,
    label: text(item.addressTag, text(item.addressCategory, "Address")),
    detail: text(item.addressLine, text(item.displayText, text(item.address))),
  };
}

function normalizeRestaurant(raw: unknown): Restaurant {
  const item = raw as Record<string, unknown>;
  return {
    id: text(item.id, text(item.restaurantId)),
    name: text(item.name, "Restaurant"),
    area: text(item.areaName, text(item.area, text(item.locality, text(item.displayText)))),
    rating: number(item.rating, number(item.avgRating)),
    totalRatings: text(item.totalRatings) || undefined,
    costForTwo: text(item.costForTwo) || undefined,
    distanceKm: typeof item.distanceKm === "number" ? item.distanceKm : undefined,
    deliveryTimeRange: text(item.deliveryTimeRange) || undefined,
    offer: text(item.offer) || undefined,
    imageUrl: text(item.imageUrl, text(item.cloudinaryImageId)) || undefined,
    availabilityStatus: text(item.availabilityStatus, "CLOSED").toUpperCase() === "OPEN" ? "OPEN" : "CLOSED",
  };
}

function flattenMenu(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw.flatMap(flattenMenu);
  if (!raw || typeof raw !== "object") return [];
  const item = raw as Record<string, unknown>;
  for (const key of ["items", "menuItems", "itemCards", "categories", "subCategories", "cards"]) {
    if (Array.isArray(item[key])) return flattenMenu(item[key]);
  }
  if ((item.id || item.itemId) && item.name) return [raw];
  return Object.values(item).flatMap(flattenMenu);
}

function normalizeMenuItem(raw: unknown, restaurantId: string): MenuItem {
  const item = raw as Record<string, unknown>;
  const price = typeof item.price === "object" && item.price
    ? number((item.price as Record<string, unknown>).value, number((item.price as Record<string, unknown>).amount))
    : number(item.price, number(item.defaultPrice));
  return {
    id: text(item.id, text(item.itemId)),
    restaurantId,
    name: text(item.name, "Menu item"),
    category: text(item.category, text(item.categoryName, "Menu")),
    description: text(item.description),
    price,
    imageUrl: text(item.imageUrl, text(item.cloudinaryImageId)) || undefined,
    tags: Array.isArray(item.tags) ? item.tags.filter((tag): tag is string => typeof tag === "string") : undefined,
    available: item.available !== false && item.inStock !== false,
    swiggyItemId: text(item.id, text(item.itemId)),
  };
}

const app = new Elysia()
  .use(cors({ origin: (request) => isAllowedOrigin(request) }))
  .onError(({ error }) => {
    const status = typeof (error as { status?: unknown }).status === "number" ? (error as { status: number }).status : 500;
    return jsonResponse({ error: error.message }, status);
  })
  .get("/", () => ({ name: "kapi.run", status: "ok", version: "5", providerMode: "swiggy" }))
  .get("/health", () => ({ status: "ok" }))
  .get("/auth/status", () => ({ connected: Boolean(token && token.expires_at > Date.now() + 60_000), expiresAt: token?.expires_at ?? null }))
  .get("/auth/start", async ({ query, request }) => {
    assertAllowedOrigin(request);
    const client = await getOAuthClient();
    const state = randomBase64Url(24);
    const codeVerifier = randomBase64Url(64);
    authStates.set(state, { codeVerifier, next: query.next ?? publicWebUrl });
    const url = new URL(`${swiggyBase}/auth/authorize`);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", client.client_id);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("code_challenge", await sha256Base64Url(codeVerifier));
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set("state", state);
    url.searchParams.set("scope", "mcp:tools");
    return Response.redirect(url.toString(), 302);
  }, { query: t.Object({ next: t.Optional(t.String()) }) })
  .get("/auth/callback", async ({ query, set }) => {
    const state = query.state ? authStates.get(query.state) : undefined;
    if (!query.code || !state) {
      set.status = 400;
      return "Swiggy connection failed.";
    }
    authStates.delete(query.state);
    const client = await getOAuthClient();
    const response = await fetch(`${swiggyBase}/auth/token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ grant_type: "authorization_code", code: query.code, code_verifier: state.codeVerifier, redirect_uri: redirectUri, client_id: client.client_id }),
    });
    if (!response.ok) {
      set.status = 400;
      return "Swiggy connection failed.";
    }
    const body = await response.json() as { access_token: string; expires_in?: number };
    await saveToken({ access_token: body.access_token, expires_at: Date.now() + (body.expires_in ?? 432000) * 1000 });
    return Response.redirect(state.next, 302);
  }, { query: t.Object({ code: t.Optional(t.String()), state: t.Optional(t.String()) }) })
  .post("/auth/logout", async ({ request }) => {
    assertAllowedOrigin(request);
    await saveToken(null);
    return { connected: false };
  })
  .get("/food/addresses", async () => {
    const data = await callSwiggyTool("get_addresses");
    return findArray(data).map(normalizeAddress).filter((address) => address.id);
  })
  .get("/food/restaurants", async ({ query }) => {
    const data = await callSwiggyTool("search_restaurants", { addressId: query.addressId, query: query.q });
    return findArray(data).map(normalizeRestaurant).filter((restaurant) => restaurant.id);
  }, { query: t.Object({ addressId: t.String(), q: t.String() }) })
  .get("/food/restaurants/:restaurantId/menu", async ({ params, query }) => {
    const data = await callSwiggyTool("get_restaurant_menu", { addressId: query.addressId, restaurantId: params.restaurantId, pageSize: 8 });
    return flattenMenu(data)
      .map((item) => normalizeMenuItem(item, params.restaurantId))
      .filter((item) => item.id && (!query.q || item.name.toLowerCase().includes(query.q.toLowerCase()) || item.category.toLowerCase().includes(query.q.toLowerCase())));
  }, {
    params: t.Object({ restaurantId: t.String() }),
    query: t.Object({ addressId: t.String(), q: t.Optional(t.String()) }),
  })
  .post("/food/cart/sync", async ({ body, request }) => {
    assertAllowedOrigin(request);
    const payload = body as SwiggyCartPayload;
    await callSwiggyTool("update_food_cart", payload);
    const cart = await callSwiggyTool("get_food_cart");
    return {
      status: "synced",
      message: "Swiggy cart updated. Review and pay in Swiggy.",
      swiggyCartTotal: number((cart as Record<string, unknown>).total),
      syncedItemCount: payload.cartItems.reduce((sum, item) => sum + item.quantity, 0),
      payload,
    };
  }, {
    body: t.Object({
      restaurantId: t.String(),
      addressId: t.String(),
      cartItems: t.Array(t.Object({ itemId: t.String(), quantity: t.Number() })),
    }),
  })
  .get("/relay/sessions/:sessionId", ({ params, set }) => {
    const record = relay[params.sessionId];
    if (!record) {
      set.status = 404;
      return { error: "Session not found." };
    }
    return record;
  }, { params: t.Object({ sessionId: t.String() }) })
  .put("/relay/sessions/:sessionId", async ({ params, body, request, set }) => {
    assertAllowedOrigin(request);
    const current = relay[params.sessionId];
    const expectedUpdatedAt = (body as RelayWrite).expectedUpdatedAt;
    if (current && !expectedUpdatedAt) {
      set.status = 409;
      return { error: "Session has changed. Refresh and try again.", updatedAt: current.updatedAt };
    }
    if (current && expectedUpdatedAt !== current.updatedAt) {
      set.status = 409;
      return { error: "Session has changed. Refresh and try again.", updatedAt: current.updatedAt };
    }
    relay[params.sessionId] = { ciphertext: (body as RelayWrite).ciphertext, updatedAt: new Date().toISOString() };
    await writeJson(relayFile, relay);
    return relay[params.sessionId];
  }, {
    params: t.Object({ sessionId: t.String() }),
    body: t.Object({ ciphertext: t.String(), expectedUpdatedAt: t.Optional(t.Nullable(t.String())) }),
  })
  .listen(port);

console.log(`Kapi API running at http://${app.server?.hostname}:${app.server?.port}`);

export type App = typeof app;
