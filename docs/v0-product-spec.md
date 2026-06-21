# Kapi.run v0 Product Spec

## Product Idea

Kapi.run is an internal company tool for group Swiggy orders.

Swiggy's native group ordering flow requires every participant to use the Swiggy mobile app. Kapi.run removes that requirement. Only the organiser needs to authenticate with Swiggy. Everyone else joins a Kapi session, picks food from the selected restaurant menu, and submits their items into a shared Kapi cart.

For v0, Kapi.run does not need to place the order through Swiggy MCP. It only needs to sync the final consolidated Kapi cart into the organiser's Swiggy account cart. The organiser then opens Swiggy and completes payment there.

## Privacy Rule

Sensitive data should not leave a user's device unless it is necessary for the product flow and the user has a clear expectation that it will be shared.

Kapi is a convenience project, not a SaaS analytics product. The default posture should be minimal collection, local-first convenience, and no invasive tracking.

This is the practical rule:

- Participant display names may be shared because users choose what to enter and expect the organiser/group to see it.
- Submitted food items may be shared within the session because that is the purpose of the tool.
- Swiggy OAuth tokens, payment details, addresses, and raw Swiggy account data are sensitive.
- Habit/favourite data is sensitive enough to keep local by default.
- Logs, analytics, error reporting, and telemetry must not include Swiggy auth data, addresses, payment data, or raw cart details.
- Do not build cross-session behavioural tracking on the server.
- Do not use order history for analytics, ads, ranking, or profiling.

Prefer local-first state where it improves privacy without making the product painful:

- Participant draft cart lives in the participant's browser.
- Participant favourites and "my usual" live in local browser storage by default.
- Organiser's Swiggy auth/session handling should avoid Kapi server storage where possible.
- Server-side session data should be limited to what is needed to run the shared ordering flow.

### Privacy Architecture Options

The architecture can be simpler than a strict end-to-end encrypted relay, because session-visible names and submitted items are not automatically considered sensitive.

Recommended v0 posture:

- Store active session state only as long as needed.
- Avoid permanent account-level profiles.
- Keep favourites, habits, and reorder shortcuts local.
- Avoid third-party analytics by default.
- Keep Swiggy credentials and payment data off Kapi servers.
- Make session cleanup automatic after a short retention window.

An end-to-end encrypted relay remains a strong option if we want Kapi infrastructure to never read order contents. It improves privacy but adds complexity:

- Session key creation and sharing.
- Participant encryption before submission.
- Organiser-side decryption and merge.
- Reconnection and retry behavior.
- Encrypted persistence if organiser refreshes/closes the browser.
- Recovery behavior if the organiser loses the session key.
- Debugging without readable server logs.

For v0, a normal short-lived backend may be acceptable if it stores only active session data, never stores sensitive Swiggy/payment data, and avoids behavioural profiling.

## Core Assumptions

- The organiser has a Swiggy account.
- Swiggy MCP can authenticate the organiser.
- Swiggy MCP can list/search restaurants for the organiser's selected delivery context.
- Swiggy MCP can provide menu data for a selected restaurant.
- Swiggy MCP can add/update items in the organiser's Swiggy Food cart.
- The Swiggy cart is account-based, so after Kapi syncs the final cart, the organiser can open Swiggy on mobile and see the same cart.
- Participants do not need Swiggy accounts.
- Participants do not directly mutate the organiser's Swiggy cart.
- Kapi owns the group-order state until the organiser explicitly syncs it to Swiggy.

## v0 Flow

### 0. User Chooses A Role

The root route (`/`) lets a user choose how to continue.

- Organisers start a new session and continue to `/new`.
- Participants join an existing session by entering an invite link, or by pasting the session id and session key together.

### 1. Organiser Starts A Session

The organiser opens Kapi.run, chooses to create a new session, and starts creating a group order session.

Required steps:

1. Log in to Swiggy.
2. Select or confirm delivery context/address.
3. Search restaurants using Swiggy-provided restaurant search.
4. Pick one restaurant.
5. Set a strict cutoff time.
6. Create the Kapi session.

After creation, Kapi generates a session id/link that the organiser can share internally.

### 2. Participants Join

