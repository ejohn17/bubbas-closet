import Link from "next/link";
import { requireUser } from "@/lib/session";
import { getEntitlement } from "@/lib/db/subscriptions";
import { listProducts } from "@/lib/db/products";
import { availabilityByProduct } from "@/lib/db/units";
import { listFavoriteProductIds } from "@/lib/db/favorites";
import { listHolds } from "@/lib/db/holds";
import { findPickForCycle } from "@/lib/db/picks";
import { Catalog, type CatalogItem } from "@/components/portal/Catalog";

export const metadata = { title: "The closet" };

export default async function PortalHome({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string }>;
}) {
  const { welcome } = await searchParams;
  const user = await requireUser("/portal");
  const entitlement = await getEntitlement(user.uid);

  const [products, availability, favoriteIds, holds] = await Promise.all([
    listProducts({ activeOnly: true }),
    availabilityByProduct(),
    listFavoriteProductIds(user.uid),
    listHolds(user.uid),
  ]);

  const cyclePick = entitlement.cycleKey
    ? await findPickForCycle(user.uid, entitlement.cycleKey)
    : null;

  const favorites = new Set(favoriteIds);
  const boxProductIds = new Set(holds.map((h) => h.productId));

  const items: CatalogItem[] = products.map((product) => {
    const sizes = availability[product.id]?.sizes ?? {};
    return {
      id: product.id,
      title: product.title,
      brand: product.brand,
      category: product.category,
      image: product.images[0],
      sizes: Object.entries(sizes)
        .map(([size, count]) => ({ size, count }))
        .sort((a, b) =>
          a.size.localeCompare(b.size, undefined, { numeric: true }),
        ),
      favorited: favorites.has(product.id),
      inBox: boxProductIds.has(product.id),
    };
  });

  return (
    <div>
      {welcome ? (
        <p className="card mb-8 px-5 py-4 text-sm text-stone">
          <span className="font-medium text-ink">You&apos;re in.</span> Your
          membership is active — pick up to {entitlement.itemLimit} pieces and
          confirm your box when you&apos;re happy with it.
        </p>
      ) : null}

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">The closet</h1>
          <p className="mt-2 text-stone">
            Everything here is available right now. Adding a piece holds it for
            you while you finish your box.
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
            itemLimit={entitlement.itemLimit}
            boxCount={holds.length}
            defaultSize={user.profile?.sizeProfile?.tops}
          />
        </div>
      )}
    </div>
  );
}
