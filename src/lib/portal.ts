import { requireApiUser } from "@/lib/api";
import { PREVIEW_ITEM_LIMIT } from "@/lib/config";
import { DomainError } from "@/lib/db/base";
import { getEntitlement, type Entitlement } from "@/lib/db/subscriptions";
import type { SessionUser } from "@/lib/session";
import type { SubscriptionDoc } from "@/lib/types";

/**
 * Who can do what in /portal.
 *
 * - `member`  — active or trialing membership. Full portal; box is capped at
 *               the plan's monthly allotment and can be confirmed.
 * - `preview` — signed in, no active membership (never subscribed, or a
 *               membership that ended). Can browse, favorite, and build a box up
 *               to our largest plan; the box leads to plan selection instead of
 *               confirm. This is the "shop first, subscribe second" flow.
 * - `paused`  — a membership Stripe could not collect on (past_due / unpaid).
 *               Sent to /portal-paused to fix billing rather than start over.
 */
export type PortalMode = "member" | "preview" | "paused";

export type PortalAccess = {
  user: SessionUser;
  entitlement: Entitlement;
  mode: PortalMode;
  /** Pieces the box may hold in this mode; 0 when paused. */
  itemLimit: number;
};

export function isBillingPaused(sub: SubscriptionDoc | null): boolean {
  return sub?.status === "past_due" || sub?.status === "unpaid";
}

export function portalModeFor(entitlement: Entitlement): PortalMode {
  if (entitlement.entitled) return "member";
  if (isBillingPaused(entitlement.subscription)) return "paused";
  return "preview";
}

export async function getPortalAccess(user: SessionUser): Promise<PortalAccess> {
  const entitlement = await getEntitlement(user.uid);
  const mode = portalModeFor(entitlement);
  const itemLimit =
    mode === "member"
      ? entitlement.itemLimit
      : mode === "preview"
        ? PREVIEW_ITEM_LIMIT
        : 0;
  return { user, entitlement, mode, itemLimit };
}

/**
 * Gate for box routes: signed in and either a member or previewing. Pages use
 * the /portal layout for the same check.
 */
export async function requirePortalUser(): Promise<PortalAccess> {
  const user = await requireApiUser();
  const access = await getPortalAccess(user);

  if (access.mode === "paused") {
    throw new DomainError(
      "membership_paused",
      "Your membership isn't active. Update your billing to keep renting.",
      403,
    );
  }

  return access;
}

/**
 * Gate for routes that need an active membership — confirming a box, changing
 * plans. Previewing visitors are pointed at plan selection.
 */
export async function requireEntitledUser(): Promise<{
  user: SessionUser;
  entitlement: Entitlement;
}> {
  const user = await requireApiUser();
  const entitlement = await getEntitlement(user.uid);

  if (!entitlement.entitled) {
    throw new DomainError(
      "not_subscribed",
      isBillingPaused(entitlement.subscription)
        ? "Your membership isn't active. Update your billing to keep renting."
        : "Choose a membership to confirm your box.",
      403,
    );
  }

  return { user, entitlement };
}