Participants open the shared session link.

Required steps:

1. Enter a display name.
2. Join the session.
3. Kapi creates a local participant session for that browser/device.

Participants do not authenticate with Swiggy.

For v0, participant identity can be lightweight:

- Browser-local participant id.
- Display name stored locally and shared only with the organiser/session, not with a Kapi backend.
- No password/account system.

### 3. Participants Build A Personal Draft Cart

Participants browse the selected restaurant's menu inside Kapi.

They can:

- Search menu items.
- View item names, prices, descriptions, images if available.
- Choose variants and addons where supported.
- Add items to their own local draft cart.
- Edit quantities/customizations before submitting.

This draft cart is not yet part of the shared Kapi cart.

### 4. Participants Submit To Shared Kapi Cart

Once a participant is sure, they press a clear submit/place action.

This action moves their draft items into the session's shared Kapi cart.

For naming clarity, the UI should avoid making this sound like the Swiggy order is placed. Good labels:

- "Submit items"
- "Add to group cart"
- "Confirm my items"

Avoid:

- "Place order" for participant submission.

After submission, the participant can still edit their submitted items until cutoff, unless v0 chooses to make submissions final. The recommended v0 behavior is to allow edits before cutoff.

### 5. Cutoff Locks Participant Changes

At the strict cutoff time:

- Participants can no longer add items.
- Participants can no longer edit submitted items.
- Participants can still view the session summary.
- The organiser can still edit the shared Kapi cart.

The cutoff should be enforced server-side, not just in the browser.

### 6. Organiser Reviews And Edits

After cutoff, the organiser sees the consolidated Kapi cart.

The organiser can:

- View items grouped by participant.
- View total quantity per item.
- View estimated total.
- Remove problematic items.
- Adjust quantities.
- Handle unavailable/customization conflicts if Swiggy rejects cart sync.

### 7. Organiser Syncs To Swiggy Cart

When ready, the organiser presses the final sync action.

Recommended label:

- "Add to Swiggy cart"

This calls Swiggy MCP to add/update the selected restaurant items in the organiser's Swiggy account cart.

Before syncing, Kapi should show a confirmation if the organiser's existing Swiggy cart is not empty or belongs to another restaurant. Swiggy Food carts are generally restaurant-scoped, so switching restaurants may clear the existing cart.

After syncing, Kapi should read back the Swiggy cart and show:

- Items successfully added.
- Items that failed.
- Swiggy cart total.
- Any changed prices.
- Any missing/unavailable items.

### 8. Organiser Pays In Swiggy

Kapi does not place the v0 order.

After successful cart sync:

1. The organiser opens Swiggy mobile app or web.
2. The organiser reviews the cart.
3. The organiser applies coupons/payment method if desired.
4. The organiser places and pays for the order in Swiggy.

This avoids relying on MCP `place_food_order`, which currently has beta restrictions including an order-value cap.

## Key Concepts

### Kapi Session

A Kapi session is the internal group-order container.

It owns:

- Organiser identity.
- Swiggy auth reference for organiser.
- Delivery address/context.
- Selected restaurant.
- Cutoff time.
- Participant list.
- Shared Kapi cart.
- Sync status.

### Participant Draft Cart

A participant draft cart lives in the participant's browser until submitted.

It exists to prevent accidental shared-cart changes while someone is still deciding.

### Shared Kapi Cart

The shared Kapi cart is the source of truth for the group order before Swiggy sync.

It should store enough Swiggy item/customization identifiers to later recreate the same items in Swiggy cart.

Under the privacy rule, the shared Kapi cart may be stored as active session data if needed, but it should be short-lived and scoped to the session.

Do not use shared cart data to build long-term participant profiles.

### Swiggy Cart

The Swiggy cart belongs to the authenticated organiser's Swiggy account.

Kapi only writes to this cart after organiser confirmation.

Swiggy payment data, auth tokens, and account details should remain between the organiser's machine and Swiggy wherever possible.

## v0 Permissions

### Organiser

Can:

- Authenticate with Swiggy.
- Create a session.
- Select restaurant and cutoff.
- Share session link.
- View all participant items.
- Edit shared Kapi cart before and after cutoff.
- Lock session manually if needed.
- Sync final order to Swiggy cart.

