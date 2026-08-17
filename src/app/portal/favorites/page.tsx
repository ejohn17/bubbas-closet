import Link from "next/link";
import { requireUser } from "@/lib/session";
import { getEntitlement } from "@/lib/db/subscriptions";
import { getProducts } from "@/lib/db/products";
import { availabilityByProduct } from "@/lib/db/units";
import { listFavoriteProductIds } from "@/lib/db/favorites";
import { listHolds } from "@/lib/db/holds";
import { Catalog, type CatalogItem } from "@/components/portal/Catalog";

export const metadata = { title: "Favorites" };

export default async function FavoritesPage() {
  const user = await requireUser("/portal/favorites");
  const entitlement = await getEntitlement(user.uid);

  const favoriteIds = await listFavoriteProductIds(user.uid);
  const [products, availability, holds] = await Promise.all([
    getProducts(favoriteIds),
    availabilityByProduct(),
    listHolds(user.uid),
  ]);

  const boxProductIds = new Set(holds.map((h) => h.productId));
  const order = new Map(favoriteIds.map((id, index) => [id, index]));

  const items: CatalogItem[] = products
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
    .map((product) => ({
      id: product.id,
      title: product.title,
      brand: product.brand,
      category: product.category,
      image: product.images[0],
      sizes: Object.entries(availability[product.id]?.sizes ?? {})
        .map(([size, count]) => ({ size, count }))
        .sort((a, b) =>
          a.size.localeCompare(b.size, undefined, { numeric: true }),
        ),
      favorited: true,
      inBox: boxProductIds.has(product.id),
    }));

  return (
    <div>
      <h1 className="text-3xl font-semibold tracking-tight">Favorites</h1>
      <p className="mt-2 text-stone">
        Pieces you&apos;ve saved for later. Sizes update as they come back in.
      </p>

      {items.length === 0 ? (
        <div className="card mt-10 p-8 text-center">
          <p className="text-stone">You haven&apos;t saved anything yet.</p>
          <Link href="/portal" className="btn-primary mt-6">
            Browse the closet
          </Link>
        </div>
      ) : (
        <div className="mt-8">
          <Catalog
            items={items}
            itemLimit={entitlement.itemLimit}
            boxCount={holds.length}
          />
        </div>
      )}
    </div>
  );
}
