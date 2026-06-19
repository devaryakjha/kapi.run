# Kapi API

Local API for Swiggy OAuth/MCP proxy calls and encrypted Kapi session relay.

## Commands

```sh
bun run --cwd apps/api dev
bun run --cwd apps/api start
```

## Environment

- `PORT`: API port.
- `KAPI_WEB_URL`: allowed web origin for local flows.
- `SWIGGY_REDIRECT_URI`: OAuth redirect URL.
- `SWIGGY_MCP_ACCESS_TOKEN`: optional local override only; do not commit or share a value.

## Local Files

- `.kapi-swiggy-token.json`: ignored local Swiggy token file.
- `.kapi-session-relay.json`: ignored local encrypted session relay file.

These are development files only.

## Safety

- Do not log Swiggy tokens or raw account data.
- Do not call order placement.
- Cart sync requires organiser confirmation in the web flow.
