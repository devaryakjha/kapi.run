import { cors } from "@elysiajs/cors";
import { Elysia, t } from "elysia";
import { chmod, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  Address,
  MenuItem,
  MenuCustomization,
  RelaySessionMetadata,
  RelayWritePayload,
  RelayWriteRole,
  Restaurant,
  SessionInvite,
  SwiggyCartPayload,
  SwiggyCartSummary,
  SwiggyCartToolPayload,
} from "@kapi/spec";

const port = Number(process.env.PORT ?? 3001);
const publicWebUrl = process.env.KAPI_WEB_URL ?? "http://127.0.0.1:3000";
const redirectUri =
  process.env.SWIGGY_REDIRECT_URI ?? `http://127.0.0.1:${port}/auth/callback`;
const swiggyBase = "https://mcp.swiggy.com";
const swiggyFoodUrl = `${swiggyBase}/food`;
const publicWebOrigin = new URL(publicWebUrl).origin;
const swiggyOwnerCookieName = "kapi_swiggy_owner";
const dataDir = process.env.KAPI_DATA_DIR;
const tokenFile = dataDir
  ? join(dataDir, ".kapi-swiggy-token.json")
  : ".kapi-swiggy-token.json";
const relayFile = dataDir
  ? join(dataDir, ".kapi-session-relay.json")
  : ".kapi-session-relay.json";
const inviteFile = dataDir
  ? join(dataDir, ".kapi-session-invites.json")
  : ".kapi-session-invites.json";
type BunRuntime = {
  file(path: string): { json(): Promise<unknown> };
  write(path: string, value: string): Promise<unknown>;
};
const bunRuntime = (globalThis as typeof globalThis & { Bun: BunRuntime }).Bun;
const allowedOrigins = new Set([
  publicWebOrigin,
  "http://127.0.0.1:3000",
  "http://localhost:3000",
]);

type OAuthClient = { client_id: string };
type Token = {
  access_token: string;
  expires_at: number;
  ownerSecretHash?: string;
};
type ToolEnvelope = {
  success?: boolean;
  successful?: boolean;
  data?: unknown;
  message?: string;
  error?: { message?: string };
};
export type RelayRecord = {
  ciphertext: string;
  updatedAt: string;
  metadata?: RelaySessionMetadata;
};
type RelayStore = Record<string, RelayRecord>;
type InviteStore = Record<string, SessionInvite>;
type RelayWrite = RelayWritePayload;
type StatusSetter = { status?: number | string };
type RequestContext = { request: Request };
type AuthStartContext = RequestContext & { query: { next?: string } };
type AuthCallbackContext = {
  query: { code?: string; state?: string };
  set: StatusSetter;
};
type RestaurantQueryContext = RequestContext & {
  query: { addressId: string; q: string; sessionId?: string };
};
type MenuQueryContext = RequestContext & {
  params: { restaurantId: string };
  query: { addressId: string; q?: string; sessionId?: string };
};
type MenuItemDetailQueryContext = RequestContext & {
  params: { restaurantId: string; itemId: string };
  query: { addressId: string; q?: string; sessionId?: string };
  set: StatusSetter;
};
type CartQueryContext = {
  query: { addressId: string; restaurantName?: string; sessionId?: string };
  request: Request;
};
type CartSyncContext = RequestContext & {
  body: SwiggyCartPayload;
  set: StatusSetter;
};
type RelayReadContext = { params: { sessionId: string }; set: StatusSetter };
type RelayWriteContext = RequestContext & {
  params: { sessionId: string };
  body: RelayWrite;
  set: StatusSetter;
};
type InviteCreateContext = RequestContext & {
  body: { sessionId: string; key: string };
};
type InviteReadContext = RequestContext & {
  params: { inviteId: string };
  set: StatusSetter;
};

