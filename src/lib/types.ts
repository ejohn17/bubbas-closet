/**
 * Domain model for Bubbas Closet.
 *
 * All timestamps are epoch milliseconds (numbers) rather than Firestore
 * Timestamps so documents pass straight from server components to the client
 * without a serialization step.
 */

export type Address = {
  name: string;
  line1: string;
  line2?: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
};

export type SizeProfile = {
  tops?: string;
  bottoms?: string;
  dresses?: string;
  shoes?: string;
  notes?: string;
};

export type UserDoc = {
  uid: string;
  email: string | null;
  name?: string | null;
  /** Set manually in Firestore to grant access to /admin. */
  isAdmin?: boolean;
  stripeCustomerId?: string | null;
  sizeProfile?: SizeProfile;
  shippingAddress?: Address | null;
  createdAt: number;
  updatedAt: number;
};

/** Mirrors Stripe subscription statuses. */
export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "incomplete"
  | "incomplete_expired"
  | "unpaid"
  | "paused";

/** Statuses that unlock the members-only portal. */
export const ENTITLED_STATUSES: SubscriptionStatus[] = ["active", "trialing"];

export type SubscriptionDoc = {
  /** Stripe subscription id. */
  id: string;
  uid: string;
  stripeCustomerId: string;
  status: SubscriptionStatus;
  priceId: string;
  tierId: string;
  itemLimit: number;
  currentPeriodStart: number;
  currentPeriodEnd: number;
  cancelAtPeriodEnd: boolean;
  /** Set when a downgrade is scheduled for the next cycle. */
  pendingTierId?: string | null;
  createdAt: number;
  updatedAt: number;
};

export type ProductDoc = {
  id: string;
  title: string;
  description: string;
  brand?: string;
  category?: string;
  tags: string[];
  images: string[];
  /** Sizes this style is offered in; unit availability is what actually gates. */
  sizes: string[];
  retailValueCents?: number;
  active: boolean;
  createdAt: number;
  updatedAt: number;
};

export type UnitStatus =
  | "available"
  | "reserved"
  | "out"
  | "cleaning"
  | "retired";

export type UnitCondition = "new" | "excellent" | "good" | "fair";

export type UnitDoc = {
  id: string;
  productId: string;
  /** Denormalized so admin lists and boxes render without extra reads. */
  productTitle: string;
  size: string;
  sku?: string;
  condition: UnitCondition;
  status: UnitStatus;
  /** Member currently holding or renting this unit. */
  holderUid?: string | null;
  holdId?: string | null;
  holdExpiresAt?: number | null;
  pickId?: string | null;
  notes?: string;
  createdAt: number;
  updatedAt: number;
};

/** A reserve-on-add hold. The set of a member's live holds is their box. */
export type HoldDoc = {
  id: string;
  uid: string;
  unitId: string;
  productId: string;
  productTitle: string;
  size: string;
  image?: string;
  createdAt: number;
  expiresAt: number;
};

export type PickStatus =
  | "pending"
  | "shipped"
  | "partially_returned"
  | "returned"
  | "cancelled";

export type PickItem = {
  unitId: string;
  productId: string;
  productTitle: string;
  size: string;
  image?: string;
  returnedAt?: number | null;
  returnCondition?: UnitCondition | null;
};

export type PickDoc = {
  id: string;
  uid: string;
  email: string | null;
  /** Billing cycle this pick belongs to; one pick per cycle. */
  cycleKey: string;
  tierId: string;
  itemLimit: number;
  items: PickItem[];
  status: PickStatus;
  shippingAddress?: Address | null;
  carrier?: string;
  trackingNumber?: string;
  /** When the member is expected to have returned everything. */
  dueAt?: number | null;
  feeCents?: number;
  notes?: string;
  createdAt: number;
  shippedAt?: number | null;
  returnedAt?: number | null;
  reminderSentAt?: number | null;
  overdueNotifiedAt?: number | null;
};

export type FavoriteDoc = {
  id: string;
  uid: string;
  productId: string;
  createdAt: number;
};

export type WaitlistDoc = {
  email: string;
  createdAt: number;
  source?: string;
  mailchimpSyncedAt?: number | null;
};
