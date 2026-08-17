import { ok, readJson, requireApiAdmin, toErrorResponse } from "@/lib/api";
import { createProduct, listProducts, type ProductInput } from "@/lib/db/products";

export async function GET(request: Request) {
  try {
    await requireApiAdmin();
    const search = new URL(request.url).searchParams.get("search") ?? undefined;
    return ok({ products: await listProducts({ search }) });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    await requireApiAdmin();
    const body = await readJson<ProductInput>(request);
    const product = await createProduct({
      title: body.title ?? "",
      description: body.description,
      brand: body.brand,
      category: body.category,
      tags: body.tags,
      images: body.images,
      sizes: body.sizes,
      retailValueCents: body.retailValueCents,
      active: body.active,
    });
    return ok({ product });
  } catch (err) {
    return toErrorResponse(err);
  }
}
