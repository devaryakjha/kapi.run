import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const publicWebUrl = "http://127.0.0.1:3000";
let app: import("./index.js").App;
let dataDir: string;
let originalFetch: typeof fetch;
const swiggyCalls: Array<{ body: Record<string, unknown>; headers: Headers }> =
  [];

function base64Url(bytes: ArrayBuffer) {
  return Buffer.from(bytes).toString("base64url");
}

async function hash(value: string) {
  return base64Url(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
}

function requestUrl(input: Parameters<typeof fetch>[0]) {
  return typeof input === "string"
    ? input
    : input instanceof Request
      ? input.url
      : input.toString();
}

beforeAll(async () => {
  originalFetch = globalThis.fetch;
  dataDir = await mkdtemp(join(tmpdir(), "kapi-api-test-"));
  process.env.KAPI_DATA_DIR = dataDir;
  process.env.KAPI_WEB_URL = publicWebUrl;
  process.env.SWIGGY_REDIRECT_URI = "http://127.0.0.1:3001/auth/callback";
  process.env.SWIGGY_MCP_ACCESS_TOKEN = "test-swiggy-token";
  delete process.env.KAPI_SWIGGY_OWNER_SECRET;

  await writeFile(
    join(dataDir, ".kapi-session-relay.json"),
    JSON.stringify({
      "session-1": {
        ciphertext: "ciphertext",
        updatedAt: "2026-06-25T00:00:00.000Z",
        metadata: {
          status: "open",
          organizerSecretHash: await hash("organizer-secret"),
        },
      },
    }),
  );
  await writeFile(
    join(dataDir, ".kapi-session-invites.json"),
    JSON.stringify({
      "invite-1": {
        id: "invite-1",
        sessionId: "session-1",
        key: "session-key",
        createdAt: "2026-06-25T00:00:00.000Z",
      },
    }),
  );

  globalThis.fetch = (async (input, init) => {
    const url = requestUrl(input);
    if (url === "https://mcp.swiggy.com/auth/register") {
      return Response.json({ client_id: "test-client" });
    }
    if (url === "https://mcp.swiggy.com/auth/token") {
      return Response.json({
        access_token: "test-swiggy-token",
        expires_in: 3600,
      });
    }

    const body = JSON.parse(String(init?.body ?? "{}")) as {
      params?: { name?: string };
    };
    swiggyCalls.push({
      body: body as Record<string, unknown>,
      headers: new Headers(init?.headers),
    });
    const data = (() => {
      if (body.params?.name === "get_addresses") {
        return {
          addresses: [
            {
              id: "addr-1",
              addressTag: "Home",
              addressLine: "Tower A",
            },
          ],
        };
      }
      if (body.params?.name === "get_restaurant_menu") {
        return { items: [{ id: "item-1", name: "Dosa", price: 120 }] };
      }
      return { itemCount: 0 };
    })();
    return new Response(
      JSON.stringify({
        result: { structuredContent: { success: true, data } },
      }),
      { headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;

  app = (await import("./index.js")).app;
});

beforeEach(() => {
  swiggyCalls.length = 0;
});

afterAll(async () => {
  globalThis.fetch = originalFetch;
  await rm(dataDir, { recursive: true, force: true });
  delete process.env.KAPI_DATA_DIR;
  delete process.env.KAPI_WEB_URL;
  delete process.env.SWIGGY_REDIRECT_URI;
  delete process.env.SWIGGY_MCP_ACCESS_TOKEN;
  delete process.env.KAPI_SWIGGY_OWNER_SECRET;
});

async function finishOAuth(next: string) {
  const start = await app.handle(
    new Request(
      `http://api.test/auth/start?next=${encodeURIComponent(next)}`,
    ),
  );
  expect(start.status).toBe(302);
  const startLocation = start.headers.get("location");
  expect(startLocation).toBeTruthy();
  const state = new URL(startLocation ?? "").searchParams.get("state");
  expect(state).toBeTruthy();

  const callback = await app.handle(
    new Request(`http://api.test/auth/callback?code=ok&state=${state}`),
  );
  expect(callback.status).toBe(302);
  return {
    cookie: callback.headers.get("set-cookie") ?? "",
    location: callback.headers.get("location"),
  };
}

describe("OAuth return URLs", () => {
  it("falls back to the public web URL for external destinations", async () => {
    await expect(finishOAuth("https://evil.test/after")).resolves.toMatchObject(
      { location: publicWebUrl },
    );
  });

  it("preserves trusted absolute app URLs", async () => {
    await expect(
      finishOAuth("http://127.0.0.1:3000/new?from=oauth#setup"),
    ).resolves.toMatchObject({
      location: "http://127.0.0.1:3000/new?from=oauth#setup",
    });
  });

  it("resolves relative app paths onto the public web origin", async () => {
    await expect(finishOAuth("/review?session=s1#key=k1")).resolves.toMatchObject(
      {
        location: "http://127.0.0.1:3000/review?session=s1#key=k1",
      },
    );
  });
});

describe("Swiggy read proxy authorization", () => {
  it("rejects unauthenticated address reads before Swiggy is called", async () => {
    const response = await app.handle(
      new Request("http://api.test/food/addresses"),
    );

    expect(response.status).toBe(403);
    expect(swiggyCalls).toHaveLength(0);
  });

  it("allows the OAuth owner cookie to read addresses", async () => {
    const { cookie } = await finishOAuth("/new");
    const response = await app.handle(
      new Request("http://api.test/food/addresses", {
        headers: { cookie },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([
      { id: "addr-1", label: "Home", detail: "Tower A" },
    ]);
    expect(swiggyCalls).toHaveLength(1);
    expect(swiggyCalls[0]?.headers.get("authorization")).toBe(
      "Bearer test-swiggy-token",
    );
  });

  it("allows organizer proof for a session-bound cart read", async () => {
    const response = await app.handle(
      new Request(
        "http://api.test/food/cart?addressId=addr-1&sessionId=session-1",
        { headers: { "x-kapi-organizer-secret": "organizer-secret" } },
      ),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ empty: true });
    expect(swiggyCalls).toHaveLength(1);
  });

  it("allows invite session proof for a session-bound menu read", async () => {
    const response = await app.handle(
      new Request(
        "http://api.test/food/restaurants/restaurant-1/menu?addressId=addr-1&sessionId=session-1",
        { headers: { "x-kapi-session-key": "session-key" } },
      ),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([
      {
        id: "item-1",
        restaurantId: "restaurant-1",
        name: "Dosa",
        category: "Menu",
        description: "",
        price: 120,
        hasVariants: false,
        hasAddons: false,
        available: true,
        swiggyItemId: "item-1",
      },
    ]);
    expect(swiggyCalls).toHaveLength(1);
  });
});
