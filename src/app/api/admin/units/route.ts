import { ok, readJson, requireApiAdmin, toErrorResponse } from "@/lib/api";
import { DomainError } from "@/lib/db/base";
import { createUnits, listUnits } from "@/lib/db/units";
import type { UnitCondition, UnitStatus } from "@/lib/types";

export async function GET(request: Request) {
  try {
    await requireApiAdmin();
    const params = new URL(request.url).searchParams;
    const units = await listUnits({
      productId: params.get("productId") ?? undefined,
      status: (params.get("status") as UnitStatus | null) ?? undefined,
      search: params.get("search") ?? undefined,
    });
    return ok({ units });
  } catch (err) {
    return toErrorResponse(err);
  }
}

/** Adds physical garments for a style, one size at a time. */
export async function POST(request: Request) {
  try {
    await requireApiAdmin();
    const body = await readJson<{
      productId: string;
      size: string;
      quantity: number;
      condition?: UnitCondition;
      skuPrefix?: string;
    }>(request);

    if (!body.productId || !body.size) {
      throw new DomainError("missing_fields", "Product and size are required.");
    }

    const units = await createUnits({
      productId: body.productId,
      size: body.size,
      quantity: Number(body.quantity ?? 1),
      condition: body.condition,
      skuPrefix: body.skuPrefix,
    });

    return ok({ units, count: units.length });
  } catch (err) {
    return toErrorResponse(err);
  }
}
