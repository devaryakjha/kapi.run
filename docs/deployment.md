# Deployment

Cloudflare Workers hosts the static web app and API on one origin. A Durable Object stores OAuth and relay state.

## Deploy

Authenticate Wrangler once:

```sh
bunx wrangler login --use-keyring
```

Validate and deploy from the repository root:

```sh
bun run deploy:dry
bun run deploy
```

The deployment configuration lives in `wrangler.jsonc`. Update its URLs before any domain change.

## Requirements

- Keep `KAPI_WEB_URL` equal to the production origin.
- Keep `SWIGGY_REDIRECT_URI` equal to the production OAuth callback.
- Keep OAuth tokens and runtime data out of source control.
- Run `wrangler types` after a binding change.
- Run the local and remote verification checks before a domain switch.
