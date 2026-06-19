# Kapi.run

Kapi.run is an internal Swiggy group-ordering helper. It lets an organiser create a Kapi session, collect participant food choices, review the combined cart, and sync it to the organiser's Swiggy cart.

Kapi v0 does not place orders. Order placement, `place_food_order`, and payment handling are out of scope: after cart sync, the organiser reviews and pays in Swiggy.

## Workspace

- `apps/web`: organiser setup, participant menu, and organiser review UI.
- `apps/api`: local Swiggy OAuth/MCP proxy and encrypted session relay.
- `apps/landing`: landing page app.
- `packages/spec`: shared Kapi contracts.

## Commands

Run from the repo root:

```sh
bun run dev
bun run dev:web
bun run dev:api
bun run dev:landing
bun run build
bun run check
bun run lint
bun run test
```

See `docs/v0-product-spec.md` before changing product behavior.
