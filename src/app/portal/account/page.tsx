import { requireUser } from "@/lib/session";
import { getEntitlement } from "@/lib/db/subscriptions";
import { getTier, priceIdForTier } from "@/lib/tiers";
import { TIERS } from "@/lib/config";
import { formatDate } from "@/lib/format";
import { StatusPill } from "@/components/StatusPill";
import { ProfileForm } from "@/components/portal/ProfileForm";
import { ManageBillingButton } from "@/components/portal/ManageBillingButton";
import { TierPicker, type TierOption } from "@/components/TierPicker";

export const metadata = { title: "Account" };

export default async function AccountPage() {
  const user = await requireUser("/portal/account");
  const { subscription, itemLimit } = await getEntitlement(user.uid);
  const tier = getTier(subscription?.tierId ?? "");
  const pendingTier = getTier(subscription?.pendingTierId ?? "");

  const tiers: TierOption[] = TIERS.map((t) => ({
    ...t,
    available: Boolean(priceIdForTier(t.id)),
  }));

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-3xl font-semibold tracking-tight">Account</h1>
      <p className="mt-2 text-stone">{user.email}</p>

      <section className="card mt-8 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">
              {tier?.name ?? "Membership"}
            </h2>
            <p className="mt-1 text-sm text-stone">
              {itemLimit} items per month
              {subscription
                ? ` · renews ${formatDate(subscription.currentPeriodEnd)}`
                : ""}
            </p>
          </div>
          {subscription ? <StatusPill status={subscription.status} /> : null}
        </div>

        {subscription?.cancelAtPeriodEnd ? (
          <p className="mt-4 text-sm text-stone">
            Your membership ends {formatDate(subscription.currentPeriodEnd)}. You
            can restart it any time from the billing portal.
          </p>
        ) : null}

        {pendingTier ? (
          <p className="mt-4 text-sm text-stone">
            Switching to <strong>{pendingTier.name}</strong> at the start of your
            next cycle.
          </p>
        ) : null}

        <div className="mt-6">
          <ManageBillingButton />
        </div>
      </section>

      <section className="mt-12">
        <h2 className="text-lg font-semibold">Change your plan</h2>
        <p className="mt-1 mb-6 text-sm text-stone">
          Upgrades unlock more items right away with a prorated charge.
          Downgrades start at your next billing date.
        </p>
        <TierPicker
          tiers={tiers}
          signedIn
          mode="change"
          currentTierId={subscription?.tierId ?? null}
        />
      </section>

      <section className="mt-14 border-t border-line pt-10">
        <ProfileForm
          sizeProfile={user.profile?.sizeProfile}
          shippingAddress={user.profile?.shippingAddress ?? null}
        />
      </section>
    </div>
  );
}
