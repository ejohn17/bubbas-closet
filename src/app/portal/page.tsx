import Link from "next/link";
import { requireUser } from "@/lib/session";
import { getPortalAccess } from "@/lib/portal";
import { listProducts } from "@/lib/db/products";
import { availabilityByProduct } from "@/lib/db/units";
import { listFavoriteProductIds } from "@/lib/db/favorites";
import { listHolds } from "@/lib/db/holds";
import { findPickForCycle } from "@/lib/db/picks";
import { Catalog } from "@/components/portal/Catalog";
import { toCatalogItem, type CatalogItem } from "@/lib/catalog";
import { RULES } from "@/lib/rules";

export const metadata = { title: "The closet" };

export default async function PortalHome({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string }>;
}) {
  const { welcome } = await searchParams;
  const user = await requireUser("/portal");
  const access = await getPortalAccess(user);
  const { entitlement, mode, itemLimit } = access;

  const [products, availability, favoriteIds, holds] = await Promise.all([
    listProducts({ activeOnly: true }),
    availabilityByProduct(),
    listFavoriteProductIds(user.uid),
    listHolds(user.uid),
  ]);

  // Only a live membership has a current cycle to have picked in.
  const cyclePick =
    mode === "member" && entitlement.cycleKey
      ? await findPickForCycle(user.uid, entitlement.cycleKey)
      : null;

  const favorites = new Set(favoriteIds);
  const boxProductIds = new Set(holds.map((h) => h.productId));

  const items: CatalogItem[] = products.map((product) =>
    toCatalogItem(product, availability[product.id], {
      favorited: favorites.has(product.id),
      inBox: boxProductIds.has(product.id),
    }),
  );

  return (
    <div>
      {welcome && mode === "member" ? (
        <p className="card mb-8 px-5 py-4 text-sm text-stone">
          <span className="font-medium text-ink">You&apos;re in.</span> Your
          membership is active — pick up to {itemLimit} pieces and confirm your
          box when you&apos;re happy with it.
        </p>
      ) : welcome ? (
        <p className="card mb-8 px-5 py-4 text-sm text-stone">
          <span className="font-medium text-ink">Thanks — payment received.</span>{" "}
          Your membership is activating; this page will show your plan in a
          moment. If it doesn&apos;t, refresh.
        </p>
      ) : mode === "preview" ? (
        <div className="card mb-8 flex flex-wrap items-center justify-between gap-4 px-5 py-4 text-sm">
          <p className="max-w-xl text-stone">
            <span className="font-medium text-ink">Shop first, subscribe when
            you&apos;re ready.</span>{" "}
            Add the pieces you love — each is held for {RULES.holdTtlMinutes}{" "}
            minutes — and we&apos;ll suggest the plan that fits your box.
            Nothing is charged until you choose a plan.
          </p>
          <Link href="/subscribe" className="btn-outline btn-sm">
            See the plans
          </Link>
        </div>
      ) : null}

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">The closet</h1>
          <p className="mt-2 text-stone">
            Everything here is available right now. Adding a piece holds it for{" "}
            {RULES.holdTtlMinutes} minutes while you finish your box.
          </p>
        </div>
        {holds.length > 0 ? (
          <Link href="/portal/box" className="btn-primary">
            Review my box ({holds.length})
          </Link>
        ) : null}
      </div>

      {cyclePick ? (
        <p className="card mt-8 px-5 py-4 text-sm text-stone">
          You&apos;ve confirmed this month&apos;s box.{" "}
          <Link href="/portal/orders" className="link text-ink">
            Track your rental
          </Link>{" "}
          — your next pick unlocks when your new cycle starts.
        </p>
      ) : null}

      {products.length === 0 ? (
        <p className="mt-16 text-center text-stone">
          The closet is being stocked. Check back shortly.
        </p>
      ) : (
        <div className="mt-8">
          <Catalog
            items={items}
            itemLimit={itemLimit}
            boxCount={holds.length}
            defaultSize={user.profile?.sizeProfile?.tops}
            mode={mode === "member" ? "member" : "preview"}
          />
        </div>
      )}
    </div>
  );
}
