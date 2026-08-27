import { requireDb } from "@/lib/firebase-admin";
import type { HoldDoc, UnitDoc } from "@/lib/types";
import { clean, COL, docTo, docsTo, DomainError, nowMs } from "@/lib/db/base";
import { getProduct } from "@/lib/db/products";
import { isRentableCondition, RULES } from "@/lib/rules";

/**
 * Holds implement reserve-on-add: a member's live holds *are* their box.
 *
 * Reserving is done inside a Firestore transaction so two members can never
 * take the same physical garment, and the tier limit is enforced here rather
 * than in the UI. Holds expire after RULES.holdTtlMinutes and are swept by
 * /api/cron/release-holds.
 */

function isLive(hold: HoldDoc, at: number): boolean {
  return hold.expiresAt > at;
}

export async function listHolds(uid: string): Promise<HoldDoc[]> {
  const snap = await requireDb()
    .collection(COL.holds)
    .where("uid", "==", uid)
    .get();
  const at = nowMs();
  return docsTo<HoldDoc>(snap.docs)
    .filter((h) => isLive(h, at))
    .sort((a, b) => a.createdAt - b.createdAt);
}

export type BoxState = {
  holds: HoldDoc[];
  itemLimit: number;
  remaining: number;
  /** Earliest expiring hold, so the UI can show a single countdown. */
  expiresAt: number | null;
};

export async function getBox(
  uid: string,
  itemLimit: number,
): Promise<BoxState> {
  const holds = await listHolds(uid);
  return {
    holds,
    itemLimit,
    remaining: Math.max(0, itemLimit - holds.length),
    expiresAt: holds.length ? Math.min(...holds.map((h) => h.expiresAt)) : null,
  };
}

/**
 * Adds one garment of a style/size to the member's box, assigning a specific
 * available unit. Retries across candidate units if another member wins a race.
 */
export async function addToBox(input: {
  uid: string;
  productId: string;
  size: string;
  itemLimit: number;
}): Promise<HoldDoc> {
  const db = requireDb();
  const product = await getProduct(input.productId);
  if (!product || !product.active) {
    throw new DomainError(
      "product_unavailable",
      "That piece is no longer available.",
      404,
    );
  }

  const candidates = await db
    .collection(COL.units)
    .where("productId", "==", input.productId)
    .get();

  // Garments below the rentable condition grades are withheld from members.
  const available = docsTo<UnitDoc>(candidates.docs).filter(
    (u) =>
      u.status === "available" &&
      u.size === input.size &&
      isRentableCondition(u.condition),
  );

  if (!available.length) {
    throw new DomainError(
      "size_unavailable",
      `Size ${input.size} is out on loan right now.`,
      409,
    );
  }

  let lastRaceError: DomainError | null = null;

  for (const candidate of available) {
    try {
      return await reserveUnit({ ...input, unitId: candidate.id, product });
    } catch (err) {
      if (err instanceof DomainError && err.code === "unit_taken") {
        lastRaceError = err;
        continue;
      }
      throw err;
    }
  }

  throw (
    lastRaceError ??
    new DomainError(
      "size_unavailable",
      `Size ${input.size} is out on loan right now.`,
      409,
    )
  );
}

async function reserveUnit(input: {
  uid: string;
  unitId: string;
  itemLimit: number;
  product: { id: string; title: string; images: string[] };
}): Promise<HoldDoc> {
  const db = requireDb();
  const unitRef = db.collection(COL.units).doc(input.unitId);
  const holdRef = db.collection(COL.holds).doc();
  const holdsQuery = db.collection(COL.holds).where("uid", "==", input.uid);

  return db.runTransaction(async (tx) => {
    const [unitSnap, holdsSnap] = await Promise.all([
      tx.get(unitRef),
      tx.get(holdsQuery),
    ]);

    const at = nowMs();
    const unit = docTo<UnitDoc>(unitSnap);
    if (!unit) {
      throw new DomainError("unit_taken", "That piece was just taken.", 409);
    }
    if (unit.status !== "available") {
      throw new DomainError("unit_taken", "That piece was just taken.", 409);
    }

    const liveHolds = docsTo<HoldDoc>(holdsSnap.docs).filter((h) =>
      isLive(h, at),
    );

    if (liveHolds.length >= input.itemLimit) {
      throw new DomainError(
        "limit_reached",
        `Your plan covers ${input.itemLimit} items per month. Remove something to add this.`,
        409,
      );
    }
    if (liveHolds.some((h) => h.productId === input.product.id)) {
      throw new DomainError(
        "already_in_box",
        "That piece is already in your box.",
        409,
      );
    }

    const expiresAt = at + RULES.holdTtlMinutes * 60_000;
    const hold: HoldDoc = {
      id: holdRef.id,
      uid: input.uid,
      unitId: unit.id,
      productId: unit.productId,
      productTitle: unit.productTitle,
      size: unit.size,
      condition: unit.condition,
      image: input.product.images[0],
      createdAt: at,
      expiresAt,
    };

    tx.set(holdRef, clean(hold));
    tx.set(
      unitRef,
      {
        status: "reserved",
        holderUid: input.uid,
        holdId: holdRef.id,
        holdExpiresAt: expiresAt,
        updatedAt: at,
      },
      { merge: true },
    );

    return hold;
  });
}

export async function removeFromBox(
  uid: string,
  holdId: string,
): Promise<void> {
  const db = requireDb();
  const holdRef = db.collection(COL.holds).doc(holdId);

  await db.runTransaction(async (tx) => {
    const holdSnap = await tx.get(holdRef);
    const hold = docTo<HoldDoc>(holdSnap);
    if (!hold) return;
    if (hold.uid !== uid) {
      throw new DomainError("forbidden", "That item isn't in your box.", 403);
    }

    const unitRef = db.collection(COL.units).doc(hold.unitId);
    const unitSnap = await tx.get(unitRef);
    const unit = docTo<UnitDoc>(unitSnap);

    tx.delete(holdRef);
    if (unit && unit.holdId === hold.id) {
      tx.set(
        unitRef,
        {
          status: "available",
          holderUid: null,
          holdId: null,
          holdExpiresAt: null,
          updatedAt: nowMs(),
        },
        { merge: true },
      );
    }
  });
}

export async function clearBox(uid: string): Promise<void> {
  const holds = await requireDb()
    .collection(COL.holds)
    .where("uid", "==", uid)
    .get();
  for (const doc of holds.docs) {
    await removeFromBox(uid, doc.id);
  }
}

/** Sweeps holds past their TTL and returns the units to the catalogue. */
export async function releaseExpiredHolds(at = nowMs()): Promise<number> {
  const db = requireDb();
  const expired = await db
    .collection(COL.holds)
    .where("expiresAt", "<", at)
    .get();

  let released = 0;
  for (const doc of expired.docs) {
    const hold = docTo<HoldDoc>(doc);
    if (!hold) continue;
    try {
      await removeFromBox(hold.uid, hold.id);
      released += 1;
    } catch {
      // Skip and let the next sweep retry.
    }
  }
  return released;
}