const authStates = new Map<string, { codeVerifier: string; next: string }>();
const relay: RelayStore = await readJson<RelayStore>(relayFile, {});
const invites: InviteStore = await readJson<InviteStore>(inviteFile, {});
let oauthClient: OAuthClient | null = null;
let token: Token | null = process.env.SWIGGY_MCP_ACCESS_TOKEN
  ? {
      access_token: process.env.SWIGGY_MCP_ACCESS_TOKEN,
      expires_at: Date.now() + 4 * 24 * 60 * 60 * 1000,
      ...(process.env.KAPI_SWIGGY_OWNER_SECRET
        ? {
            ownerSecretHash: await sha256Base64Url(
              process.env.KAPI_SWIGGY_OWNER_SECRET,
            ),
          }
        : {}),
    }
  : await readTokenFromFile(tokenFile);

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    return (await bunRuntime.file(path).json()) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(path: string, value: unknown) {
  await bunRuntime.write(path, JSON.stringify(value));
}

export async function readTokenFromFile(path: string) {
  return readJson<Token | null>(path, null);
}

export async function saveTokenToFile(path: string, nextToken: Token | null) {
  if (nextToken) {
    await writeFile(path, JSON.stringify(nextToken), { mode: 0o600 });
    await chmod(path, 0o600);
  } else {
    await unlink(path).catch(() => {});
  }
}

async function saveToken(nextToken: Token | null) {
  token = nextToken;
  await saveTokenToFile(tokenFile, nextToken);
}

