import { ok, readJson, requireApiAdmin, toErrorResponse } from "@/lib/api";
import {
  getCarouselImages,
  resetCarouselImages,
  saveCarouselImages,
} from "@/lib/db/carousel";
import type { CarouselImage } from "@/lib/types";

/** Replaces the marketing carousel's image list (order is preserved). */
export async function PUT(request: Request) {
  try {
    await requireApiAdmin();
    const body = await readJson<{ images: CarouselImage[] }>(request);
    const images = await saveCarouselImages(body.images);
    return ok({ images, isDefault: false });
  } catch (err) {
    return toErrorResponse(err);
  }
}

/** Clears the custom list so the built-in default images show again. */
export async function DELETE() {
  try {
    await requireApiAdmin();
    await resetCarouselImages();
    return ok({ ...(await getCarouselImages()) });
  } catch (err) {
    return toErrorResponse(err);
  }
}
