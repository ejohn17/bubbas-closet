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
import { outboundShippingIsFree } from "@/lib/rules";
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
  shippingCents?: number;
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
        const pick = await getPick(id);
        if (!pick) {
          throw new DomainError("pick_not_found", "Order not found.", 404);
        }
        if (pick.status !== "pending") {
          throw new DomainError(
            "already_shipped",
            "This order has already shipped.",
          );
        }

        const shippingFree = outboundShippingIsFree(pick.tierId);
        const shippingCents = shippingFree
          ? 0
          : Math.round(Number(body.shippingCents));

        if (!shippingFree) {
          if (!Number.isFinite(shippingCents) || shippingCents < 50) {
            throw new DomainError(
              "invalid_amount",
              "Enter the outbound shipping cost (at least $0.50).",
            );
          }

          const member = await getUser(pick.uid);
          if (!member?.stripeCustomerId) {
            throw new DomainError(
              "no_customer",
              "This member has no Stripe customer record.",
            );
          }

          await chargeFee({
            stripeCustomerId: member.stripeCustomerId,
            amountCents: shippingCents,
            description: "Outbound shipping",
            metadata: { pickId: id, uid: pick.uid, kind: "shipping" },
            idempotencyKey: `pick-shipping-v2-${id}`,
          });
        }

        await markShipped(id, {
          carrier: body.carrier,
          trackingNumber: body.trackingNumber,
          shippingCents,
        });
        const shipped = await getPick(id);
        const email = shipped
          ? await sendShippedNotice(shipped)
          : { sent: false as const, reason: "Order not found after shipping." };
        return ok({
          pick: shipped,
          emailed: email.sent,
          ...(email.sent ? {} : { emailError: email.reason }),
        });
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
