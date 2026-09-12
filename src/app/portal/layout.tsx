import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BRAND } from "@/lib/config";
import { requireUser } from "@/lib/session";
import { getEntitlement } from "@/lib/db/subscriptions";
import { getBox } from "@/lib/db/holds";
import { getTier } from "@/lib/tiers";
import { PortalNav } from "@/components/portal/PortalNav";
import { HoldBanner } from "@/components/portal/HoldBanner";
import { SignOutButton } from "@/components/SignOutButton";

// Member-specific data on every request; never prerendered.
export const dynamic = "force-dynamic";

/**
 * The gate: every /portal page requires a signed-in member on an active
 * membership. Checked server-side here so no portal page can render without it.
 */
export default async function PortalLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requireUser("/portal");
  const entitlement = await getEntitlement(user.uid);

  if (!entitlement.entitled) {
    redirect(entitlement.subscription ? "/portal-paused" : "/subscribe");
  }

  const box = await getBox(user.uid, entitlement.itemLimit);
  const tier = getTier(entitlement.subscription?.tierId ?? "");

  return (
    <div className="flex flex-1 flex-col">
      <div className="sticky top-0 z-30">
        <header className="border-b border-line bg-card/95 backdrop-blur">
          <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-5">
            <div className="flex items-center gap-6">
              <Link href="/portal" className="text-lg font-semibold tracking-tight">
                {BRAND.name}
              </Link>
              <PortalNav boxCount={box.holds.length} />
            </div>

            <div className="flex items-center gap-4 text-sm">
              <span className="text-stone">
                {tier ? `${tier.name} · ` : ""}
                {box.holds.length} of {entitlement.itemLimit} picked
              </span>
              {user.isAdmin ? (
                <Link href="/admin" className="text-stone transition hover:text-ink">
                  Admin
                </Link>
              ) : null}
              <SignOutButton />
            </div>
          </div>
        </header>
        {box.expiresAt ? (
          <HoldBanner expiresAt={box.expiresAt} itemCount={box.holds.length} />
        ) : null}
      </div>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">{children}</main>
    </div>
  );
}
