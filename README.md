# Kapi.run

Kapi.run helps a group build one Swiggy food cart. Only the organizer connects a Swiggy account.

Participants open a shared Kapi link, select food, and submit their items. The organizer reviews the combined order and syncs it to Swiggy.

Kapi does not place or pay for the final order. The organizer completes checkout in Swiggy.

![Kapi.run group-order flow](apps/web/public/og-image.png)

## Group-order flow

1. The organizer connects a Swiggy account.
2. The organizer selects a saved address and a restaurant.
3. The organizer sets an order cutoff and creates a Kapi session.
4. Participants open the shared link and build personal draft carts.
5. Participants submit their items to the encrypted group session.
6. The organizer reviews the combined order and locks the session.
7. Kapi syncs the available items to the organizer's Swiggy cart.
8. The organizer reviews, pays, and places the order in Swiggy.

## Architecture

The repository uses Bun workspaces.

- `apps/web` contains the framework-free HTML, CSS, JavaScript, and Oat web app.
- `apps/api` contains the Elysia API, Swiggy OAuth proxy, MCP client, and session relay.
- `apps/worker` connects the API and static assets to Cloudflare Workers.
- `packages/spec` contains the shared TypeScript contracts.

Production serves the web app and API from one Cloudflare Worker and one origin.

## Session and privacy model

- Participant draft carts stay in the participant's browser until submission.
- The browser encrypts shared group data before it sends the data to the relay.
- Session links contain the information that participants need to join the session.
- A Durable Object stores the Swiggy OAuth token and encrypted relay records.
- Swiggy keeps payment details and final checkout data.
- Kapi does not use order data for advertising or participant profiles.

## Local development

Install Bun before you start.

Install the workspace dependencies:

```sh
bun install
```

Start all workspace apps:

```sh
bun run dev
```

Start the current web app and API in separate terminals:

```sh
bun run dev:web
bun run dev:api
```

The web app uses `http://localhost:3000` by default. The API uses `http://localhost:3001` by default.

## Commands

Run these commands from the repository root:

| Command               | Purpose                          |
| --------------------- | -------------------------------- |
| `bun run dev`         | Start all workspace apps.        |
| `bun run dev:web`     | Start the web app.               |
| `bun run dev:api`     | Start the API.                   |
| `bun run build`       | Build the web app.               |
| `bun run check`       | Check formatting and TypeScript. |
| `bun run test`        | Run the web tests.               |
| `bun run test:routing` | Verify static route handling.    |
| `bun run deploy:dry`  | Validate the Worker deployment.  |
| `bun run deploy`      | Deploy the Worker to Cloudflare. |

## Deployment

Wrangler deploys the web build, API, and Durable Object together. Cloudflare stores runtime data outside source control.

Read [docs/deployment.md](docs/deployment.md) for the required environment variables and deployment requirements.

## Product scope

Kapi syncs a group cart to Swiggy. It does not apply coupons, select payment methods, or place orders.

Read [docs/v0-product-spec.md](docs/v0-product-spec.md) before you change product behavior.
