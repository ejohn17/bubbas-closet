import { ok, readJson, requireApiAdmin, toErrorResponse } from "@/lib/api";
import { DomainError } from "@/lib/db/base";
import {
  getProduct,
  updateProduct,
  type ProductInput,
} from "@/lib/db/products";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireApiAdmin();
    const { id } = await params;

    const existing = await getProduct(id);
    if (!existing) {
      throw new DomainError("product_not_found", "Product not found.", 404);
    }

    const body = await readJson<ProductInput>(request);
    await updateProduct(id, body);

    return ok({ product: await getProduct(id) });
  } catch (err) {
    return toErrorResponse(err);
  }
}
