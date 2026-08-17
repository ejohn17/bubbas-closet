import { ok, readJson, requireApiAdmin, toErrorResponse } from "@/lib/api";
import { DomainError } from "@/lib/db/base";
import {
  cancelPick,
  getPick,
  markReturned,
  markShipped,
  recordFee,
  updatePickNotes,
} from "@/lib/db/picks";
import { getUser } from "@/lib/db/users";
import { chargeFee } from "@/lib/billing";
import { sendShippedNotice } from "@/lib/email";
import type { UnitCondition } from "@/lib/types";

type Action = "ship" | "return" | "cancel" | "notes" | "fee";

type Body = {
  action: Action;
  carrier?: string;
  trackingNumber?: string;
  unitIds?: string[];
  condition?: UnitCondition;
  notes?: string;
  amountCents?: number;
  description?: string;
};

/** Fulfilment actions on a rental order. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireApiAdmin();
    const { id } = await params;
    const body = await readJson<Body>(request);

    switch (body.action) {
      case "ship": {
        await markShipped(id, {
          carrier: body.carrier,
          trackingNumber: body.trackingNumber,
        });
        const pick = await getPick(id);
        if (pick) await sendShippedNotice(pick);
        return ok({ pick });
      }

      case "return": {
        const pick = await markReturned(id, {
          unitIds: body.unitIds,
          condition: body.condition,
        });
        return ok({ pick });
      }

      case "cancel": {
        await cancelPick(id);
        return ok({ pick: await getPick(id) });
      }

      case "notes": {
        await updatePickNotes(id, body.notes ?? "");
        return ok({ pick: await getPick(id) });
      }

      case "fee": {
        const pick = await getPick(id);
        if (!pick) {
          throw new DomainError("pick_not_found", "Order not found.", 404);
        }

        const member = await getUser(pick.uid);
        if (!member?.stripeCustomerId) {
          throw new DomainError(
            "no_customer",
            "This member has no Stripe customer record.",
          );
        }

        const amountCents = Math.round(Number(body.amountCents));
        const description = body.description?.trim() || "Late return fee";

        await chargeFee({
          stripeCustomerId: member.stripeCustomerId,
          amountCents,
          description,
          metadata: { pickId: id, uid: pick.uid },
        });
        await recordFee(id, amountCents);

        return ok({ pick: await getPick(id) });
      }

      default:
        throw new DomainError("unknown_action", "Unsupported action.");
    }
  } catch (err) {
    return toErrorResponse(err);
  }
}
