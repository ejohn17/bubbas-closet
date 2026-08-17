import type {
  DocumentSnapshot,
  QueryDocumentSnapshot,
} from "firebase-admin/firestore";

/**
 * Shared Firestore helpers.
 *
 * Queries in this data layer deliberately use at most one equality filter so
 * they run on Firestore's automatic single-field indexes; any further filtering
 * and all sorting happens in memory. At catalogue scale (hundreds of styles,
 * low thousands of units) that avoids maintaining composite indexes.
 */

export const COL = {
  users: "users",
  subscriptions: "subscriptions",
  products: "products",
  units: "units",
  holds: "holds",
  picks: "picks",
  favorites: "favorites",
  waitlist: process.env.WAITLIST_COLLECTION || "waitlist",
} as const;

export function nowMs(): number {
  return Date.now();
}

export function docTo<T>(
  snap: DocumentSnapshot | QueryDocumentSnapshot,
): T | null {
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() } as T;
}

export function docsTo<T>(snaps: QueryDocumentSnapshot[]): T[] {
  return snaps.map((s) => ({ id: s.id, ...s.data() }) as T);
}

/** Strips undefined values, which Firestore rejects on write. */
export function clean<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) out[key] = value;
  }
  return out as T;
}

export function holdTtlMinutes(): number {
  const raw = Number(process.env.HOLD_TTL_MINUTES);
  return Number.isFinite(raw) && raw > 0 ? raw : 45;
}

export function returnGraceDays(): number {
  const raw = Number(process.env.RETURN_GRACE_DAYS);
  return Number.isFinite(raw) && raw >= 0 ? raw : 5;
}

export class DomainError extends Error {
  status: number;
  code: string;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}
