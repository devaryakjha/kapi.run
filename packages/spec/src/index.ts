export type SessionStatus =
  | "open"
  | "locked"
  | "syncing"
  | "synced"
  | "sync_failed"
  | "closed";

export type RelayWriteRole = "organizer" | "participant";

export type RelaySessionMetadata = {
  cutoffAt?: string;
  status: SessionStatus;
  organizerSecretHash?: string;
};

export type RelayWritePayload = {
  ciphertext: string;
  expectedUpdatedAt?: string | null;
  metadata?: RelaySessionMetadata;
  role?: RelayWriteRole;
};

export type SessionInvite = {
  id: string;
  sessionId: string;
  key: string;
  createdAt: string;
};

export type Address = {
  id: string;
  label: string;
  detail: string;
};

export type Restaurant = {
  id: string;
  name: string;
  area: string;
  rating: number;
  totalRatings?: string;
  costForTwo?: string;
  distanceKm?: number;
  deliveryTimeRange?: string;
  offer?: string;
  imageUrl?: string;
  availabilityStatus: "OPEN" | "CLOSED";
};

export type MenuItem = {
  id: string;
  restaurantId: string;
  name: string;
  category: string;
  description: string;
  price: number;
  imageUrl?: string;
  tags?: string[];
  rating?: string;
  totalRatings?: string;
  hasVariants?: boolean;
  hasAddons?: boolean;
  available: boolean;
  swiggyItemId: string;
};

export type MenuVariantChoice = {
  id: string;
  name: string;
  price?: number;
  inStock?: boolean;
  default?: boolean;
};

export type MenuVariantGroup = {
  groupId: string;
  name: string;
  variations: MenuVariantChoice[];
};

export type MenuAddonChoice = {
  id: string;
  name: string;
  price: number;
};

export type MenuAddonGroup = {
  groupId: string;
  groupName: string;
  choices: MenuAddonChoice[];
  minAddons?: number;
  maxAddons?: number;
};

export type MenuCustomization = {
  menuItemId: string;
  description?: string;
  imageUrl?: string;
  rating?: string;
  totalRatings?: string;
  variantsV2?: MenuVariantGroup[];
  addons?: MenuAddonGroup[];
};

export type CartVariantSelection = {
  group_id: string;
  variation_id: string;
  groupName?: string;
  name?: string;
  price?: number;
};

export type CartAddonSelection = {
  group_id: string;
  choice_id: string;
  groupName?: string;
  name?: string;
  price?: number;
};

export type CartCustomization = {
  variantsV2?: CartVariantSelection[];
  addons?: CartAddonSelection[];
};

export type CartLine = {
  id: string;
  participantId: string;
  participantName: string;
  menuItemId: string;
  name: string;
  quantity: number;
  price: number;
  note?: string;
  available: boolean;
  swiggyItemId: string;
  customization?: CartCustomization;
  customizationSummary?: string;
  synced?: boolean;
};

export type Participant = {
  id: string;
  displayName: string;
  status: "joined" | "submitted";
  joinedAt: string;
  submittedAt?: string;
};

export type KapiSession = {
  id: string;
  organiserName: string;
  address: Address;
  restaurant: Restaurant;
  cutoffTime: string;
  cutoffAt?: string;
  shareUrl: string;
  organizerSecretHash?: string;
  status: SessionStatus;
  participants: Participant[];
  items: CartLine[];
  sync?: SyncResult;
  audit: AuditEvent[];
};

export type SyncResult = {
  status: "synced" | "failed";
  message: string;
  swiggyCartTotal?: number;
  syncedItemCount?: number;
  payload?: SwiggyCartPayload;
};

export type AuditEvent = {
  id: string;
  at: string;
  actor: string;
  action: string;
};

export type SwiggyCartToolPayload = {
  restaurantId: string;
  addressId: string;
  cartItems: Array<{
    menu_item_id: string;
    quantity: number;
    variantsV2?: Array<{
      group_id: string;
      variation_id: string;
    }>;
    addons?: Array<{
      group_id: string;
      choice_id: string;
    }>;
  }>;
};

export type SwiggyCartPayload = SwiggyCartToolPayload & {
  replaceExistingCart?: boolean;
};

export type SwiggyCartSummary = {
  empty: boolean;
  restaurantId?: string;
  restaurantName?: string;
  total?: number;
  itemCount?: number;
};

export type AuthStatus = {
  connected: boolean;
  expiresAt: number | null;
};

export type CreateSessionInput = {
  organiserName: string;
  addressId: string;
  restaurantId: string;
  cutoffTime: string;
};

export type SubmitItemsInput = {
  participantName: string;
  items: Array<{
    menuItemId: string;
    quantity: number;
    note?: string;
  }>;
};

export type UpdateCartLineInput = {
  quantity?: number;
  available?: boolean;
};

export type ManualFallbackSummary = {
  restaurantName: string;
  addressLabel: string;
  total: number;
  checklist: string[];
  byParticipant: Array<{
    participantName: string;
    total: number;
    items: string[];
  }>;
};
