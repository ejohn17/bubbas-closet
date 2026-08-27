import type { Query } from "firebase-admin/firestore";
import { requireDb } from "@/lib/firebase-admin";
import type {
  Address,
  HoldDoc,
  PickDoc,
  PickItem,
  PickStatus,
  UnitCondition,
  UnitDoc,
} from "@/lib/types";
import { clean, COL, docTo, docsTo, DomainError, nowMs } from "@/lib/db/base";
import { isRentableCondition } from "@/lib/rules";

/**
 * Picks are the monthly rental orders that replace the original Shopify $0
 * orders. Creating one converts the member's live holds into an order and moves
 * every unit to `out`; there is no customer checkout because the subscription
 * already covers the rental.
 */

export async function getPick(id: string): Promise<PickDoc | null> {
  const snap = await requireDb().collection(COL.picks).doc(id).get();
  return docTo<PickDoc>(snap);
}

export async function listPicks(options?: {
  uid?: string;
  status?: PickStatus;
  overdueOnly?: boolean;
}): Promise<PickDoc[]> {
  const db = requireDb();
  const base: Query = db.collection(COL.picks);
  const filtered = options?.uid
    ? base.where("uid", "==", options.uid)
    : options?.status
      ? base.where("status", "==", options.status)
      : base;

  const snap = await filtered.get();
  let picks = docsTo<PickDoc>(snap.docs);

  if (options?.uid && options.status) {
    picks = picks.filter((p) => p.status === options.status);
  }
  if (options?.overdueOnly) {
    const at = nowMs();
    picks = picks.filter((p) => isOverdue(p, at));
  }

  return picks.sort((a, b) => b.createdAt - a.createdAt);
}

export function isOverdue(pick: PickDoc, at = nowMs()): boolean {
  if (!pick.dueAt) return false;
  if (pick.status !== "shipped" && pick.status !== "partially_returned") {
    return false;
  }
  return pick.dueAt < at;
}

export function outstandingItems(pick: PickDoc): PickItem[] {
  return pick.items.filter((item) => !item.returnedAt);
}

export async function findPickForCycle(
  uid: string,
  cycleKey: string,
): Promise<PickDoc | null> {
  const snap = await requireDb()
    .collection(COL.picks)
    .where("uid", "==", uid)
    .get();
  return (
    docsTo<PickDoc>(snap.docs).find(
      (p) => p.cycleKey === cycleKey && p.status !== "cancelled",
    ) ?? null
  );
}

/** Turns the member's live holds into a pending pick order. */
export async function confirmBox(input: {
  uid: string;
  email: string | null;
  cycleKey: string;
  tierId: string;
  itemLimit: number;
  shippingAddress?: Address | null;
  dueAt?: number | null;
}): Promise<PickDoc> {
  const db = requireDb();
  const pickRef = db.collection(COL.picks).doc();
  const holdsQuery = db.collection(COL.holds).where("uid", "==", input.uid);
  const picksQuery = db.collection(COL.picks).where("uid", "==", input.uid);

  return db.runTransaction(async (tx) => {
    const at = nowMs();
    const [holdsSnap, picksSnap] = await Promise.all([
      tx.get(holdsQuery),
      tx.get(picksQuery),
    ]);

    const alreadyPicked = docsTo<PickDoc>(picksSnap.docs).find(
      (p) => p.cycleKey === input.cycleKey && p.status !== "cancelled",
    );
    if (alreadyPicked) {
      throw new DomainError(
        "already_picked",
        "You've already confirmed a box for this billing cycle.",
        409,
      );
    }

    const holds = docsTo<HoldDoc>(holdsSnap.docs)
      .filter((h) => h.expiresAt > at)
      .sort((a, b) => a.createdAt - b.createdAt);

    if (!holds.length) {
      throw new DomainError("empty_box", "Add some pieces to your box first.");
    }
    if (holds.length > input.itemLimit) {
      throw new DomainError(
        "limit_reached",
        `Your plan covers ${input.itemLimit} items per month.`,
      );
    }

    const unitRefs = holds.map((h) => db.collection(COL.units).doc(h.unitId));
    const unitSnaps = await tx.getAll(...unitRefs);
    const units = unitSnaps.map((s) => docTo<UnitDoc>(s));

    units.forEach((unit, index) => {
      const hold = holds[index];
      if (!unit || unit.holdId !== hold.id) {
        throw new DomainError(
          "hold_expired",
          "One of your pieces was released before you confirmed. Refresh your box and try again.",
          409,
        );
      }
    });

    const items: PickItem[] = holds.map((hold, index) => ({
      unitId: hold.unitId,
      productId: hold.productId,
      productTitle: hold.productTitle,
      size: hold.size,
      condition: hold.condition ?? units[index]?.condition,
      image: hold.image,
      returnedAt: null,
      returnCondition: null,
    }));

    const pick: PickDoc = {
      id: pickRef.id,
      uid: input.uid,
      email: input.email,
      cycleKey: input.cycleKey,
      tierId: input.tierId,
      itemLimit: input.itemLimit,
      items,
      status: "pending",
      shippingAddress: input.shippingAddress ?? null,
      dueAt: input.dueAt ?? null,
      createdAt: at,
      shippedAt: null,
      returnedAt: null,
    };

    tx.set(pickRef, clean(pick));

    holds.forEach((hold, index) => {
      tx.delete(db.collection(COL.holds).doc(hold.id));
      tx.set(
        unitRefs[index],
        {
          status: "out",
          holderUid: input.uid,
          holdId: null,
          holdExpiresAt: null,
          pickId: pickRef.id,
          updatedAt: at,
        },
        { merge: true },
      );
    });

    return pick;
  });
}

