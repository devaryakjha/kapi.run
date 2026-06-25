import { afterAll, beforeAll, expect, test } from "bun:test";
import { chmod, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

type TestToken = { access_token: string; expires_at: number };
type TokenFileModule = {
  readTokenFromFile(path: string): Promise<TestToken | null>;
  saveTokenToFile(path: string, nextToken: TestToken | null): Promise<void>;
};

let api: TokenFileModule;
let tempDir: string;

beforeAll(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "kapi-token-file-"));
  process.env.KAPI_DATA_DIR = tempDir;
  api = (await import(`${import.meta.dir}/index.ts`)) as TokenFileModule;
});

afterAll(async () => {
  await rm(tempDir, { recursive: true, force: true });
  delete process.env.KAPI_DATA_DIR;
});

async function fileMode(path: string) {
  return (await stat(path)).mode & 0o777;
}

test("saves and loads token files with owner-only permissions", async () => {
  const path = join(tempDir, "new-token.json");
  const token = { access_token: "dummy-token", expires_at: 1 };

  await api.saveTokenToFile(path, token);

  expect(await fileMode(path)).toBe(0o600);
  expect(await api.readTokenFromFile(path)).toEqual(token);
});

test("repairs broad permissions when replacing an existing token file", async () => {
  const path = join(tempDir, "existing-token.json");
  const token = { access_token: "dummy-token", expires_at: 2 };

  await writeFile(path, JSON.stringify(token), { mode: 0o644 });
  await chmod(path, 0o644);

  await api.saveTokenToFile(path, token);

  expect(await fileMode(path)).toBe(0o600);
});

test("removes token files on logout", async () => {
  const path = join(tempDir, "logout-token.json");
  await api.saveTokenToFile(path, { access_token: "dummy-token", expires_at: 3 });

  await api.saveTokenToFile(path, null);

  expect(await api.readTokenFromFile(path)).toBeNull();
});
