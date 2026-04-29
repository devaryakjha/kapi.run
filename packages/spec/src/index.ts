import * as v from "valibot";

export const sessionStates = [
  "draft",
  "open",
  "locked",
  "syncing",
  "synced",
  "sync_failed",
  "closed",
] as const;

export const participantItemStates = [
  "submitted",
  "locked",
  "removed",
  "sync_failed",
  "synced",
] as const;

export const restaurantSchema = v.object({
  id: v.string(),
  name: v.pipe(v.string(), v.minLength(1)),
  cuisine: v.string(),
  locality: v.string(),
  rating: v.number(),
  etaMinutes: v.pipe(v.number(), v.integer(), v.minValue(1)),
  imageUrl: v.string(),
  isOpen: v.boolean(),
});

export const menuItemSchema = v.object({
  id: v.string(),
  restaurantId: v.string(),
  name: v.pipe(v.string(), v.minLength(1)),
  description: v.string(),
  category: v.pipe(v.string(), v.minLength(1)),
  pricePaise: v.pipe(v.number(), v.integer(), v.minValue(0)),
  imageUrl: v.string(),
  isVeg: v.boolean(),
  isAvailable: v.boolean(),
  isBestseller: v.boolean(),
});

export const participantSchema = v.object({
  id: v.string(),
  displayName: v.pipe(v.string(), v.minLength(1)),
  joinedAt: v.string(),
});

export const participantItemSchema = v.object({
  id: v.string(),
  participantId: v.string(),
  participantName: v.string(),
  menuItemId: v.string(),
  name: v.string(),
  category: v.string(),
  imageUrl: v.string(),
  quantity: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(20)),
  unitPricePaise: v.pipe(v.number(), v.integer(), v.minValue(0)),
  notes: v.optional(v.string(), ""),
  state: v.picklist(participantItemStates),
  submittedAt: v.string(),
});

export const kapiSessionSchema = v.object({
  id: v.string(),
  restaurant: restaurantSchema,
  cutoffAt: v.string(),
  state: v.picklist(sessionStates),
  createdAt: v.string(),
  participants: v.array(participantSchema),
  items: v.array(participantItemSchema),
});

export const createSessionInputSchema = v.object({
  restaurantId: v.pipe(v.string(), v.minLength(1)),
  cutoffMinutes: v.pipe(v.number(), v.integer(), v.minValue(5), v.maxValue(180)),
});

export const joinSessionInputSchema = v.object({
  displayName: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(40)),
});

export const submitItemInputSchema = v.object({
  participantId: v.string(),
  menuItemId: v.string(),
  quantity: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(20)),
  notes: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(120)), ""),
});

export type Restaurant = v.InferOutput<typeof restaurantSchema>;
export type MenuItem = v.InferOutput<typeof menuItemSchema>;
export type Participant = v.InferOutput<typeof participantSchema>;
export type ParticipantItem = v.InferOutput<typeof participantItemSchema>;
export type KapiSession = v.InferOutput<typeof kapiSessionSchema>;
export type CreateSessionInput = v.InferOutput<typeof createSessionInputSchema>;
export type JoinSessionInput = v.InferOutput<typeof joinSessionInputSchema>;
export type SubmitItemInput = v.InferOutput<typeof submitItemInputSchema>;