function assertConnected() {
  if (!token || token.expires_at <= Date.now() + 60_000) {
    throw Object.assign(new Error("Connect Swiggy to continue."), {
      status: 401,
    });
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

function safeReturnUrl(next: string | undefined) {
  if (!next) return publicWebUrl;
  try {
    const url = new URL(next, `${publicWebOrigin}/`);
    return allowedOrigins.has(url.origin) ? url.toString() : publicWebUrl;
  } catch {
    return publicWebUrl;
  }
}

function cookieValue(request: Request, name: string) {
  return (
    request.headers
      .get("cookie")
      ?.split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${name}=`))
      ?.slice(name.length + 1) ?? null
  );
}

function swiggyOwnerCookie(secret: string, maxAgeSeconds: number) {
  const secure = publicWebUrl.startsWith("https:") ? "; Secure" : "";
  return `${swiggyOwnerCookieName}=${encodeURIComponent(secret)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

async function hasSwiggyOwner(request: Request) {
  const secret = cookieValue(request, swiggyOwnerCookieName);
  if (!secret || !token?.ownerSecretHash) return false;
  return token.ownerSecretHash === (await sha256Base64Url(secret));
}

function hasSessionKeyProof(sessionId: string, sessionKey: string | null) {
  return Boolean(
    sessionKey &&
    Object.values(invites).some(
      (invite) => invite.sessionId === sessionId && invite.key === sessionKey,
    ),
  );
}

async function assertSwiggyReadAccess(
  request: Request,
  options: { sessionId?: string; allowSessionKey?: boolean } = {},
) {
  assertConnected();
  if (await hasSwiggyOwner(request)) return;

  const sessionId = options.sessionId;
  if (sessionId) {
    const record = relay[sessionId];
    if (
      await hasOrganizerProof(
        record?.metadata,
        request.headers.get("x-kapi-organizer-secret"),
      )
    )
      return;
    if (
      options.allowSessionKey === true &&
      hasSessionKeyProof(sessionId, request.headers.get("x-kapi-session-key"))
    )
      return;
  }

  throw Object.assign(new Error("Organizer access required."), { status: 403 });
}

function randomBase64Url(bytes = 32) {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(bytes))).toString(
    "base64url",
  );
}

async function sha256Base64Url(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Buffer.from(digest).toString("base64url");
}

function sanitizeRelayMetadata(
  metadata: RelayWrite["metadata"],
): RelaySessionMetadata | null {
  if (!metadata) return null;
  return {
    ...(typeof metadata.cutoffAt === "string"
      ? { cutoffAt: metadata.cutoffAt }
      : {}),
    status: metadata.status,
    ...(typeof metadata.organizerSecretHash === "string"
      ? { organizerSecretHash: metadata.organizerSecretHash }
      : {}),
  };
}

function isPastCutoff(metadata: RelaySessionMetadata, now = new Date()) {
  if (!metadata.cutoffAt) return false;
  const time = new Date(metadata.cutoffAt).getTime();
  return Number.isFinite(time) && time <= now.getTime();
}

async function hashOrganizerSecretForRelay(secret: string) {
  return sha256Base64Url(secret);
}

async function hasOrganizerProof(
  metadata: RelaySessionMetadata | undefined,
  secret: string | null,
) {
  if (!metadata?.organizerSecretHash || !secret) return false;
  return (
    metadata.organizerSecretHash === (await hashOrganizerSecretForRelay(secret))
  );
}

export async function authorizeCartSync(
  sessions: RelayStore,
  sessionId: string,
  organizerSecret: string | null,
) {
  return hasOrganizerProof(sessions[sessionId]?.metadata, organizerSecret);
}

export async function decideRelayWrite(
  current: RelayRecord | undefined,
  body: RelayWrite,
  organizerSecret: string | null,
) {
  const expectedUpdatedAt = body.expectedUpdatedAt;
  const role: RelayWriteRole =
    body.role === "organizer" ? "organizer" : "participant";
  if (current && !expectedUpdatedAt) {
    return {
      ok: false,
      status: 409,
      body: {
        error: "Session has changed. Refresh and try again.",
        updatedAt: current.updatedAt,
      },
    } as const;
  }
  if (current && expectedUpdatedAt !== current.updatedAt) {
    return {
      ok: false,
      status: 409,
      body: {
        error: "Session has changed. Refresh and try again.",
        updatedAt: current.updatedAt,
      },
    } as const;
  }

  if (!current) {
    const metadata = sanitizeRelayMetadata(body.metadata);
    if (!metadata)
      return {
        ok: false,
        status: 400,
        body: { error: "Session metadata is required." },
      } as const;
    if (
      role === "organizer" &&
      !(await hasOrganizerProof(metadata, organizerSecret))
    ) {
      return {
        ok: false,
        status: 403,
        body: { error: "Organizer proof is required." },
      } as const;
    }
    if (
      metadata.status !== "open" &&
      !(await hasOrganizerProof(metadata, organizerSecret))
    ) {
      return {
        ok: false,
        status: 403,
        body: { error: "Organizer proof is required." },
      } as const;
    }
    return { ok: true, metadata } as const;
  }

  if (role === "organizer") {
    if (!(await hasOrganizerProof(current.metadata, organizerSecret))) {
      return {
        ok: false,
        status: 403,
        body: { error: "Organizer proof is required." },
      } as const;
    }
    return {
      ok: true,
      metadata: sanitizeRelayMetadata(body.metadata) ?? current.metadata,
    } as const;
  }

  if (!current.metadata) {
    return {
      ok: false,
      status: 423,
      body: { error: "Session write policy metadata is missing." },
    } as const;
  }
  if (current.metadata.status !== "open" || isPastCutoff(current.metadata)) {
    return {
      ok: false,
      status: 423,
      body: { error: "Session is locked." },
    } as const;
  }
  return { ok: true, metadata: current.metadata } as const;
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
  oauthClient = (await response.json()) as OAuthClient;
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
  for (const key of [
    "addresses",
    "restaurants",
    "items",
    "cartItems",
    "categories",
    "data",
  ]) {
    const found = findArray((value as Record<string, unknown>)[key]);
    if (found.length) return found;
  }
  return [];
}

function firstText(value: unknown, keys: string[]): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const item = value as Record<string, unknown>;
  for (const key of keys) {
    const found = text(item[key]);
    if (found) return found;
  }
  for (const nested of Object.values(item)) {
    const found = firstText(nested, keys);
    if (found) return found;
  }
}

function firstPositiveNumber(
  value: unknown,
  keys: string[],
): number | undefined {
  if (!value || typeof value !== "object") return undefined;
  const item = value as Record<string, unknown>;
  for (const key of keys) {
    if (number(item[key], -1) > 0) return number(item[key]);
  }
  for (const nested of Object.values(item)) {
    const found = firstPositiveNumber(nested, keys);
    if (found !== undefined) return found;
  }
}

function firstItemCount(value: unknown): number | undefined {
  if (!value || typeof value !== "object") return undefined;
  const item = value as Record<string, unknown>;
  for (const key of ["itemCount", "itemsCount", "quantity", "totalQuantity"]) {
    if (typeof item[key] === "number" && Number.isFinite(item[key]))
      return item[key];
  }
  for (const key of [
    "items",
    "cartItems",
    "lineItems",
    "itemDetails",
    "products",
  ]) {
    if (Array.isArray(item[key])) return item[key].length;
    const found = firstItemCount(item[key]);
    if (found !== undefined) return found;
  }
  for (const nested of Object.values(item)) {
    const found = firstItemCount(nested);
    if (found !== undefined) return found;
  }
}

function normalizeCartSummary(raw: unknown): SwiggyCartSummary {
  const cartData =
    raw && typeof raw === "object" && "data" in raw
      ? (raw as { data?: unknown }).data
      : raw;
  const itemCount = firstItemCount(cartData);
  return {
    empty: itemCount === undefined ? true : itemCount === 0,
    restaurantId: firstText(cartData, [
      "restaurantId",
      "restaurant_id",
      "storeId",
    ]),
    restaurantName: firstText(cartData, [
      "restaurantName",
      "restaurant_name",
      "name",
    ]),
    total: firstPositiveNumber(cartData, [
      "total",
      "totalAmount",
      "subtotal",
      "cartTotal",
    ]),
    itemCount: itemCount && itemCount > 0 ? itemCount : undefined,
  };
}

function toSwiggyCartToolPayload(
  payload: SwiggyCartPayload,
): SwiggyCartToolPayload & Record<string, unknown> {
  return {
    restaurantId: payload.restaurantId,
    ...(payload.restaurantName
      ? { restaurantName: payload.restaurantName }
      : {}),
    addressId: payload.addressId,
    cartItems: payload.cartItems.map((item) => ({
      menu_item_id: item.menu_item_id,
      quantity: item.quantity,
      ...(item.variantsV2?.length ? { variantsV2: item.variantsV2 } : {}),
      ...(item.addons?.length ? { addons: item.addons } : {}),
    })),
  };
}

function unwrapToolPayload(json: unknown): ToolEnvelope {
  const response = json as Record<string, unknown>;
  const result = response.result as Record<string, unknown> | undefined;
  if (result?.structuredContent)
    return result.structuredContent as ToolEnvelope;

  const content = result?.content;
  if (Array.isArray(content)) {
    const block = content.find(
      (item) => typeof (item as { text?: unknown }).text === "string",
    ) as { text?: string } | undefined;
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
  if (!response.ok)
    throw Object.assign(
      new Error(
        response.status === 401
          ? "Connect Swiggy to continue."
          : "Swiggy request failed.",
      ),
      { status: response.status },
    );
  if (response.headers.get("content-type")?.includes("text/event-stream")) {
    const line = body
      .split("\n")
      .find((candidate) => candidate.startsWith("data:"));
    if (!line) throw new Error("Swiggy returned an empty response.");
    return unwrapToolPayload(JSON.parse(line.slice(5).trim()));
  }
  return unwrapToolPayload(JSON.parse(body));
}

async function callSwiggyTool(
  name: string,
  args: Record<string, unknown> = {},
) {
  const response = await fetch(swiggyFoodUrl, {
    method: "POST",
    headers: {
      accept: "application/json, text/event-stream",
      authorization: `Bearer ${assertConnected()}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });
  const payload = await parseMcpResponse(response);
  if (payload.success === false || payload.successful === false)
    throw new Error(
      payload.error?.message ?? payload.message ?? "Swiggy request failed.",
    );
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
    area: text(
      item.areaName,
      text(item.area, text(item.locality, text(item.displayText))),
    ),
    rating: number(item.rating, number(item.avgRating)),
    totalRatings: text(item.totalRatings) || undefined,
    costForTwo: text(item.costForTwo) || undefined,
    distanceKm:
      typeof item.distanceKm === "number" ? item.distanceKm : undefined,
    deliveryTimeRange: text(item.deliveryTimeRange) || undefined,
    offer: text(item.offer) || undefined,
    imageUrl: text(item.imageUrl, text(item.cloudinaryImageId)) || undefined,
    availabilityStatus:
      text(item.availabilityStatus, "CLOSED").toUpperCase() === "OPEN"
        ? "OPEN"
        : "CLOSED",
  };
}

function flattenMenu(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw.flatMap(flattenMenu);
  if (!raw || typeof raw !== "object") return [];
  const item = raw as Record<string, unknown>;
  for (const key of [
    "items",
    "menuItems",
    "itemCards",
    "categories",
    "subCategories",
    "cards",
  ]) {
    if (Array.isArray(item[key])) return flattenMenu(item[key]);
  }
  if ((item.id || item.itemId || item.menu_item_id) && item.name) return [raw];
  return Object.values(item).flatMap(flattenMenu);
}

function normalizeMenuItem(raw: unknown, restaurantId: string): MenuItem {
  const item = raw as Record<string, unknown>;
  const price =
    typeof item.price === "object" && item.price
      ? number(
          (item.price as Record<string, unknown>).value,
          number((item.price as Record<string, unknown>).amount),
        )
      : number(item.price, number(item.defaultPrice));
  return {
    id: text(item.id, text(item.itemId, text(item.menu_item_id))),
    restaurantId,
    name: text(item.name, "Menu item"),
    category: text(item.category, text(item.categoryName, "Menu")),
    description: text(item.description),
    price,
    imageUrl: text(item.imageUrl, text(item.cloudinaryImageId)) || undefined,
    rating: text(item.rating) || undefined,
    totalRatings: text(item.totalRatings) || undefined,
    hasVariants: item.hasVariants === true,
    hasAddons: item.hasAddons === true,
    tags: Array.isArray(item.tags)
      ? item.tags.filter((tag): tag is string => typeof tag === "string")
      : undefined,
    available:
      item.available !== false && item.inStock !== false && item.inStock !== 0,
    swiggyItemId: text(item.id, text(item.itemId, text(item.menu_item_id))),
  };
}

function normalizeCustomization(raw: unknown): MenuCustomization {
  const item = raw as Record<string, unknown>;
  return {
    menuItemId: text(item.menu_item_id, text(item.id, text(item.itemId))),
    description: text(item.description) || undefined,
    imageUrl: text(item.imageUrl, text(item.cloudinaryImageId)) || undefined,
    rating: text(item.rating) || undefined,
    totalRatings: text(item.totalRatings) || undefined,
    variantsV2: Array.isArray(item.variantsV2)
      ? item.variantsV2.flatMap((rawGroup) => {
          const group = rawGroup as Record<string, unknown>;
          const variations = Array.isArray(group.variations)
            ? group.variations.flatMap((rawVariation) => {
                const variation = rawVariation as Record<string, unknown>;
                const id = text(variation.id, text(variation.variation_id));
                if (!id) return [];
                return {
                  id,
                  name: text(variation.name, "Option"),
                  price: firstPositiveNumber(variation, ["price"]),
                  inStock:
                    variation.inStock === undefined
                      ? undefined
                      : variation.inStock !== 0 && variation.inStock !== false,
                  default:
                    variation.default === 1 || variation.default === true,
                };
              })
            : [];
          const groupId = text(group.groupId, text(group.group_id));
          return groupId && variations.length
            ? [
                {
                  groupId,
                  name: text(group.name, "Choose one"),
                  variations,
                },
              ]
            : [];
        })
      : undefined,
    addons: Array.isArray(item.addons)
      ? item.addons.flatMap((rawGroup) => {
          const group = rawGroup as Record<string, unknown>;
          const choices = Array.isArray(group.choices)
            ? group.choices.flatMap((rawChoice) => {
                const choice = rawChoice as Record<string, unknown>;
                const id = text(choice.id, text(choice.choice_id));
                if (!id) return [];
                return {
                  id,
                  name: text(choice.name, "Addon"),
                  price: number(choice.price),
                };
              })
            : [];
          const groupId = text(group.groupId, text(group.group_id));
          return groupId && choices.length
            ? [
                {
                  groupId,
                  groupName: text(group.groupName, text(group.name, "Addons")),
                  choices,
                  minAddons:
                    typeof group.minAddons === "number"
                      ? group.minAddons
                      : undefined,
                  maxAddons:
                    typeof group.maxAddons === "number"
                      ? group.maxAddons
                      : undefined,
                },
              ]
            : [];
        })
      : undefined,
  };
}

export const app = new Elysia()
  .use(
    cors({
      origin: (request: Request) => isAllowedOrigin(request),
      credentials: true,
    }),
  )
  .onError(({ error }) => {
    const status =
      typeof (error as { status?: unknown }).status === "number"
        ? (error as { status: number }).status
        : 500;
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Request failed." },
      status,
    );
  })
  .get("/", () => ({
    name: "kapi.run",
    status: "ok",
    version: "5",
    providerMode: "swiggy",
  }))
  .get("/health", () => ({ status: "ok" }))
  .get("/auth/status", async ({ request }: RequestContext) => ({
    connected: Boolean(
      token &&
      token.expires_at > Date.now() + 60_000 &&
      (await hasSwiggyOwner(request)),
    ),
    expiresAt: token?.expires_at ?? null,
  }))
  .get(
    "/auth/start",
    async ({ query, request }: AuthStartContext) => {
      assertAllowedOrigin(request);
      const client = await getOAuthClient();
      const state = randomBase64Url(24);
      const codeVerifier = randomBase64Url(64);
      authStates.set(state, { codeVerifier, next: safeReturnUrl(query.next) });
      const url = new URL(`${swiggyBase}/auth/authorize`);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("client_id", client.client_id);
      url.searchParams.set("redirect_uri", redirectUri);
      url.searchParams.set(
        "code_challenge",
        await sha256Base64Url(codeVerifier),
      );
      url.searchParams.set("code_challenge_method", "S256");
      url.searchParams.set("state", state);
      url.searchParams.set("scope", "mcp:tools");
      return Response.redirect(url.toString(), 302);
    },
    { query: t.Object({ next: t.Optional(t.String()) }) },
  )
  .get(
    "/auth/callback",
    async ({ query, set }: AuthCallbackContext) => {
      const stateKey = query.state;
      if (!query.code || !stateKey) {
        set.status = 400;
        return "Swiggy connection failed.";
      }
      const state = authStates.get(stateKey);
      if (!state) {
        set.status = 400;
        return "Swiggy connection failed.";
      }
      authStates.delete(stateKey);
      const client = await getOAuthClient();
      const response = await fetch(`${swiggyBase}/auth/token`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          grant_type: "authorization_code",
          code: query.code,
          code_verifier: state.codeVerifier,
          redirect_uri: redirectUri,
          client_id: client.client_id,
        }),
      });
      if (!response.ok) {
        set.status = 400;
        return "Swiggy connection failed.";
      }
      const body = (await response.json()) as {
        access_token: string;
        expires_in?: number;
      };
      const expiresIn = body.expires_in ?? 432000;
      const ownerSecret = randomBase64Url(32);
      await saveToken({
        access_token: body.access_token,
        expires_at: Date.now() + expiresIn * 1000,
        ownerSecretHash: await sha256Base64Url(ownerSecret),
      });
      const redirect = Response.redirect(state.next, 302);
      redirect.headers.append(
        "set-cookie",
        swiggyOwnerCookie(ownerSecret, expiresIn),
      );
      return redirect;
    },
    {
      query: t.Object({
        code: t.Optional(t.String()),
        state: t.Optional(t.String()),
      }),
    },
  )
  .post("/auth/logout", async ({ request }: RequestContext) => {
    assertAllowedOrigin(request);
    await saveToken(null);
    const response = jsonResponse({ connected: false });
    response.headers.append("set-cookie", swiggyOwnerCookie("", 0));
    return response;
  })
  .get("/food/addresses", async ({ request }: RequestContext) => {
    await assertSwiggyReadAccess(request);
    const data = await callSwiggyTool("get_addresses");
    return findArray(data)
      .map(normalizeAddress)
      .filter((address) => address.id);
  })
  .get(
    "/food/restaurants",
    async ({ query, request }: RestaurantQueryContext) => {
      await assertSwiggyReadAccess(request, { sessionId: query.sessionId });
      const data = await callSwiggyTool("search_restaurants", {
        addressId: query.addressId,
        query: query.q,
      });
      return findArray(data)
        .map(normalizeRestaurant)
        .filter((restaurant) => restaurant.id);
    },
    {
      query: t.Object({
        addressId: t.String(),
        q: t.String(),
        sessionId: t.Optional(t.String()),
      }),
    },
  )
  .get(
    "/food/restaurants/:restaurantId/menu",
    async ({ params, query, request }: MenuQueryContext) => {
      await assertSwiggyReadAccess(request, {
        sessionId: query.sessionId,
        allowSessionKey: true,
      });
      const data = await callSwiggyTool("get_restaurant_menu", {
        addressId: query.addressId,
        restaurantId: params.restaurantId,
        pageSize: 8,
      });
      return flattenMenu(data)
        .map((item) => normalizeMenuItem(item, params.restaurantId))
        .filter(
          (item) =>
            item.id &&
            (!query.q ||
              item.name.toLowerCase().includes(query.q.toLowerCase()) ||
              item.category.toLowerCase().includes(query.q.toLowerCase())),
        );
    },
    {
      params: t.Object({ restaurantId: t.String() }),
      query: t.Object({
        addressId: t.String(),
        q: t.Optional(t.String()),
        sessionId: t.Optional(t.String()),
      }),
    },
  )
  .get(
    "/food/restaurants/:restaurantId/menu/:itemId/customization",
    async ({ params, query, request, set }: MenuItemDetailQueryContext) => {
      await assertSwiggyReadAccess(request, {
        sessionId: query.sessionId,
        allowSessionKey: true,
      });
      const data = await callSwiggyTool("search_menu", {
        addressId: query.addressId,
        query: query.q || params.itemId,
        restaurantIdOfAddedItem: params.restaurantId,
      });
      const items = findArray(data);
      const match =
        items.find((raw) => {
          const item = raw as Record<string, unknown>;
          return (
            text(item.menu_item_id, text(item.id, text(item.itemId))) ===
            params.itemId
          );
        }) ?? items[0];
      if (!match) {
        set.status = 404;
        return { error: "Menu item customization not found." };
      }
      return normalizeCustomization(match);
    },
    {
      params: t.Object({ restaurantId: t.String(), itemId: t.String() }),
      query: t.Object({
        addressId: t.String(),
        q: t.Optional(t.String()),
        sessionId: t.Optional(t.String()),
      }),
    },
  )
  .get(
    "/food/cart",
    async ({ query, request }: CartQueryContext) => {
      await assertSwiggyReadAccess(request, { sessionId: query.sessionId });
      const cart = await callSwiggyTool("get_food_cart", {
        addressId: query.addressId,
        ...(query.restaurantName
          ? { restaurantName: query.restaurantName }
          : {}),
      });
      return normalizeCartSummary(cart);
    },
    {
      query: t.Object({
        addressId: t.String(),
        restaurantName: t.Optional(t.String()),
        sessionId: t.Optional(t.String()),
      }),
    },
  )
  .post(
    "/food/cart/sync",
    async ({ body, request, set }: CartSyncContext) => {
      assertAllowedOrigin(request);
      const payload = body;
      if (
        !(await authorizeCartSync(
          relay,
          payload.sessionId,
          request.headers.get("x-kapi-organizer-secret"),
        ))
      ) {
        set.status = 403;
        return { error: "Only the organiser can sync the Swiggy cart." };
      }
      const existingCart = normalizeCartSummary(
        await callSwiggyTool("get_food_cart", {
          addressId: payload.addressId,
          ...(payload.restaurantName
            ? { restaurantName: payload.restaurantName }
            : {}),
        }),
      );
      if (!existingCart.empty && payload.replaceExistingCart !== true) {
        set.status = 409;
        return {
          error:
            "Swiggy cart already has items. Confirm replacement before syncing.",
          cart: existingCart,
        };
      }
      if (!existingCart.empty && payload.replaceExistingCart === true) {
        await callSwiggyTool("flush_food_cart");
      }
      await callSwiggyTool(
        "update_food_cart",
        toSwiggyCartToolPayload(payload),
      );
      const cart = normalizeCartSummary(
        await callSwiggyTool("get_food_cart", {
          addressId: payload.addressId,
          ...(payload.restaurantName
            ? { restaurantName: payload.restaurantName }
            : {}),
        }),
      );
      const syncedItemCount = payload.cartItems.reduce(
        (sum, item) => sum + item.quantity,
        0,
      );
      if (syncedItemCount > 0 && cart.empty) {
        throw new Error(
          "Swiggy did not return the synced cart. Open Swiggy and check the cart, then try again.",
        );
      }
      return {
        status: "synced",
        message: "Swiggy cart updated. Review and pay in Swiggy.",
        swiggyCartTotal: cart.total,
        syncedItemCount,
        payload,
      };
    },
    {
      body: t.Object({
        sessionId: t.String(),
        restaurantId: t.String(),
        restaurantName: t.Optional(t.String()),
        addressId: t.String(),
        replaceExistingCart: t.Optional(t.Boolean()),
        cartItems: t.Array(
          t.Object({
            menu_item_id: t.String(),
            quantity: t.Number(),
            variantsV2: t.Optional(
              t.Array(
                t.Object({
                  group_id: t.String(),
                  variation_id: t.String(),
                }),
              ),
            ),
            addons: t.Optional(
              t.Array(
                t.Object({
                  group_id: t.String(),
                  choice_id: t.String(),
                }),
              ),
            ),
          }),
        ),
      }),
    },
  )
  .get(
    "/relay/sessions/:sessionId",
    ({ params, set }: RelayReadContext) => {
      const record = relay[params.sessionId];
      if (!record) {
        set.status = 404;
        return { error: "Session not found." };
      }
      return record;
    },
    { params: t.Object({ sessionId: t.String() }) },
  )
  .post(
    "/relay/invites",
    async ({ body, request }: InviteCreateContext) => {
      assertAllowedOrigin(request);
      const id = randomBase64Url(16);
      invites[id] = {
        id,
        sessionId: body.sessionId,
        key: body.key,
        createdAt: new Date().toISOString(),
      };
      await writeJson(inviteFile, invites);
      return invites[id];
    },
    {
      body: t.Object({
        sessionId: t.String(),
        key: t.String(),
      }),
    },
  )
  .get(
    "/relay/invites/:inviteId",
    ({ params, request, set }: InviteReadContext) => {
      assertAllowedOrigin(request);
      const invite = invites[params.inviteId];
      if (!invite) {
        set.status = 404;
        return { error: "Invite not found." };
      }
      return invite;
    },
    { params: t.Object({ inviteId: t.String() }) },
  )
  .put(
    "/relay/sessions/:sessionId",
    async ({ params, body, request, set }: RelayWriteContext) => {
      assertAllowedOrigin(request);
      const current = relay[params.sessionId];
      const decision = await decideRelayWrite(
        current,
        body,
        request.headers.get("x-kapi-organizer-secret"),
      );
      if (!decision.ok) {
        set.status = decision.status;
        return decision.body;
      }

      relay[params.sessionId] = {
        ciphertext: body.ciphertext,
        updatedAt: new Date().toISOString(),
        metadata: decision.metadata,
      };
      await writeJson(relayFile, relay);
      return relay[params.sessionId];
    },
    {
      params: t.Object({ sessionId: t.String() }),
      body: t.Object({
        ciphertext: t.String(),
        expectedUpdatedAt: t.Optional(t.Nullable(t.String())),
        metadata: t.Optional(
          t.Object({
            cutoffAt: t.Optional(t.String()),
            status: t.Union([
              t.Literal("open"),
              t.Literal("locked"),
              t.Literal("syncing"),
              t.Literal("synced"),
              t.Literal("sync_failed"),
              t.Literal("closed"),
            ]),
            organizerSecretHash: t.Optional(t.String()),
          }),
        ),
        role: t.Optional(
          t.Union([t.Literal("organizer"), t.Literal("participant")]),
        ),
      }),
    },
  );
if (import.meta.main) {
  app.listen(port);
  console.log(
    `Kapi API running at http://${app.server?.hostname}:${app.server?.port}`,
  );
}

export type App = typeof app;
