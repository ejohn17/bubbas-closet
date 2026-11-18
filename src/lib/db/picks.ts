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
import { estimateOutboundShippingCents, isRentableCondition } from "@/lib/rules";
import { listUnits } from "@/lib/db/units";

/**
 * Picks are the per-cycle rental orders that replace the original Shopify $0
 * orders. Creating one converts the member's live holds into an order and moves
 * every unit to `out`; there is no customer checkout because the subscription
 * already covers the rental.
 */

/** Shortest carrier tracking number we accept; catches typos, not fakes. */
const MIN_TRACKING_LENGTH = 8;

export async function getPick(id: string): Promise<PickDoc | null> {
  const snap = await requireDb().collection(COL.picks).doc(id).get();
  return docTo<PickDoc>(snap);
}

export async function listPicks(options?: {
  uid?: string;
  status?: PickStatus;
  overdueOnly?: boolean;
  search?: string;
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
  if (options?.search?.trim()) {
    picks = await filterPicksBySearch(picks, options.search);
  }

  return picks.sort((a, b) => b.createdAt - a.createdAt);
}

/** Fields a warehouse desk can type from a return package or a garment tag. */
function pickSearchText(pick: PickDoc): string {
  const address = pick.shippingAddress;
  return [
    pick.id,
    pick.email,
    pick.uid,
    pick.trackingNumber,
    pick.returnTrackingNumber,
    pick.carrier,
    address?.name,
    address?.line1,
    address?.line2,
    address?.city,
    address?.region,
    address?.postalCode,
    ...pick.items.flatMap((item) => [
      item.productTitle,
      item.unitId,
      item.sku,
      item.size,
    ]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

async function filterPicksBySearch(
  picks: PickDoc[],
  search: string,
): Promise<PickDoc[]> {
  const query = search.trim().toLowerCase();
  if (!query) return picks;

  // SKU / unit-id lookups go through inventory so older picks (no denormalized
  // sku on the line) and garments still marked `out` still resolve to an order.
  const units = await listUnits({ search });
  const unitIds = new Set(units.map((unit) => unit.id));
  const pickIds = new Set(
    units
      .map((unit) => unit.pickId)
      .filter((id): id is string => Boolean(id)),
  );

  return picks.filter(
    (pick) =>
      pickIds.has(pick.id) ||
      pick.items.some((item) => unitIds.has(item.unitId)) ||
      pickSearchText(pick).includes(query),
  );
}

export function isOverdue(pick: PickDoc, at = nowMs()): boolean {
  if (!pick.dueAt) return false;
  if (pick.status !== "shipped" && pick.status !== "partially_returned") {
    return false;
  }
  return pick.dueAt < at;
}

/** Still with the member: neither received back nor bought outright. */
export function outstandingItems(pick: PickDoc): PickItem[] {
  return pick.items.filter((item) => !item.returnedAt && !item.purchasedAt);
}

export function purchasedItems(pick: PickDoc): PickItem[] {
  return pick.items.filter((item) => Boolean(item.purchasedAt));
}

/** The member bought the whole box, so "returned" would be the wrong word. */
export function isFullyPurchased(pick: PickDoc): boolean {
  return pick.items.length > 0 && purchasedItems(pick).length === pick.items.length;
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
        `Your plan covers ${input.itemLimit} items per box.`,
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

    // Each line goes through clean(): a style with no photo, or a garment with
    // no SKU, leaves those fields undefined, and Firestore rejects undefined
    // anywhere in a document, including inside this array.
    const items: PickItem[] = holds.map((hold, index) =>
      clean({
        unitId: hold.unitId,
        productId: hold.productId,
        productTitle: hold.productTitle,
        size: hold.size,
        sku: units[index]?.sku,
        condition: hold.condition ?? units[index]?.condition,
        image: hold.image,
        returnedAt: null,
        returnCondition: null,
      }),
    );

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
      estimatedShippingCents: estimateOutboundShippingCents({
        tierId: input.tierId,
        country: input.shippingAddress?.country,
        itemCount: items.length,
      }),
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
  input: {
    carrier?: string;
    trackingNumber?: string;
    shippingCents?: number;
  },
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
      shippingCents:
        input.shippingCents !== undefined
          ? Math.round(input.shippingCents)
          : pick.shippingCents,
      shippedAt: pick.shippedAt ?? nowMs(),
      updatedAt: nowMs(),
    }),
    { merge: true },
  );
}

/**
 * The member reports their box is on its way back, which unlocks their next
 * box once the rental period ends (C.4). Garments stay `out` until admin
 * receives them with markReturned, so a box that never arrives still shows as
 * overdue in admin. Resubmitting corrects the number and keeps the original date.
 */
export async function markSentBack(
  id: string,
  uid: string,
  trackingNumber?: string,
): Promise<void> {
  const ref = requireDb().collection(COL.picks).doc(id);
  const pick = docTo<PickDoc>(await ref.get());
  if (!pick || pick.uid !== uid) {
    throw new DomainError("pick_not_found", "Order not found.", 404);
  }
  if (pick.status !== "shipped" && pick.status !== "partially_returned") {
    throw new DomainError(
      "not_returnable",
      "Return tracking can only be added to a box that's out with you.",
    );
  }

  const tracking = trackingNumber?.trim() ?? "";
  if (tracking.length < MIN_TRACKING_LENGTH) {
    throw new DomainError(
      "invalid_tracking",
      "Enter the full tracking number from your return label.",
    );
  }

  const at = nowMs();
  await ref.set(
    {
      returnTrackingNumber: tracking,
      returnShippedAt: pick.returnShippedAt ?? at,
      updatedAt: at,
    },
    { merge: true },
  );
}

/**
 * Records a return. Omit `unitIds` to receive the whole order. Returned units
 * move to `cleaning`, from where admin flips them back to `available`. Only
 * garments still out with the member are touched, so "receive everything"
 * never pulls a piece they bought back into inventory.
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

    const requested = input?.unitIds?.length ? new Set(input.unitIds) : null;
    const target = new Set(
      outstandingItems(pick)
        .filter((item) => !requested || requested.has(item.unitId))
        .map((item) => item.unitId),
    );
    if (target.size === 0) return pick;

    const unitRefs = [...target].map((unitId) =>
      db.collection(COL.units).doc(unitId),
    );
    const unitSnaps = await tx.getAll(...unitRefs);

    const items = pick.items.map((item) =>
      target.has(item.unitId)
        ? {
            ...item,
            returnedAt: at,
            returnCondition: input?.condition ?? item.returnCondition ?? null,
          }
        : item,
    );

    // Bought pieces count as dealt with: the order closes once nothing is
    // left to come back.
    const allReturned = items.every(
      (item) => Boolean(item.returnedAt) || Boolean(item.purchasedAt),
    );
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

/** One garment on a paid checkout: what was bought and what it cost. */
export type PurchaseLine = { unitId: string; priceCents: number };

/**
 * Records garments a member paid to keep instead of returning. Each one is
 * marked on the order and its unit moves to `sold`, which takes it out of
 * inventory for good. Once nothing is left to come back, the order closes the
 * same way a full return does, which also unlocks the member's next box.
 *
 * Safe to run more than once for the same checkout session: the webhook and
 * the page the member lands on after paying both call it.
 *
 * `rejected` lists lines that were paid for but can't be honoured, because the
 * garment is already back with us or was paid for in another checkout. The
 * caller owes the member a refund for those.
 */
export async function recordPurchase<Line extends PurchaseLine>(
  id: string,
  input: { uid: string; sessionId: string; lines: Line[] },
): Promise<{ purchased: PickItem[]; rejected: Line[] }> {
  const db = requireDb();
  const pickRef = db.collection(COL.picks).doc(id);

  return db.runTransaction(async (tx) => {
    const at = nowMs();
    const pick = docTo<PickDoc>(await tx.get(pickRef));
    if (!pick || pick.uid !== input.uid) {
      return { purchased: [], rejected: input.lines };
    }

    const accepted = new Map<string, Line>();
    const rejected: Line[] = [];
    for (const line of input.lines) {
      const item = pick.items.find((i) => i.unitId === line.unitId);
      if (item?.purchaseSessionId === input.sessionId) continue;
      if (!item || item.returnedAt || item.purchasedAt || accepted.has(line.unitId)) {
        rejected.push(line);
      } else {
        accepted.set(line.unitId, line);
      }
    }

    const fromThisSession = (items: PickItem[]) =>
      items.filter((item) => item.purchaseSessionId === input.sessionId);
    if (accepted.size === 0) {
      return { purchased: fromThisSession(pick.items), rejected };
    }

    const unitRefs = [...accepted.keys()].map((unitId) =>
      db.collection(COL.units).doc(unitId),
    );
    const unitSnaps = await tx.getAll(...unitRefs);

    const items = pick.items.map((item) => {
      const line = accepted.get(item.unitId);
      return line
        ? {
            ...item,
            purchasedAt: at,
            purchasePriceCents: line.priceCents,
            purchaseSessionId: input.sessionId,
          }
        : item;
    });

    const closed = items.every(
      (item) => Boolean(item.returnedAt) || Boolean(item.purchasedAt),
    );

    tx.set(
      pickRef,
      clean({
        items,
        status: closed ? ("returned" satisfies PickStatus) : pick.status,
        returnedAt: closed ? at : (pick.returnedAt ?? null),
        updatedAt: at,
      }),
      { merge: true },
    );

    // The order link stays on the unit so admin can trace a sold garment back
    // to who bought it.
    unitSnaps.forEach((unitSnap, index) => {
      if (!unitSnap.exists) return;
      tx.set(
        unitRefs[index],
        {
          status: "sold" satisfies UnitDoc["status"],
          holderUid: null,
          holdId: null,
          holdExpiresAt: null,
          pickId: id,
          updatedAt: at,
        },
        { merge: true },
      );
    });

    return { purchased: fromThisSession(items), rejected };
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

export type TestResetResult = {
  /** Garments put back in the closet (or retired, if graded unrentable). */
  restored: string[];
  /**
   * Garments that have moved on since this order, e.g. back on the shelf and
   * now with another member, so they were left as they are.
   */
  leftAlone: string[];
};

/**
 * Undoes a test order completely: every garment it touched goes back to how
 * it was before the box was confirmed, and the order is deleted. Purchased
 * pieces stop being `sold`, pieces still out come back, and pieces received
 * back are taken out of cleaning, all with the condition they shipped in.
 *
 * Only for orders placed by staff testing the site; the API route checks that
 * the order belongs to an admin account. A real member's purchase must never
 * go back on the shelf this way.
 *
 * A garment is only touched while it is still in the state this order left
 * it in. Once it has moved on (flipped back to available, or rented by someone
 * else) it is left alone, so a reset can't pull a garment out of another box.
 * Stripe charges are not refunded here.
 */
export async function resetTestPick(id: string): Promise<TestResetResult> {
  const db = requireDb();
  const pickRef = db.collection(COL.picks).doc(id);

  return db.runTransaction(async (tx) => {
    const at = nowMs();
    const pick = docTo<PickDoc>(await tx.get(pickRef));
    if (!pick) throw new DomainError("pick_not_found", "Order not found.", 404);

    const unitRefs = pick.items.map((item) =>
      db.collection(COL.units).doc(item.unitId),
    );
    const unitSnaps = unitRefs.length ? await tx.getAll(...unitRefs) : [];

    const restored: string[] = [];
    const leftAlone: string[] = [];

    pick.items.forEach((item, index) => {
      const unit = docTo<UnitDoc>(unitSnaps[index]);
      if (!unit) return;

      if (!stillFromThisOrder(unit, item, pick.id)) {
        // Already back on the shelf isn't lost, so it isn't worth reporting.
        if (unit.status !== "available") leftAlone.push(unit.id);
        return;
      }

      const condition = item.condition ?? unit.condition;
      tx.set(
        unitRefs[index],
        {
          status: isRentableCondition(condition) ? "available" : "retired",
          condition,
          holderUid: null,
          holdId: null,
          holdExpiresAt: null,
          pickId: null,
          updatedAt: at,
        } satisfies Partial<UnitDoc>,
        { merge: true },
      );
      restored.push(unit.id);
    });

    tx.delete(pickRef);
    return { restored, leftAlone };
  });
}

/**
 * Whether a garment is still exactly where this order left it. Out or sold
 * garments keep the order link. A garment received back loses the link, but
 * nothing has touched it since if its last update is the return itself.
 */
function stillFromThisOrder(
  unit: UnitDoc,
  item: PickItem,
  pickId: string,
): boolean {
  if (unit.pickId === pickId) {
    return unit.status === "out" || unit.status === "sold";
  }
  return (
    Boolean(item.returnedAt) &&
    !unit.pickId &&
    !unit.holderUid &&
    (unit.status === "cleaning" || unit.status === "retired") &&
    unit.updatedAt === item.returnedAt
  );
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
