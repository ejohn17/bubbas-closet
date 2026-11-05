import { getDb, requireDb } from "@/lib/firebase-admin";
import { PREVIEW_IMAGES } from "@/lib/preview-images";
import type { CarouselImage, CarouselSettingsDoc } from "@/lib/types";
import { COL, DomainError, nowMs } from "@/lib/db/base";

/**
 * Marketing carousel images, stored as one document at `settings/carousel`.
 * When that document is missing the built-in PREVIEW_IMAGES are shown, so
 * "reset to defaults" simply deletes it.
 */

const DOC_ID = "carousel";
export const MAX_CAROUSEL_IMAGES = 30;

export type CarouselImages = {
  images: CarouselImage[];
  /** True when no custom list is saved and the built-in images are in use. */
  isDefault: boolean;
};

function defaults(): CarouselImages {
  return { images: [...PREVIEW_IMAGES], isDefault: true };
}

/**
 * Never throws: the landing and signup pages fall back to the defaults when
 * Firestore is unconfigured or unreachable rather than failing to render.
 */
export async function getCarouselImages(): Promise<CarouselImages> {
  const db = getDb();
  if (!db) return defaults();

  try {
    const snap = await db.collection(COL.settings).doc(DOC_ID).get();
    const data = snap.data() as CarouselSettingsDoc | undefined;
    if (!data?.images?.length) return defaults();
    return { images: data.images, isDefault: false };
  } catch (err) {
    console.error("[carousel] falling back to default images", err);
    return defaults();
  }
}

export async function saveCarouselImages(
  input: unknown,
): Promise<CarouselImage[]> {
  const images = normalizeCarouselImages(input);
  const doc: CarouselSettingsDoc = { images, updatedAt: nowMs() };
  await requireDb().collection(COL.settings).doc(DOC_ID).set(doc);
  return images;
}

export async function resetCarouselImages(): Promise<void> {
  await requireDb().collection(COL.settings).doc(DOC_ID).delete();
}

/** Validates admin input: trimmed, deduped by src, 1–30 images, alt required. */
export function normalizeCarouselImages(input: unknown): CarouselImage[] {
  if (!Array.isArray(input)) {
    throw new DomainError("invalid_images", "Send a list of images.");
  }

  const seen = new Set<string>();
  const images: CarouselImage[] = [];

  for (const item of input) {
    const raw = (item ?? {}) as Partial<Record<keyof CarouselImage, unknown>>;
    const src = typeof raw.src === "string" ? raw.src.trim() : "";
    const alt = typeof raw.alt === "string" ? raw.alt.trim() : "";

    if (!isAllowedSrc(src)) {
      throw new DomainError(
        "invalid_src",
        "Each image needs an https:// URL or a /path on this site.",
      );
    }
    if (!alt) {
      throw new DomainError(
        "missing_alt",
        "Every image needs a short description for screen readers.",
      );
    }
    if (seen.has(src)) continue;
    seen.add(src);
    images.push({ src, alt });
  }

  if (images.length === 0) {
    throw new DomainError(
      "no_images",
      "Keep at least one image, or reset to the defaults.",
    );
  }
  if (images.length > MAX_CAROUSEL_IMAGES) {
    throw new DomainError(
      "too_many_images",
      `The carousel holds up to ${MAX_CAROUSEL_IMAGES} images.`,
    );
  }

  return images;
}

function isAllowedSrc(src: string): boolean {
  if (src.startsWith("/") && !src.startsWith("//")) return true;
  try {
    return new URL(src).protocol === "https:";
  } catch {
    return false;
  }
}