const image = (id: string) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=900&q=80`;

export const stubRestaurants: Restaurant[] = [
  {
    id: "truffles-indiranagar",
    name: "Truffles",
    cuisine: "Burgers, Continental",
    locality: "Indiranagar",
    rating: 4.4,
    etaMinutes: 28,
    imageUrl: image("photo-1550547660-d9450f859349"),
    isOpen: true,
  },
  {
    id: "meghana-residency",
    name: "Meghana Foods",
    cuisine: "Biryani, Andhra",
    locality: "Residency Road",
    rating: 4.6,
    etaMinutes: 34,
    imageUrl: image("photo-1563379091339-03246963d4f6"),
    isOpen: true,
  },
  {
    id: "rameshwaram-cafe",
    name: "The Rameshwaram Cafe",
    cuisine: "South Indian",
    locality: "Brookefield",
    rating: 4.5,
    etaMinutes: 22,
    imageUrl: image("photo-1630383249896-424e482df921"),
    isOpen: true,
  },
];

export const stubMenus: Record<string, MenuItem[]> = {
  "truffles-indiranagar": [
    {
      id: "truffles-all-american-cheese-burger",
      restaurantId: "truffles-indiranagar",
      name: "All American Cheese Burger",
      description: "Grilled patty, cheddar, lettuce, tomato, house sauce.",
      category: "Burgers",
      pricePaise: 28900,
      imageUrl: image("photo-1568901346375-23c9450c58cd"),
      isVeg: false,
      isAvailable: true,
      isBestseller: true,
    },
    {
      id: "truffles-peri-peri-fries",
      restaurantId: "truffles-indiranagar",
      name: "Peri Peri Fries",
      description: "Crisp fries tossed with chilli garlic seasoning.",
      category: "Sides",
      pricePaise: 15900,
      imageUrl: image("photo-1630384060421-cb20d0e0649d"),
      isVeg: true,
      isAvailable: true,
      isBestseller: false,
    },
    {
      id: "truffles-chocolate-shake",
      restaurantId: "truffles-indiranagar",
      name: "Chocolate Shake",
      description: "Cold cocoa shake with vanilla ice cream.",
      category: "Drinks",
      pricePaise: 17900,
      imageUrl: image("photo-1577805947697-89e18249d767"),
      isVeg: true,
      isAvailable: true,
      isBestseller: false,
    },
  ],
  "meghana-residency": [
    {
      id: "meghana-chicken-biryani",
      restaurantId: "meghana-residency",
      name: "Chicken Biryani",
      description: "Aromatic rice, slow-cooked chicken, salan, and raita.",
      category: "Biryani",
      pricePaise: 31900,
      imageUrl: image("photo-1563379091339-03246963d4f6"),
      isVeg: false,
      isAvailable: true,
      isBestseller: true,
    },
    {
      id: "meghana-paneer-biryani",
      restaurantId: "meghana-residency",
      name: "Paneer Biryani",
      description: "Paneer, fragrant rice, herbs, salan, and raita.",
      category: "Biryani",
      pricePaise: 28900,
      imageUrl: image("photo-1631515243349-e0cb75fb8d3a"),
      isVeg: true,
      isAvailable: true,
      isBestseller: false,
    },
    {
      id: "meghana-apollo-fish",
      restaurantId: "meghana-residency",
      name: "Apollo Fish",
      description: "Spicy fried fish with curry leaves and chillies.",
      category: "Starters",
      pricePaise: 36900,
      imageUrl: image("photo-1615141982883-c7ad0e69fd62"),
      isVeg: false,
      isAvailable: true,
      isBestseller: false,
    },
  ],
  "rameshwaram-cafe": [
    {
      id: "rameshwaram-ghee-podi-idli",
      restaurantId: "rameshwaram-cafe",
      name: "Ghee Podi Idli",
      description: "Soft idlis, podi, ghee, sambar, and chutney.",
      category: "Breakfast",
      pricePaise: 12900,
      imageUrl: image("photo-1630383249896-424e482df921"),
      isVeg: true,
      isAvailable: true,
      isBestseller: true,
    },
    {
      id: "rameshwaram-masala-dosa",
      restaurantId: "rameshwaram-cafe",
      name: "Masala Dosa",
      description: "Crisp dosa with potato palya, sambar, and chutney.",
      category: "Dosa",
      pricePaise: 16900,
      imageUrl: image("photo-1668236543090-82eba5ee5976"),
      isVeg: true,
      isAvailable: true,
      isBestseller: false,
    },
    {
      id: "rameshwaram-filter-coffee",
      restaurantId: "rameshwaram-cafe",
      name: "Filter Coffee",
      description: "Strong decoction, hot milk, lightly sweetened.",
      category: "Drinks",
      pricePaise: 6900,
      imageUrl: image("photo-1509042239860-f550ce710b93"),
      isVeg: true,
      isAvailable: true,
      isBestseller: false,
    },
  ],
};

export const defaultRestaurantId = stubRestaurants[0]?.id ?? "";

export function getStubRestaurant(restaurantId: string) {
  return stubRestaurants.find((restaurant) => restaurant.id === restaurantId);
}

export function getStubMenu(restaurantId: string) {
  return stubMenus[restaurantId] ?? [];
}

export function formatMoney(pricePaise: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(pricePaise / 100);
}

export function sessionTotalPaise(session: KapiSession) {
  return session.items
    .filter((item) => item.state !== "removed")
    .reduce((total, item) => total + item.quantity * item.unitPricePaise, 0);
}
