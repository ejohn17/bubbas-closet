import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { GuestAddPrompt } from "@/components/portal/GuestAddPrompt";
import { ProductGallery } from "@/components/portal/ProductGallery";
import { BRAND } from "@/lib/config";
import { catalogSizes } from "@/lib/catalog";
import { isFirebaseConfigured } from "@/lib/firebase-admin";
import { getProduct } from "@/lib/db/products";
import { availabilityByProduct } from "@/lib/db/units";
import { bestCondition, conditionLabel } from "@/lib/rules";
import { getSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `Piece — ${BRAND.name}`,
};

export default async function ClosetItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getSessionUser();
  if (user) redirect(`/portal/item/${id}`);

  if (!isFirebaseConfigured()) notFound();

  const product = await getProduct(id);
  if (!product || !product.active) notFound();

  const availability = await availabilityByProduct();
  const sizes = catalogSizes(availability[product.id]);
  const condition =
    sizes.length > 0
      ? sizes.map((s) => s.condition).reduce((a, b) => bestCondition(a, b))
      : null;

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 pb-24 pt-6">
        <Link href="/closet" className="text-sm text-stone transition hover:text-ink">
          ← The closet
        </Link>

        <div className="mt-6 grid gap-10 lg:grid-cols-2 lg:items-start">
          <ProductGallery images={product.images} alt={product.title} />

          <div>
            <h1 className="text-3xl font-semibold tracking-tight">
              {product.title}
            </h1>
            {product.brand ? (
              <p className="mt-1 text-stone">{product.brand}</p>
            ) : null}
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
                No description yet — the photos are the best guide for this
                piece.
              </p>
            )}

            <div className="mt-8">
              <GuestAddPrompt productId={product.id} sizes={sizes} size="md" />
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
