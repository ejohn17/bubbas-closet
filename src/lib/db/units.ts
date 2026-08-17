import type { Query } from "firebase-admin/firestore";
import { requireDb } from "@/lib/firebase-admin";
import type { UnitCondition, UnitDoc, UnitStatus } from "@/lib/types";
import { clean, COL, docTo, docsTo, DomainError, nowMs } from "@/lib/db/base";
import { getProduct } from "@/lib/db/products";

export async function getUnit(id: string): Promise<UnitDoc | null> {
  const snap = await requireDb().collection(COL.units).doc(id).get();
  return docTo<UnitDoc>(snap);
}

export async function listUnits(options?: {
  productId?: string;
  status?: UnitStatus;
  size?: string;
  search?: string;
}): Promise<UnitDoc[]> {
  const db = requireDb();
  const base: Query = db.collection(COL.units);

  // One server-side equality filter keeps this on an automatic index.
  const filtered = options?.productId
    ? base.where("productId", "==", options.productId)
    : options?.status
      ? base.where("status", "==", options.status)
      : base;

  const snap = await filtered.get();
  let units = docsTo<UnitDoc>(snap.docs);

  if (options?.productId && options.status) {
    units = units.filter((u) => u.status === options.status);
  }
  if (options?.size) {
    units = units.filter((u) => u.size === options.size);
  }
  const search = options?.search?.trim().toLowerCase();
  if (search) {
    units = units.filter((u) =>
      [u.productTitle, u.sku, u.size, u.id]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(search),
    );
  }

  return units.sort(
    (a, b) =>
      a.productTitle.localeCompare(b.productTitle) ||
      a.size.localeCompare(b.size) ||
      a.createdAt - b.createdAt,
  );
}

/** Adds N physical garments of one size for a style. */
export async function createUnits(input: {
  productId: string;
  size: string;
  quantity: number;
  condition?: UnitCondition;
  skuPrefix?: string;
}): Promise<UnitDoc[]> {
  const product = await getProduct(input.productId);
  if (!product) {
    throw new DomainError("product_not_found", "That product no longer exists.", 404);
  }

  const size = input.size?.trim();
  if (!size) throw new DomainError("invalid_size", "A size is required.");

  const quantity = Math.floor(input.quantity);
  if (!Number.isFinite(quantity) || quantity < 1 || quantity > 200) {
    throw new DomainError("invalid_quantity", "Quantity must be between 1 and 200.");
  }

  const db = requireDb();
  const existing = await db
    .collection(COL.units)
    .where("productId", "==", input.productId)
    .get();
  const startIndex = existing.size + 1;
  const prefix =
    input.skuPrefix?.trim() || slugify(product.title).toUpperCase().slice(0, 12);

  const batch = db.batch();
  const ts = nowMs();
  const created: UnitDoc[] = [];

  for (let i = 0; i < quantity; i += 1) {
    const ref = db.collection(COL.units).doc();
    const doc: UnitDoc = {
      id: ref.id,
      productId: input.productId,
      productTitle: product.title,
      size,
      sku: `${prefix}-${size.toUpperCase()}-${startIndex + i}`,
      condition: input.condition ?? "excellent",
      status: "available",
      holderUid: null,
      holdId: null,
      holdExpiresAt: null,
      pickId: null,
      createdAt: ts,
      updatedAt: ts,
    };
    batch.set(ref, clean(doc));
    created.push(doc);
  }

  await batch.commit();

  // Keep the style's offered sizes in step with what actually exists.
  if (!product.sizes.includes(size)) {
    await db
      .collection(COL.products)
      .doc(product.id)
      .set({ sizes: [...product.sizes, size], updatedAt: ts }, { merge: true });
  }

  return created;
}

export async function updateUnit(
  id: string,
  patch: {
    condition?: UnitCondition;
    status?: UnitStatus;
    notes?: string;
    size?: string;
    sku?: string;
  },
): Promise<void> {
  const db = requireDb();

  await db.runTransaction(async (tx) => {
    const ref = db.collection(COL.units).doc(id);
    const snap = await tx.get(ref);
    const unit = docTo<UnitDoc>(snap);
    if (!unit) {
      throw new DomainError("unit_not_found", "That unit no longer exists.", 404);
    }

    // A unit that is reserved or out can't be quietly flipped to available
    // without clearing the member link, so do both together.
    const clearsHolder =
      patch.status !== undefined &&
      patch.status !== "reserved" &&
      patch.status !== "out";

    tx.set(
      ref,
      clean({
        ...patch,
        holderUid: clearsHolder ? null : undefined,
        holdId: clearsHolder ? null : undefined,
        holdExpiresAt: clearsHolder ? null : undefined,
        pickId: clearsHolder ? null : undefined,
        updatedAt: nowMs(),
      }),
      { merge: true },
    );
  });
}

export type ProductAvailability = {
  /** Available unit count per size. */
  sizes: Record<string, number>;
  total: number;
};

/** Available units grouped by product, for catalogue badges and filters. */
export async function availabilityByProduct(): Promise<
  Record<string, ProductAvailability>
> {
  const snap = await requireDb()
    .collection(COL.units)
    .where("status", "==", "available")
    .get();

  const out: Record<string, ProductAvailability> = {};
  for (const doc of snap.docs) {
    const unit = doc.data() as UnitDoc;
    const entry = (out[unit.productId] ??= { sizes: {}, total: 0 });
    entry.sizes[unit.size] = (entry.sizes[unit.size] ?? 0) + 1;
    entry.total += 1;
  }
  return out;
}

export async function countUnitsByStatus(): Promise<Record<UnitStatus, number>> {
  const snap = await requireDb().collection(COL.units).get();
  const counts: Record<UnitStatus, number> = {
    available: 0,
    reserved: 0,
    out: 0,
    cleaning: 0,
    retired: 0,
  };
  for (const doc of snap.docs) {
    const status = (doc.data().status as UnitStatus) ?? "available";
    if (status in counts) counts[status] += 1;
  }
  return counts;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
