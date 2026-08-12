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
import type { RelaySessionRecord, RelayWritePayload } from "@kapi/spec";

const publicWebUrl = "http://localhost:3000";
let api: typeof import("./index.js");
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
  process.env.SWIGGY_REDIRECT_URI = "http://localhost:3001/auth/callback";
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

  api = await import("./index.js");
  app = api.app;
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
    new Request(`http://api.test/auth/start?next=${encodeURIComponent(next)}`),
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

async function readStreamUntil(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  needle: string,
) {
  const decoder = new TextDecoder();
  let output = "";
  while (!output.includes(needle)) {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const chunk = await Promise.race([
      reader.read(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`Timed out waiting for ${needle}`)),
          1_000,
        );
      }),
    ]).finally(() => {
      if (timeout) clearTimeout(timeout);
    });
    if (chunk.done) break;
    output += decoder.decode(chunk.value, { stream: true });
  }
  return output;
}

async function waitFor<T>(read: () => T, predicate: (value: T) => boolean) {
  const deadline = Date.now() + 1_000;
  while (Date.now() < deadline) {
    const value = read();
    if (predicate(value)) return value;
    await Bun.sleep(1);
  }
  throw new Error("Timed out waiting for test state.");
}

function putRelaySession(
  sessionId: string,
  body: RelayWritePayload,
  secrets: { organizer?: string; participant?: string } = {},
) {
  return app.handle(
    new Request(`http://api.test/relay/sessions/${sessionId}`, {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        origin: publicWebUrl,
        ...(secrets.organizer
          ? { "x-kapi-organizer-secret": secrets.organizer }
          : {}),
        ...(secrets.participant
          ? { "x-kapi-participant-secret": secrets.participant }
          : {}),
      },
      body: JSON.stringify(body),
    }),
  );
}

async function createRelaySession(
  sessionId: string,
  organizerSecret: string,
  ciphertext = "organizer-ciphertext",
) {
  const response = await putRelaySession(
    sessionId,
    {
      ciphertext,
      metadata: {
        status: "open",
        organizerSecretHash: await hash(organizerSecret),
      },
      role: "organizer",
    },
    { organizer: organizerSecret },
  );
  expect(response.status).toBe(200);
  return (await response.json()) as RelaySessionRecord;
}

function submitRelayParticipant(
  sessionId: string,
  expectedUpdatedAt: string,
  participantId: string,
  participantSecret = `${participantId}-secret`,
  ciphertext = `${participantId}-ciphertext`,
) {
  return putRelaySession(
    sessionId,
    {
      ciphertext,
      expectedUpdatedAt,
      participantId,
      role: "participant",
    },
    { participant: participantSecret },
  );
}

async function getRelaySession(sessionId: string) {
  const response = await app.handle(
    new Request(`http://api.test/relay/sessions/${sessionId}`),
  );
  return (await response.json()) as RelaySessionRecord;
}

