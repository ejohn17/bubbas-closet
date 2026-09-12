import { requireDb } from "@/lib/firebase-admin";
import {
  ENTITLED_STATUSES,
  type SubscriptionDoc,
  type SubscriptionStatus,
} from "@/lib/types";
import { clean, COL, docTo, docsTo, nowMs } from "@/lib/db/base";

/** Ranking used when a member has more than one subscription record. */
function rank(sub: SubscriptionDoc): number {
  if (ENTITLED_STATUSES.includes(sub.status)) return 0;
  if (sub.status === "past_due" || sub.status === "unpaid") return 1;
  return 2;
}

export async function getSubscription(
  id: string,
): Promise<SubscriptionDoc | null> {
  const snap = await requireDb().collection(COL.subscriptions).doc(id).get();
  return docTo<SubscriptionDoc>(snap);
}

export async function listSubscriptionsForUser(
  uid: string,
): Promise<SubscriptionDoc[]> {
  const snap = await requireDb()
    .collection(COL.subscriptions)
    .where("uid", "==", uid)
    .get();
  return docsTo<SubscriptionDoc>(snap.docs).sort(
    (a, b) => rank(a) - rank(b) || b.updatedAt - a.updatedAt,
  );
}

/** The subscription that governs portal access — best status wins. */
export async function getPrimarySubscription(
  uid: string,
): Promise<SubscriptionDoc | null> {
  const subs = await listSubscriptionsForUser(uid);
  return subs[0] ?? null;
}

export type Entitlement = {
  subscription: SubscriptionDoc | null;
  entitled: boolean;
  itemLimit: number;
  cycleKey: string | null;
};

export async function getEntitlement(uid: string): Promise<Entitlement> {
  const subscription = await getPrimarySubscription(uid);
  const entitled = Boolean(
    subscription && ENTITLED_STATUSES.includes(subscription.status),
  );
  return {
    subscription,
    entitled,
    itemLimit: entitled ? (subscription?.itemLimit ?? 0) : 0,
    cycleKey: subscription ? cycleKeyFor(subscription) : null,
  };
}

/** Identifies the billing cycle a pick belongs to. One pick per cycle. */
export function cycleKeyFor(sub: SubscriptionDoc): string {
  return `${sub.id}-${sub.currentPeriodStart}`;
}

export async function upsertSubscription(
  input: Omit<SubscriptionDoc, "createdAt" | "updatedAt"> &
    Partial<Pick<SubscriptionDoc, "createdAt">>,
): Promise<void> {
  const db = requireDb();
  const ref = db.collection(COL.subscriptions).doc(input.id);
  const existing = await ref.get();
  const ts = nowMs();

  await ref.set(
    clean({
      ...input,
      createdAt: existing.exists
        ? (existing.data()?.createdAt as number) || ts
        : ts,
      updatedAt: ts,
    }),
    { merge: true },
  );
}

export async function setPendingTier(
  id: string,
  pendingTierId: string | null,
): Promise<void> {
  await requireDb()
    .collection(COL.subscriptions)
    .doc(id)
    .set({ pendingTierId, updatedAt: nowMs() }, { merge: true });
}

/** Admin view: every membership, most recently updated first. */
export async function listAllSubscriptions(): Promise<SubscriptionDoc[]> {
  const snap = await requireDb().collection(COL.subscriptions).get();
  return docsTo<SubscriptionDoc>(snap.docs).sort(
    (a, b) => rank(a) - rank(b) || b.updatedAt - a.updatedAt,
  );
}

export async function countSubscriptionsByStatus(): Promise<
  Record<string, number>
> {
  const snap = await requireDb().collection(COL.subscriptions).get();
  const counts: Record<string, number> = {};
  for (const doc of snap.docs) {
    const status = (doc.data().status as SubscriptionStatus) || "unknown";
    counts[status] = (counts[status] ?? 0) + 1;
  }
  return counts;
}
