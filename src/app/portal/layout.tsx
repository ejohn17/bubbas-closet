import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BRAND, recommendTierFor } from "@/lib/config";
import { requireUser } from "@/lib/session";
import { getPortalAccess } from "@/lib/portal";
import { getBox } from "@/lib/db/holds";
import { getTier } from "@/lib/tiers";
import { PortalNav } from "@/components/portal/PortalNav";
import { HoldBanner } from "@/components/portal/HoldBanner";
import { SignOutButton } from "@/components/SignOutButton";

// Member-specific data on every request; never prerendered.
export const dynamic = "force-dynamic";

/**
 * The gate: every /portal page requires a signed-in user. Members get the full
 * portal; signed-in visitors without a membership get the same closet in
 * preview mode so they can build a box before choosing a plan. Only a
 * membership with a billing problem is sent away, to /portal-paused.
 */
export default async function PortalLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requireUser("/portal");
  const access = await getPortalAccess(user);

  if (access.mode === "paused") redirect("/portal-paused");

  const box = await getBox(user.uid, access.itemLimit);
  const tier = getTier(access.entitlement.subscription?.tierId ?? "");
  const previewing = access.mode === "preview";
  const pieces = box.holds.length === 1 ? "piece" : "pieces";
  const recommended = previewing ? recommendTierFor(box.holds.length) : null;

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
              {previewing ? (
                <>
                  <span className="text-stone">
                    {box.holds.length} {pieces} picked
                    {recommended ? ` · ${recommended.name} fits` : ""}
                  </span>
                  <Link href="/subscribe" className="btn-primary btn-sm">
                    Choose a plan
                  </Link>
                </>
              ) : (
                <span className="text-stone">
                  {tier ? `${tier.name} · ` : ""}
                  {box.holds.length} of {access.itemLimit} picked
                </span>
              )}
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
          <HoldBanner
            expiresAt={box.expiresAt}
            itemCount={box.holds.length}
            mode={access.mode}
          />
        ) : null}
      </div>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">{children}</main>
    </div>
  );
}