export async function markShipped(
  id: string,
  input: { carrier?: string; trackingNumber?: string },
): Promise<void> {
  const db = requireDb();
  const ref = db.collection(COL.picks).doc(id);
  const snap = await ref.get();
  const pick = docTo<PickDoc>(snap);
  if (!pick) throw new DomainError("pick_not_found", "Order not found.", 404);

  await ref.set(
    clean({
      status: "shipped" as PickStatus,
      carrier: input.carrier?.trim() || undefined,
      trackingNumber: input.trackingNumber?.trim() || undefined,
      shippedAt: pick.shippedAt ?? nowMs(),
    }),
    { merge: true },
  );
}

/**
 * Records a return. Omit `unitIds` to receive the whole order. Returned units
 * move to `cleaning`, from where admin flips them back to `available`.
 */
export async function markReturned(
  id: string,
  input?: { unitIds?: string[]; condition?: UnitCondition },
): Promise<PickDoc> {
  const db = requireDb();
  const pickRef = db.collection(COL.picks).doc(id);

  return db.runTransaction(async (tx) => {
    const at = nowMs();
    const pickSnap = await tx.get(pickRef);
    const pick = docTo<PickDoc>(pickSnap);
    if (!pick) throw new DomainError("pick_not_found", "Order not found.", 404);

    const target = input?.unitIds?.length
      ? new Set(input.unitIds)
      : new Set(pick.items.filter((i) => !i.returnedAt).map((i) => i.unitId));

    const unitRefs = [...target].map((unitId) =>
      db.collection(COL.units).doc(unitId),
    );
    const unitSnaps = unitRefs.length ? await tx.getAll(...unitRefs) : [];

    const items = pick.items.map((item) =>
      target.has(item.unitId) && !item.returnedAt
        ? {
            ...item,
            returnedAt: at,
            returnCondition: input?.condition ?? item.returnCondition ?? null,
          }
        : item,
    );

    const allReturned = items.every((item) => Boolean(item.returnedAt));
    const status: PickStatus = allReturned ? "returned" : "partially_returned";

    tx.set(
      pickRef,
      clean({
        items,
        status,
        returnedAt: allReturned ? at : null,
      }),
      { merge: true },
    );

    // A garment graded below the rentable range on return is retired instead of
    // being cleaned and re-listed (decisions C.6).
    const retiring = input?.condition
      ? !isRentableCondition(input.condition)
      : false;

    unitSnaps.forEach((unitSnap, index) => {
      if (!unitSnap.exists) return;
      tx.set(
        unitRefs[index],
        clean({
          status: retiring ? "retired" : "cleaning",
          holderUid: null,
          pickId: null,
          condition: input?.condition,
          updatedAt: at,
        }),
        { merge: true },
      );
    });

    return { ...pick, items, status } as PickDoc;
  });
}

/** Cancels a pending order and returns every unit to the catalogue. */
export async function cancelPick(id: string): Promise<void> {
  const db = requireDb();
  const pickRef = db.collection(COL.picks).doc(id);

  await db.runTransaction(async (tx) => {
    const at = nowMs();
    const pickSnap = await tx.get(pickRef);
    const pick = docTo<PickDoc>(pickSnap);
    if (!pick) throw new DomainError("pick_not_found", "Order not found.", 404);
    if (pick.status !== "pending") {
      throw new DomainError(
        "not_cancellable",
        "Only orders that haven't shipped can be cancelled.",
      );
    }

    const unitRefs = pick.items.map((item) =>
      db.collection(COL.units).doc(item.unitId),
    );
    const unitSnaps = unitRefs.length ? await tx.getAll(...unitRefs) : [];

    tx.set(
      pickRef,
      { status: "cancelled" satisfies PickStatus },
      { merge: true },
    );

    unitSnaps.forEach((unitSnap, index) => {
      if (!unitSnap.exists) return;
      tx.set(
        unitRefs[index],
        {
          status: "available",
          holderUid: null,
          holdId: null,
          holdExpiresAt: null,
          pickId: null,
          updatedAt: at,
        },
        { merge: true },
      );
    });
  });
}

export async function recordFee(id: string, feeCents: number): Promise<void> {
  const db = requireDb();
  const ref = db.collection(COL.picks).doc(id);
  const snap = await ref.get();
  const pick = docTo<PickDoc>(snap);
  if (!pick) throw new DomainError("pick_not_found", "Order not found.", 404);

  await ref.set(
    { feeCents: (pick.feeCents ?? 0) + feeCents, updatedAt: nowMs() },
    { merge: true },
  );
}

export async function markReminderSent(
  id: string,
  field: "reminderSentAt" | "overdueNotifiedAt",
): Promise<void> {
  await requireDb()
    .collection(COL.picks)
    .doc(id)
    .set({ [field]: nowMs() }, { merge: true });
}

export async function updatePickNotes(
  id: string,
  notes: string,
): Promise<void> {
  await requireDb()
    .collection(COL.picks)
    .doc(id)
    .set({ notes }, { merge: true });
}
