# Kapi Web

Kapi web covers organiser setup, participant menu selection, and organiser review before syncing to Swiggy.

## Commands

```sh
bun run --cwd apps/web dev
bun run --cwd apps/web build
bun run --cwd apps/web test
bun run --cwd apps/web lint
bun run --cwd apps/web check
```

## API

`VITE_KAPI_API_URL` defaults to `http://127.0.0.1:3001`. Start `apps/api` separately for the real Swiggy OAuth, MCP, and local relay flow.

## Privacy And Session Notes

- The session key lives in the URL hash and localStorage.
- Participant draft cart data stays local until submit.
- Organiser sync writes to the Swiggy cart only; it does not place the order.
