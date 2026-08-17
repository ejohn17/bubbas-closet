import { ok, readJson, requireApiUser, toErrorResponse } from "@/lib/api";
import { DomainError } from "@/lib/db/base";
import { listFavoriteProductIds, toggleFavorite } from "@/lib/db/favorites";

export async function GET() {
  try {
    const user = await requireApiUser();
    return ok({ productIds: await listFavoriteProductIds(user.uid) });
  } catch (err) {
    return toErrorResponse(err);
  }
}

/** Toggles a favorite; returns the resulting state. */
export async function POST(request: Request) {
  try {
    const user = await requireApiUser();
    const { productId } = await readJson<{ productId: string }>(request);
    if (!productId) throw new DomainError("missing_product", "Missing product.");

    const favorited = await toggleFavorite(user.uid, productId);
    return ok({ favorited });
  } catch (err) {
    return toErrorResponse(err);
  }
}
