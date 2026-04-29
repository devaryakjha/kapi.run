# Swiggy MCP Feasibility Notes

## Goal

Build an internal company tool for group food orders.

Target flow:

1. A manager signs in with Swiggy and selects a delivery address.
2. The manager selects one open restaurant.
3. Employees join an internal session without needing the Swiggy app.
4. Employees browse/search the restaurant menu and add items to the shared company session cart.
5. When the cutoff passes, the manager reviews the consolidated order.
6. The app pushes the final item list into the manager's Swiggy Food cart.
7. The manager explicitly confirms placement.
8. The app tracks the placed Swiggy order.

## What Swiggy MCP Supports

Swiggy Food MCP exposes a streamable HTTP MCP server at `POST https://mcp.swiggy.com/food`.

Relevant tools:

| Stage | Tool | Use in this product |
| --- | --- | --- |
| Address | `get_addresses` | Fetch the manager's saved Swiggy delivery addresses. No raw lat/lng is returned. |
| Restaurant discovery | `search_restaurants` | Search restaurants by name/cuisine for the selected address. Must only proceed with `availabilityStatus: "OPEN"`. |
| Menu browsing | `get_restaurant_menu` | Fetch paginated restaurant menu categories and compact item data. Good for browsing. |
| Menu search/customization | `search_menu` | Search dishes and get customization details, variants, addons, and IDs needed for cart mutation. |
| Cart write | `update_food_cart` | Add/update items in the authenticated user's Swiggy Food cart. Supports variants, variantsV2, and addons. |
| Cart read | `get_food_cart` | Read authoritative Swiggy cart contents, totals, payment methods, and valid addons. |
| Cart reset | `flush_food_cart` | Clear the Food cart if starting over. |
| Coupons | `fetch_food_coupons`, `apply_food_coupon` | Fetch/apply available coupons. Need to respect payment-method constraints. |
| Order placement | `place_food_order` | Place a real food order after explicit confirmation. |
| Tracking | `get_food_orders`, `get_food_order_details`, `track_food_order` | Track active orders and support check-then-retry after placement failures. |

## Product Fit

This is a good fit for the Kapi-style group order flow, with one important design choice: Swiggy's cart is tied to the authenticated Swiggy user, not to arbitrary anonymous participants.

The internal app should keep its own session cart while people are adding items. Only at finalization should it write the consolidated cart to Swiggy through the manager's OAuth session.

That avoids:

- Everyone needing the Swiggy app.
- Multiple people needing Swiggy OAuth.
- Employees mutating the manager's live Swiggy cart while the session is open.
- Drift from item edits before cutoff.

## Proposed Architecture

### Internal State

Store internal group-order state independently:

- Session: manager, restaurant, address, cutoff time, status.
- Participant: display name or company identity.
- Session cart item: item id, restaurant id, item name, quantity, price snapshot, selected variant/addon IDs, participant, notes.
- Finalization record: Swiggy cart sync status, order id, order status.

### Swiggy State

Use Swiggy only for:

- Manager OAuth.
- Saved address lookup.
- Restaurant/menu discovery.
- Live menu customization metadata.
- Final cart sync.
- Order placement and tracking.

Before final placement:

1. Re-fetch/check Swiggy cart.
2. Optionally flush existing cart after manager confirmation.
3. Push consolidated items via `update_food_cart`.
4. Call `get_food_cart`.
5. Display full order summary, total, payment methods, and delivery address.
6. Require explicit manager confirmation.
7. Call `place_food_order`.

## Known Constraints

### Access

Production is invite/allowlist based. Local development is explicitly expected before applying. Swiggy recommends building a local prototype or using staging once available, recording the full flow, then applying for access.

Application asks for:

- Integration name and organization.
- Exact redirect URIs.
- Requested servers, likely only `food`.
- Expected order/tool-call volume.
- Use case.
- Technical contact.

### OAuth

Swiggy MCP uses OAuth 2.1 with PKCE.

Important constraints:

- `http://localhost` redirect URIs are allowed for local development.
- Production redirect URIs require HTTPS and exact-match allowlisting.
- Access tokens last 5 days.
- Refresh token issuance is not wired in v1.0, despite metadata advertising it.
- On 401, re-run authorization.

