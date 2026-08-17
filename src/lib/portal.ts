import { requireApiUser } from "@/lib/api";
import { DomainError } from "@/lib/db/base";
import { getEntitlement, type Entitlement } from "@/lib/db/subscriptions";
import type { SessionUser } from "@/lib/session";

/**
 * Portal gate for route handlers: signed in *and* on an active membership.
 * Pages use the /portal layout for the same check.
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
      entitlement.subscription
        ? "Your membership isn't active. Update your billing to keep renting."
        : "Choose a membership to unlock the closet.",
      403,
    );
  }

  return { user, entitlement };
}