### Participant

Can:

- Join session with display name.
- Browse selected restaurant menu.
- Build local draft cart.
- Submit items to shared Kapi cart before cutoff.
- Edit or remove their own items before cutoff.
- View session/cart summary.

Cannot:

- Change restaurant.
- Change cutoff.
- Sync to Swiggy.
- Edit other participants' items.
- Add/edit items after cutoff.

## v0 States

Session states:

- `draft`: Organiser is configuring session.
- `open`: Participants can join and submit items.
- `locked`: Cutoff reached or organiser manually locked; participants cannot edit.
- `syncing`: Kapi is writing final cart to Swiggy.
- `synced`: Swiggy cart sync completed.
- `sync_failed`: Swiggy cart sync failed or partially failed.
- `closed`: Organiser is done with the session.

Participant item states:

- `draft`: Local only, not submitted.
- `submitted`: In shared Kapi cart.
- `locked`: Submitted item after cutoff.
- `removed`: Removed by participant before cutoff or organiser.
- `sync_failed`: Could not be added to Swiggy cart.
- `synced`: Added to Swiggy cart.

## Swiggy MCP Usage

Expected v0 Swiggy MCP needs:

- Authenticate organiser with OAuth.
- Fetch organiser addresses.
- Search restaurants for the selected address/context.
- Fetch/search menu for selected restaurant.
- Resolve item customization identifiers for variants/addons.
- Read current Swiggy Food cart.
- Flush or replace Swiggy Food cart after organiser confirmation if needed.
- Add final Kapi cart items to Swiggy Food cart.
- Read back final Swiggy Food cart.

Privacy requirements for MCP usage:

- Prefer direct organiser-client to Swiggy MCP calls.
- If OAuth/MCP cannot safely run from the browser because of CORS, secrets, or OAuth redirect constraints, design the server side so Swiggy tokens and account data are stored minimally or not at all.
- Do not log OAuth payloads, addresses, payment data, Swiggy account data, or raw cart contents.

Out of scope for v0:

- Calling `place_food_order`.
- Payment handling.
- Order cancellation.
- Delivery tracking.

## Open Questions

- Can `update_food_cart` add cart values around INR 15,000, even though `place_food_order` is capped?
- Does Swiggy MCP expose enough restaurant search context after selecting a saved address, or do we need additional location inputs?
- Can Swiggy MCP produce a deep link to open the synced cart in the Swiggy mobile app?
- What exact item/customization payload should Kapi persist to reliably recreate cart items later?
- How often do menu item IDs/customization IDs change during a session?
- How should unavailable items be surfaced during final sync?
- Should participant edits after submission be allowed in v0, or should submission be final until organiser edits?
- Should organiser login be required before session creation, or can session creation start with restaurant search after login only?
- Can Swiggy MCP be called directly from browser clients, or does it require server-side mediation?
- If browser-direct MCP is not possible, what is the least-invasive hosted OAuth/MCP design?
- Is an end-to-end encrypted relay worth the complexity for v0, or should it wait until real privacy requirements demand it?

## v0 Non-Goals

- Replacing Swiggy checkout.
- Handling payments.
- Supporting multiple restaurants in one session.
- Supporting multiple organisers.
- Requiring participant accounts.
- Building a public marketplace product.
- Launching production integration without Swiggy approval if required.
- Sending personal order data to analytics or third-party logging services.
- Building behavioural profiles from participant order history.

## Success Criteria

v0 is successful if:

- Organiser can create a session for one Swiggy restaurant.
- Participants can join without Swiggy and submit food items.
- Cutoff reliably locks participant edits.
- Organiser can review/edit consolidated cart.
- Kapi can sync the consolidated cart to the organiser's Swiggy cart.
- Organiser can open Swiggy and complete payment without manually adding every item.

## Quality Of Life Improvements

These are not all required for v0, but they are high-value for a company using Kapi regularly.

These improvements are accepted as product-spec considerations. They should be evaluated during planning and prioritised based on how much organiser effort they remove.

### Reusable Order Templates

Many offices order from the same few restaurants.

Useful shortcuts:

