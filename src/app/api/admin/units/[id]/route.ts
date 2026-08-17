import { ok, readJson, requireApiAdmin, toErrorResponse } from "@/lib/api";
import { getUnit, updateUnit } from "@/lib/db/units";
import type { UnitCondition, UnitStatus } from "@/lib/types";

/** Condition updates, retiring, and moving units through cleaning. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireApiAdmin();
    const { id } = await params;
    const body = await readJson<{
      status?: UnitStatus;
      condition?: UnitCondition;
      notes?: string;
      size?: string;
      sku?: string;
    }>(request);

    await updateUnit(id, body);
    return ok({ unit: await getUnit(id) });
  } catch (err) {
    return toErrorResponse(err);
  }
}
