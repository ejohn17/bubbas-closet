import { requireDb } from "@/lib/firebase-admin";
import type { ProductDoc } from "@/lib/types";
import { clean, COL, docTo, docsTo, DomainError, nowMs } from "@/lib/db/base";

export type ProductInput = {
  title: string;
  description?: string;
  brand?: string;
  category?: string;
  tags?: string[];
  images?: string[];
  sizes?: string[];
  retailValueCents?: number;
  active?: boolean;
};

export async function getProduct(id: string): Promise<ProductDoc | null> {
  const snap = await requireDb().collection(COL.products).doc(id).get();
  return docTo<ProductDoc>(snap);
}

export async function getProducts(ids: string[]): Promise<ProductDoc[]> {
  if (!ids.length) return [];
  const db = requireDb();
  const refs = ids.map((id) => db.collection(COL.products).doc(id));
  const snaps = await db.getAll(...refs);
  return snaps
    .map((s) => docTo<ProductDoc>(s))
    .filter((p): p is ProductDoc => p !== null);
}

export async function listProducts(options?: {
  activeOnly?: boolean;
  search?: string;
  category?: string;
}): Promise<ProductDoc[]> {
  const db = requireDb();
  const query = options?.activeOnly
    ? db.collection(COL.products).where("active", "==", true)
    : db.collection(COL.products);

  const snap = await query.get();
  let products = docsTo<ProductDoc>(snap.docs);

  const search = options?.search?.trim().toLowerCase();
  if (search) {
    products = products.filter((p) =>
      [p.title, p.brand, p.category, ...(p.tags ?? [])]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(search),
    );
  }
  if (options?.category) {
    products = products.filter((p) => p.category === options.category);
  }

  return products.sort((a, b) => a.title.localeCompare(b.title));
}

export async function createProduct(input: ProductInput): Promise<ProductDoc> {
  const title = input.title?.trim();
  if (!title) throw new DomainError("invalid_title", "A title is required.");

  const db = requireDb();
  const ref = db.collection(COL.products).doc();
  const ts = nowMs();
  const doc: ProductDoc = {
    id: ref.id,
    title,
    description: input.description?.trim() ?? "",
    brand: input.brand?.trim() || undefined,
    category: input.category?.trim() || undefined,
    tags: normalizeList(input.tags),
    images: normalizeList(input.images),
    sizes: normalizeList(input.sizes),
    retailValueCents: input.retailValueCents,
    active: input.active ?? true,
    createdAt: ts,
    updatedAt: ts,
  };

  await ref.set(clean(doc));
  return doc;
}

export type ProductUpdate = Partial<ProductInput>;

export async function updateProduct(
  id: string,
  input: ProductUpdate,
): Promise<void> {
  const patch = clean({
    title: input.title?.trim(),
    description: input.description?.trim(),
    brand: input.brand?.trim(),
    category: input.category?.trim(),
    tags: input.tags ? normalizeList(input.tags) : undefined,
    images: input.images ? normalizeList(input.images) : undefined,
    sizes: input.sizes ? normalizeList(input.sizes) : undefined,
    retailValueCents: input.retailValueCents,
    active: input.active,
    updatedAt: nowMs(),
  });

  await requireDb()
    .collection(COL.products)
    .doc(id)
    .set(patch, { merge: true });
}

function normalizeList(value?: string[]): string[] {
  if (!value) return [];
  return Array.from(
    new Set(value.map((v) => v.trim()).filter((v) => v.length > 0)),
  );
}

/** Accepts comma- or newline-separated admin form input. */
export function parseList(value: string | null | undefined): string[] {
  if (!value) return [];
  return normalizeList(value.split(/[\n,]/));
}
