import { deleteApp, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import type { ProductDoc, UnitDoc } from "../../src/lib/types";
import { PROJECT_ID, requireE2eEnv, SEED } from "./env";

/** Wipes the emulators and stocks the closet with one style to rent. */
export default async function globalSetup() {
  const { firestoreHost, authHost } = requireE2eEnv();

  await clear(
    `http://${firestoreHost}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
  );
  await clear(`http://${authHost}/emulator/v1/projects/${PROJECT_ID}/accounts`);

  const app = initializeApp({ projectId: PROJECT_ID }, "e2e-seed");
  try {
    const db = getFirestore(app);
    const now = Date.now();

    const product: ProductDoc = {
      id: SEED.productId,
      title: SEED.title,
      description: "Seeded by the end-to-end suite.",
      category: "Rompers",
      tags: [],
      images: [],
      sizes: [SEED.size],
      active: true,
      createdAt: now,
      updatedAt: now,
    };
    await db.collection("products").doc(product.id).set(product);

    for (let i = 1; i <= SEED.units; i += 1) {
      const unit: UnitDoc = {
        id: `${SEED.productId}-${i}`,
        productId: product.id,
        productTitle: product.title,
        size: SEED.size,
        sku: `E2E-${SEED.size}-${i}`,
        condition: "excellent",
        status: "available",
        holderUid: null,
        holdId: null,
        holdExpiresAt: null,
        pickId: null,
        createdAt: now,
        updatedAt: now,
      };
      await db.collection("units").doc(unit.id).set(unit);
    }
  } finally {
    await deleteApp(app);
  }
}

async function clear(url: string) {
  const res = await fetch(url, { method: "DELETE" });
  if (!res.ok) {
    throw new Error(`Could not reset emulator (${res.status}) at ${url}`);
  }
}