### Ordering

Current Food MCP ordering has beta restrictions:

- Real order placement is possible through `place_food_order`.
- Explicit user confirmation is mandatory before order placement.
- Cart/order value must be below INR 1000.
- Payment methods must come from `get_food_cart`; do not assume COD or any other method.
- `place_food_order` is not idempotent. On network/5xx failure, check `get_food_orders` before retrying.
- Cancellation is not available through MCP; user must call Swiggy customer care.

The INR 1000 cap is the biggest blocker for real company group lunch orders. It may still work for small snack/coffee orders or prototypes, but larger group orders would still need manual Swiggy checkout until Swiggy grants/changes access.

### Cart Model

Swiggy Food cart is server-side and bound to the authenticated session.

Important behavior:

- Food cart is tied to one restaurant.
- Switching restaurant flushes the Swiggy cart.
- Authoritative cart state is Swiggy-side; call `get_food_cart` before mutation/confirmation.
- Internal app should not rely on cached Swiggy cart state.

### Menu/Customization

The docs support variants and addons, but the UX must handle them carefully:

- `get_restaurant_menu` returns compact menu data.
- `search_menu` returns customization details and IDs needed for `update_food_cart`.
- Items use either legacy `variations` or `variantsV2`, not both.
- Addon availability may depend on variant selection.
- After choosing a variant, use cart response `valid_addons` to determine valid addons.

This means the MVP should probably start with simple items first, then add full variant/addon UX once the cart sync path is proven.

### Rate Limits

MCP-layer rate limits are not enforced in v1.0, but upstream shedding may occur. Planned developer-tier guidance:

- 120 requests/minute per authenticated user per server.
- 30 write requests/minute per authenticated user per server.
- 50,000 requests/day per `client_id`.

Use caching for restaurant/menu data and exponential backoff for transient upstream errors.

### Data and Compliance

Swiggy treats tool-call data as PII under DPDP. For this product:

- Store only what is needed for the internal ordering session.
- Avoid raw Swiggy request/response logs.
- Hash internal user identifiers in logs where possible.
- Do not use Swiggy-originated data for analytics, ads, or model training without explicit consent and a DPA.
- If LLM processing happens outside India/Singapore, production may require a DPA/cross-border transfer review.

## What Is Possible Now

- Build a local prototype against a local Swiggy adapter/stub.
- Implement the full internal group-order UX.
- Design the Swiggy integration boundary around MCP tools.
- Apply for Swiggy access with a working demo video.
- Once staging credentials are granted, test end-to-end without real orders.
- Once production access is granted, place real orders subject to current caps and confirmation rules.

## What Is Not Possible Or Not Safe To Assume

- Public production launch without Swiggy approval.
- Anonymous participants directly adding to Swiggy cart without a Swiggy-authenticated user.
- Real orders above INR 1000 through current MCP beta.
- Blind retry of order placement.
- Cancellations through MCP.
- Online payment availability unless `get_food_cart` returns it.
- Refresh-token based long-lived sessions in v1.0.
- Bulk catalogue export/scraping; docs call this out as revocation risk.

## MVP Recommendation

Build the app with a provider abstraction:

- `FoodProvider`
  - `getAddresses`
  - `searchRestaurants`
  - `getRestaurantMenu`
  - `searchMenu`
  - `syncCart`
  - `getCart`
  - `placeOrder`
  - `trackOrder`

Start with two implementations:

- `StubFoodProvider`: local deterministic data for development/demo.
- `SwiggyMcpFoodProvider`: real MCP integration once credentials exist.

MVP scope:

1. Manager creates session with address, restaurant, cutoff.
2. Participants join by link/name.
3. Participants browse/search menu and add simple items.
4. Manager closes session.
5. App summarizes all items grouped by participant.
6. Manager syncs to Swiggy cart.
7. Manager sees Swiggy cart total/payment methods.
8. Manager confirms and places order if under INR 1000.
9. App tracks order status.

This keeps the product useful even before production access: the same internal cart can still export a manual Swiggy checklist while the real MCP placement path is behind a feature flag.