describe("OAuth return URLs", () => {
  it("falls back to the public web URL for external destinations", async () => {
    await expect(finishOAuth("https://evil.test/after")).resolves.toMatchObject(
      { location: publicWebUrl },
    );
  });

  it("preserves trusted absolute app URLs", async () => {
    await expect(
      finishOAuth("http://localhost:3000/new?from=oauth#setup"),
    ).resolves.toMatchObject({
      location: "http://localhost:3000/new?from=oauth#setup",
    });
  });

  it("resolves relative app paths onto the public web origin", async () => {
    await expect(
      finishOAuth("/review?session=s1#key=k1"),
    ).resolves.toMatchObject({
      location: "http://localhost:3000/review?session=s1#key=k1",
    });
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

describe("relay session events", () => {
  it("404s unknown sessions without opening a stream", async () => {
    const response = await app.handle(
      new Request("http://api.test/relay/sessions/missing/events", {
        headers: { origin: publicWebUrl },
      }),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Session not found." });
  });

  it("streams the current record, broadcasts writes, and cleans up", async () => {
    const sessionId = "sse-session";
    const organizerSecret = "event-organizer-secret";
    const create = await app.handle(
      new Request(`http://api.test/relay/sessions/${sessionId}`, {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          origin: publicWebUrl,
          "x-kapi-organizer-secret": organizerSecret,
        },
        body: JSON.stringify({
          ciphertext: "initial-ciphertext",
          metadata: {
            status: "open",
            organizerSecretHash: await hash(organizerSecret),
          },
          role: "organizer",
        }),
      }),
    );
    const created = (await create.json()) as RelaySessionRecord;
    expect(create.status).toBe(200);

    const abort = new AbortController();
    const events = await app.handle(
      new Request(`http://api.test/relay/sessions/${sessionId}/events`, {
        headers: { origin: publicWebUrl },
        signal: abort.signal,
      }),
    );
    expect(events.status).toBe(200);
    expect(events.headers.get("content-type")).toBe("text/event-stream");
    expect(events.headers.get("cache-control")).toBe("no-cache, no-transform");
    expect(events.headers.get("x-accel-buffering")).toBe("no");

    const reader = events.body?.getReader();
    expect(reader).toBeTruthy();
    if (!reader) throw new Error("SSE response body missing.");
    try {
      const initial = await readStreamUntil(reader, `id: ${created.updatedAt}`);
      expect(initial).toContain("retry: 3000\n\n");
      expect(initial).toContain("event: record\n");
      expect(initial).toContain(`data: ${JSON.stringify(created)}\n\n`);
      expect(api.relaySubscriberCount(sessionId)).toBe(1);

      const update = await app.handle(
        new Request(`http://api.test/relay/sessions/${sessionId}`, {
          method: "PUT",
          headers: {
            "content-type": "application/json",
            origin: publicWebUrl,
            "x-kapi-participant-secret": "participant-secret",
          },
          body: JSON.stringify({
            ciphertext: "participant-ciphertext",
            expectedUpdatedAt: created.updatedAt,
            participantId: "participant-1",
            role: "participant",
          }),
        }),
      );
      const updated = (await update.json()) as RelaySessionRecord;
      expect(update.status).toBe(200);

      const pushed = await readStreamUntil(reader, `id: ${updated.updatedAt}`);
      const current = await app.handle(
        new Request(`http://api.test/relay/sessions/${sessionId}`),
      );
      expect(await current.json()).toEqual(updated);
      expect(pushed).toContain(`data: ${JSON.stringify(updated)}\n\n`);
    } finally {
      abort.abort();
      await reader.cancel().catch(() => {});
    }
    expect(api.relaySubscriberCount(sessionId)).toBe(0);
  });
});

describe("participant relay writes", () => {
  it("preserves concurrent independent participant submissions", async () => {
    const sessionId = `participant-race-${crypto.randomUUID()}`;
    const organizerSecret = "participant-race-organizer-secret";
    const created = await createRelaySession(sessionId, organizerSecret);
    const responses = await Promise.all([
      submitRelayParticipant(sessionId, created.updatedAt, "participant-one"),
      submitRelayParticipant(sessionId, created.updatedAt, "participant-two"),
    ]);
    expect(responses.map(({ status }) => status)).toEqual([200, 200]);

    const record = await getRelaySession(sessionId);
    expect(record.participantSubmissions).toMatchObject({
      "participant-one": { ciphertext: "participant-one-ciphertext" },
      "participant-two": { ciphertext: "participant-two-ciphertext" },
    });
  });

  it("accepts independent participant submissions from the same session revision", async () => {
    const initial = {
      ciphertext: "organizer-ciphertext",
      updatedAt: "2026-08-12T10:00:00.000Z",
      metadata: { status: "open" as const },
    };
    const firstBody = {
      ciphertext: "participant-one-ciphertext",
      expectedUpdatedAt: initial.updatedAt,
      participantId: "participant-one",
      role: "participant" as const,
    };
    const firstDecision = await api.decideRelayWrite(
      initial,
      firstBody,
      null,
      "participant-one-secret",
    );
    expect(firstDecision.ok).toBe(true);
    if (!firstDecision.ok) return;

    const afterFirst = api.applyRelayWrite(
      initial,
      firstBody,
      firstDecision,
    );
    expect(new Date(afterFirst.updatedAt).getTime()).toBeGreaterThan(
      new Date(initial.updatedAt).getTime(),
    );
    const secondDecision = await api.decideRelayWrite(
      afterFirst,
      {
        ciphertext: "participant-two-ciphertext",
        expectedUpdatedAt: initial.updatedAt,
        participantId: "participant-two",
        role: "participant",
      },
      null,
      "participant-two-secret",
    );

    expect(secondDecision).toMatchObject({
      ok: true,
      role: "participant",
    });
    if (!secondDecision.ok) return;

    const afterSecond = api.applyRelayWrite(
      afterFirst,
      {
        ciphertext: "participant-two-ciphertext",
        expectedUpdatedAt: initial.updatedAt,
        participantId: "participant-two",
        role: "participant",
      },
      secondDecision,
      "2026-08-12T10:00:02.000Z",
    );
    expect(afterSecond.ciphertext).toBe(initial.ciphertext);
    expect(afterSecond.participantSubmissions).toMatchObject({
      "participant-one": { ciphertext: "participant-one-ciphertext" },
      "participant-two": { ciphertext: "participant-two-ciphertext" },
    });
  });

  it("still rejects a stale organizer write", async () => {
    const current = {
      ciphertext: "current-ciphertext",
      updatedAt: "2026-08-12T10:00:01.000Z",
      metadata: {
        status: "open" as const,
        organizerSecretHash: await hash("organizer-secret"),
      },
    };

    const decision = await api.decideRelayWrite(
      current,
      {
        ciphertext: "stale-organizer-ciphertext",
        expectedUpdatedAt: "2026-08-12T10:00:00.000Z",
        role: "organizer",
      },
      "organizer-secret",
    );

    expect(decision).toMatchObject({
      ok: false,
      status: 409,
    });
  });

  it("still rejects a stale participant write after the order locks", async () => {
    const decision = await api.decideRelayWrite(
      {
        ciphertext: "locked-ciphertext",
        updatedAt: "2026-08-12T10:00:01.000Z",
        metadata: { status: "locked" as const },
      },
      {
        ciphertext: "participant-ciphertext",
        expectedUpdatedAt: "2026-08-12T10:00:00.000Z",
        participantId: "participant-one",
        role: "participant",
      },
      null,
      "participant-one-secret",
    );

    expect(decision).toMatchObject({
      ok: false,
      status: 423,
    });
  });

  it("rejects a stale write from the same participant", async () => {
    const initial = {
      ciphertext: "organizer-ciphertext",
      updatedAt: "2026-08-12T10:00:00.000Z",
      metadata: { status: "open" as const },
    };
    const firstBody = {
      ciphertext: "newer-participant-ciphertext",
      expectedUpdatedAt: initial.updatedAt,
      participantId: "participant-one",
      role: "participant" as const,
    };
    const firstDecision = await api.decideRelayWrite(
      initial,
      firstBody,
      null,
      "participant-one-secret",
    );
    if (!firstDecision.ok) throw new Error("First participant write failed.");
    const afterFirst = api.applyRelayWrite(
      initial,
      firstBody,
      firstDecision,
      "2026-08-12T10:00:01.000Z",
    );

    const staleDecision = await api.decideRelayWrite(
      afterFirst,
      {
        ciphertext: "stale-participant-ciphertext",
        expectedUpdatedAt: initial.updatedAt,
        participantId: "participant-one",
        role: "participant",
      },
      null,
      "participant-one-secret",
    );

    expect(staleDecision).toMatchObject({ ok: false, status: 409 });
  });

  it("rejects a forged future participant revision", async () => {
    const current = {
      ciphertext: "organizer-ciphertext",
      updatedAt: "2026-08-12T10:00:02.000Z",
      organizerUpdatedAt: "2026-08-12T10:00:02.000Z",
      metadata: { status: "open" as const },
      participantSubmissions: {
        "participant-one": {
          ciphertext: "participant-ciphertext",
          updatedAt: "2026-08-12T10:00:01.000Z",
        },
      },
    };

    const decision = await api.decideRelayWrite(
      current,
      {
        ciphertext: "forged-participant-ciphertext",
        expectedUpdatedAt: "2099-01-01T00:00:00.000Z",
        participantId: "participant-one",
        role: "participant",
      },
      null,
      "participant-one-secret",
    );

    expect(decision).toMatchObject({ ok: false, status: 409 });
  });

  it("rejects a participant write older than an organizer edit", async () => {
    const sessionId = `organizer-edit-${crypto.randomUUID()}`;
    const organizerSecret = "organizer-edit-secret";
    const created = await createRelaySession(
      sessionId,
      organizerSecret,
      "initial-organizer-ciphertext",
    );
    const participant = await submitRelayParticipant(
      sessionId,
      created.updatedAt,
      "participant-one",
      "participant-secret",
      "participant-ciphertext",
    );
    const submitted = (await participant.json()) as RelaySessionRecord;

    const organizer = await putRelaySession(
      sessionId,
      {
        ciphertext: "edited-organizer-ciphertext",
        expectedUpdatedAt: submitted.updatedAt,
        metadata: {
          status: "open",
          organizerSecretHash: await hash(organizerSecret),
        },
        role: "organizer",
      },
      { organizer: organizerSecret },
    );
    expect(organizer.status).toBe(200);

    const staleParticipant = await submitRelayParticipant(
      sessionId,
      submitted.updatedAt,
      "participant-one",
      "participant-secret",
      "stale-participant-ciphertext",
    );
    expect(staleParticipant.status).toBe(409);

    expect(await getRelaySession(sessionId)).toMatchObject({
      ciphertext: "edited-organizer-ciphertext",
    });
  });

  it("preserves different sessions across delayed shared-store persistence", async () => {
    const suffix = crypto.randomUUID();
    const firstSessionId = `shared-store-one-${suffix}`;
    const secondSessionId = `shared-store-two-${suffix}`;
    const writes: Array<{
      snapshot: Record<string, unknown>;
      resolve: () => void;
    }> = [];
    const persisted: Record<string, unknown> = {};
    await api.hydrateDurableState({
      async get() {
        return undefined;
      },
      async put(key, value) {
        if (key !== "relay") return;
        await new Promise<void>((resolve) => {
          writes.push({
            snapshot: structuredClone(value as Record<string, unknown>),
            resolve,
          });
        });
        persisted[key] = structuredClone(value);
      },
      async delete() {
        return false;
      },
    });

    try {
      const create = async (sessionId: string) => {
        const organizerSecret = `${sessionId}-secret`;
        return app.handle(
          new Request(`http://api.test/relay/sessions/${sessionId}`, {
            method: "PUT",
            headers: {
              "content-type": "application/json",
              origin: publicWebUrl,
              "x-kapi-organizer-secret": organizerSecret,
            },
            body: JSON.stringify({
              ciphertext: `${sessionId}-ciphertext`,
              metadata: {
                status: "open",
                organizerSecretHash: await hash(organizerSecret),
              },
              role: "organizer",
            }),
          }),
        );
      };
      const first = create(firstSessionId);
      const second = create(secondSessionId);
      await waitFor(() => writes.length, (length) => length === 1);
      expect(writes).toHaveLength(1);
      expect(writes[0]?.snapshot).toHaveProperty(firstSessionId);
      expect(writes[0]?.snapshot).not.toHaveProperty(secondSessionId);
      writes[0]?.resolve();
      await waitFor(() => writes.length, (length) => length === 2);
      expect(writes).toHaveLength(2);
      expect(writes[1]?.snapshot).toHaveProperty(firstSessionId);
      expect(writes[1]?.snapshot).toHaveProperty(secondSessionId);
      writes[1]?.resolve();
      expect((await Promise.all([first, second])).map(({ status }) => status)).toEqual([
        200, 200,
      ]);
      expect(persisted.relay).toHaveProperty(
        `${firstSessionId}.ciphertext`,
        `${firstSessionId}-ciphertext`,
      );
      expect(persisted.relay).toHaveProperty(
        `${secondSessionId}.ciphertext`,
        `${secondSessionId}-ciphertext`,
      );
    } finally {
      api.resetRuntimeStateForTests();
    }
  });

  it("does not expose a relay write when persistence fails", async () => {
    await api.hydrateDurableState({
      async get() {
        return undefined;
      },
      async put(key) {
        if (key === "relay") throw new Error("storage failed");
      },
      async delete() {
        return false;
      },
    });
    const sessionId = `failed-write-${crypto.randomUUID()}`;
    const organizerSecret = "failed-write-secret";

    try {
      const response = await putRelaySession(
        sessionId,
        {
          ciphertext: "unpersisted-ciphertext",
          metadata: {
            status: "open",
            organizerSecretHash: await hash(organizerSecret),
          },
          role: "organizer",
        },
        { organizer: organizerSecret },
      );
      expect(response.status).toBe(500);

      const current = await app.handle(
        new Request(`http://api.test/relay/sessions/${sessionId}`),
      );
      expect(current.status).toBe(404);
    } finally {
      api.resetRuntimeStateForTests();
    }
  });
});
