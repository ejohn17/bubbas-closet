import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { getEntitlement } from "@/lib/db/subscriptions";
import { getProduct } from "@/lib/db/products";
import { availabilityByProduct } from "@/lib/db/units";
import { listFavoriteProductIds } from "@/lib/db/favorites";
import { listHolds } from "@/lib/db/holds";
import { catalogSizes } from "@/lib/catalog";
import { bestCondition, conditionLabel } from "@/lib/rules";
import { ProductGallery } from "@/components/portal/ProductGallery";
import { AddToBoxControls } from "@/components/portal/AddToBoxControls";
import { FavoriteButton } from "@/components/portal/FavoriteButton";

export const metadata = { title: "Piece" };

export default async function PortalItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser(`/portal/item/${id}`);
  const product = await getProduct(id);
  if (!product || !product.active) notFound();

  const [entitlement, availability, favoriteIds, holds] = await Promise.all([
    getEntitlement(user.uid),
    availabilityByProduct(),
    listFavoriteProductIds(user.uid),
    listHolds(user.uid),
  ]);

  const sizes = catalogSizes(availability[product.id]);
  const inBox = holds.some((h) => h.productId === product.id);
  const full = holds.length >= entitlement.itemLimit;
  const preferredSize =
    user.profile?.sizeProfile?.dresses ||
    user.profile?.sizeProfile?.tops ||
    user.profile?.sizeProfile?.bottoms;
  const condition =
    sizes.length > 0
      ? sizes.map((s) => s.condition).reduce((a, b) => bestCondition(a, b))
      : null;

  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/portal" className="text-sm text-stone transition hover:text-ink">
        ← The closet
      </Link>

      <div className="mt-6 grid gap-10 lg:grid-cols-2 lg:items-start">
        <ProductGallery images={product.images} alt={product.title} />

        <div>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">
                {product.title}
              </h1>
              {product.brand ? (
                <p className="mt-1 text-stone">{product.brand}</p>
              ) : null}
            </div>
            <FavoriteButton
              productId={product.id}
              favorited={favoriteIds.includes(product.id)}
            />
          </div>

          {product.category ? (
            <p className="mt-3 text-xs uppercase tracking-wider text-stone">
              {product.category}
            </p>
          ) : null}
          {condition ? (
            <p className="mt-2 text-xs uppercase tracking-wider text-accent-dark">
              {conditionLabel(condition)}
            </p>
          ) : null}

          {product.description ? (
            <p className="mt-6 whitespace-pre-wrap leading-relaxed text-stone">
              {product.description}
            </p>
          ) : (
            <p className="mt-6 text-sm text-stone">
              No description yet — the photos are the best guide for this piece.
            </p>
          )}

          <div className="mt-8">
            <AddToBoxControls
              productId={product.id}
              sizes={sizes}
              inBox={inBox}
              full={full && !inBox}
              preferredSize={preferredSize}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
