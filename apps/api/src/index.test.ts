import { afterAll, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const publicWebUrl = "http://127.0.0.1:3000";
const dataDir = await mkdtemp(join(tmpdir(), "kapi-api-test-"));
const originalFetch = globalThis.fetch;

process.env.KAPI_DATA_DIR = dataDir;
process.env.KAPI_WEB_URL = publicWebUrl;
process.env.SWIGGY_REDIRECT_URI = "http://localhost:3001/auth/callback";
delete process.env.SWIGGY_MCP_ACCESS_TOKEN;

globalThis.fetch = (async (input) => {
  const url =
    typeof input === "string"
      ? input
      : input instanceof Request
        ? input.url
        : input.toString();
  if (url === "https://mcp.swiggy.com/auth/register") {
    return Response.json({ client_id: "test-client" });
  }
  if (url === "https://mcp.swiggy.com/auth/token") {
    return Response.json({ access_token: "test-token", expires_in: 3600 });
  }
  throw new Error(`Unexpected fetch: ${url}`);
}) as typeof fetch;

const { app } = await import("./index.js");

afterAll(async () => {
  globalThis.fetch = originalFetch;
  await rm(dataDir, { recursive: true, force: true });
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
  return callback.headers.get("location");
}

describe("OAuth return URLs", () => {
  it("falls back to the public web URL for external destinations", async () => {
    await expect(finishOAuth("https://evil.test/after")).resolves.toBe(
      publicWebUrl,
    );
  });

  it("preserves trusted absolute app URLs", async () => {
    await expect(
      finishOAuth("http://127.0.0.1:3000/new?from=oauth#setup"),
    ).resolves.toBe("http://127.0.0.1:3000/new?from=oauth#setup");
  });

  it("resolves relative app paths onto the public web origin", async () => {
    await expect(finishOAuth("/review?session=s1#key=k1")).resolves.toBe(
      "http://127.0.0.1:3000/review?session=s1#key=k1",
    );
  });
});
