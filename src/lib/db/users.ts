import { requireDb } from "@/lib/firebase-admin";
import type { Address, SizeProfile, UserDoc } from "@/lib/types";
import { clean, COL, docTo, nowMs } from "@/lib/db/base";

export async function getUser(uid: string): Promise<UserDoc | null> {
  const snap = await requireDb().collection(COL.users).doc(uid).get();
  return docTo<UserDoc>(snap);
}

/**
 * Called on every session creation so a Firestore profile always exists for an
 * authenticated user. `isAdmin` is intentionally never written here — it is set
 * by hand in the Firestore console.
 */
export async function upsertUserFromAuth(input: {
  uid: string;
  email: string | null;
  name?: string | null;
}): Promise<UserDoc> {
  const db = requireDb();
  const ref = db.collection(COL.users).doc(input.uid);
  const snap = await ref.get();
  const ts = nowMs();

  if (!snap.exists) {
    const doc: UserDoc = {
      uid: input.uid,
      email: input.email,
      name: input.name ?? null,
      isAdmin: false,
      stripeCustomerId: null,
      createdAt: ts,
      updatedAt: ts,
    };
    await ref.set(clean(doc));
    return doc;
  }

  const existing = docTo<UserDoc>(snap) as UserDoc;
  const patch = clean({
    email: input.email ?? existing.email,
    name: input.name ?? existing.name ?? null,
    updatedAt: ts,
  });
  await ref.set(patch, { merge: true });
  return { ...existing, ...patch } as UserDoc;
}

export async function setStripeCustomerId(
  uid: string,
  stripeCustomerId: string,
): Promise<void> {
  await requireDb()
    .collection(COL.users)
    .doc(uid)
    .set({ stripeCustomerId, updatedAt: nowMs() }, { merge: true });
}

export async function findUserByStripeCustomerId(
  stripeCustomerId: string,
): Promise<UserDoc | null> {
  const snap = await requireDb()
    .collection(COL.users)
    .where("stripeCustomerId", "==", stripeCustomerId)
    .limit(1)
    .get();
  if (snap.empty) return null;
  return docTo<UserDoc>(snap.docs[0]);
}

export async function updateSizeProfile(
  uid: string,
  sizeProfile: SizeProfile,
): Promise<void> {
  await requireDb()
    .collection(COL.users)
    .doc(uid)
    .set({ sizeProfile: clean(sizeProfile), updatedAt: nowMs() }, { merge: true });
}

export async function updateShippingAddress(
  uid: string,
  shippingAddress: Address,
): Promise<void> {
  await requireDb()
    .collection(COL.users)
    .doc(uid)
    .set(
      { shippingAddress: clean(shippingAddress), updatedAt: nowMs() },
      { merge: true },
    );
}

export async function countMembers(): Promise<number> {
  const snap = await requireDb().collection(COL.users).count().get();
  return snap.data().count;
}