- Repeat last session.
- Save favourite restaurants per office/location.
- Save default cutoff duration, for example "45 minutes from now".
- Save common session names like "Friday snacks" or "Lunch order".

This makes session creation a two-click flow for regular organisers.

### Participant Memory

Participants should not need to re-enter basics every time.

Store locally:

- Display name.
- Last used participant id.
- Favourite items per restaurant.
- Common customizations.

No account system is needed for v0, but local memory saves repeated effort.

### Personal Reorder

For regular orders, participants often pick the same item.

Useful actions:

- "Order this again" from previous sessions.
- "My usual" per restaurant.
- Duplicate a submitted item before cutoff.

This can be local-only at first, then later tied to company login if needed.

### Cutoff Nudges

Cutoff discipline is the core operational problem.

Useful behavior:

- Visible countdown on participant pages.
- Organizer can manually lock early.
- Organizer can extend cutoff once, with a visible audit note.
- Warning banner in the last 5 minutes.
- Browser notification or Slack reminder later.

Server-side cutoff remains mandatory.

### Participant Status Board

Organisers often need to know who has ordered and who has not.

Useful view:

- Joined participants.
- Submitted participants.
- Participants with only draft items.
- Total participants and total submitted items.

This should not block ordering, but it helps the organiser decide when to lock.

### Shareable Internal Summary

After cutoff, people often ask "what did I order?" or "how much do I owe?"

Useful summary:

- Items grouped by participant.
- Per-participant subtotal.
- Grand total.
- Copyable text summary.
- Download/export as CSV.

This is also useful if Swiggy sync fails and the organiser must add items manually.

### Payment Split Support

Even if Swiggy payment happens in the organiser's app, internal settlement matters.

Useful v0/v1 features:

- Per-person subtotal.
- Optional delivery/platform fee split.
- Optional discount allocation.
- Round-off handling.
- Mark participant as paid.
- UPI collection note/QR field for organiser.

Avoid trying to automate payment in v0. Just make reconciliation painless.

### Cart Conflict Handling

Swiggy cart sync can fail because items become unavailable, prices change, or customizations are invalid.

The organiser needs a repair flow:

- Show failed items clearly.
- Keep failed items in Kapi cart.
- Allow remove/replace item.
- Re-search menu from the same restaurant.
- Retry sync only for failed/changed items.

Do not leave the organiser guessing after a partial sync.

### Existing Swiggy Cart Protection

Before writing to Swiggy cart, Kapi should check the organiser's current Swiggy cart.

If it is not empty:

- Show restaurant name and cart total if available.
- Ask before flushing/replacing.
- Offer "cancel sync" so the organiser can inspect Swiggy first.

This prevents accidentally wiping a personal cart.

### Restaurant Availability Check

Before final sync, Kapi should re-check restaurant and item availability.

If the restaurant is closed or not deliverable:

- Keep the Kapi session intact.
- Let organiser choose a different restaurant only if we later support remapping items.
- For v0, show a clear blocker and manual fallback summary.

### Manual Fallback Mode

Even with Swiggy MCP, the app should be useful when sync fails or access is not available.

Fallback output:

- Consolidated item list.
- Grouped identical items where possible.
- Customizations and notes included.
- Participant names included separately.
- Copyable checklist for Swiggy manual entry.

This protects the core use case from API/MCP instability.

### Organizer Audit Trail

For workplace trust, record key changes:

- Session created.
- Cutoff changed.
- Session locked.
- Participant submitted/edited/removed items.
- Organizer removed/edited items.
- Swiggy sync attempted/succeeded/failed.

This can be simple event history. It helps resolve "who changed my order?" questions.

### Slack/Teams Integration Later

For regular company usage, discovery and reminders matter.

Useful later:

- Post session link to a Slack channel.
- Send cutoff reminder.
- Send final summary.
- Let people join from Slack link.

This is a v1 feature, not necessary for the first product build.

### Admin Defaults

If multiple teams use this, company-level defaults help:

- Office locations.
- Common organisers.
- Allowed restaurants/favourites.
- Default cutoff duration.
- Whether participants can edit after submitting.
- Whether organiser approval is required before sync.

This should wait until repeated usage proves the need.
