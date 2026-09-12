import { requireDb } from "@/lib/firebase-admin";
import type { FavoriteDoc } from "@/lib/types";
import { COL, docsTo, nowMs } from "@/lib/db/base";

/** Doc ids are deterministic so toggling is idempotent. */
function favoriteId(uid: string, productId: string): string {
  return `${uid}__${productId}`;
}

export async function listFavoriteProductIds(uid: string): Promise<string[]> {
  const snap = await requireDb()
    .collection(COL.favorites)
    .where("uid", "==", uid)
    .get();
  return docsTo<FavoriteDoc>(snap.docs)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((f) => f.productId);
}

/** Returns the new state: true when the product is now a favorite. */
export async function toggleFavorite(
  uid: string,
  productId: string,
): Promise<boolean> {
  const ref = requireDb()
    .collection(COL.favorites)
    .doc(favoriteId(uid, productId));
  const snap = await ref.get();

  if (snap.exists) {
    await ref.delete();
    return false;
  }

  await ref.set({
    id: ref.id,
    uid,
    productId,
    createdAt: nowMs(),
  } satisfies FavoriteDoc);
  return true;
}
