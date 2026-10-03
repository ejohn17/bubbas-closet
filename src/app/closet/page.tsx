import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { SizeRangeNotice } from "@/components/SizeRangeNotice";
import { Catalog } from "@/components/portal/Catalog";
import { BRAND, PREVIEW_ITEM_LIMIT } from "@/lib/config";
import { toCatalogItem } from "@/lib/catalog";
import { isFirebaseConfigured } from "@/lib/firebase-admin";
import { listProducts } from "@/lib/db/products";
import { availabilityByProduct } from "@/lib/db/units";
import { getSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `The closet — ${BRAND.name}`,
  description:
    "Browse every piece available to rent right now. Build a box, then choose a membership that fits what you picked.",
};

/**
 * Public closet: anyone can see what's on the shelf. Adding a piece needs a
 * free account so we can hold it; paying comes later, sized to the box.
 */
export default async function ClosetPage() {
  const user = await getSessionUser();
  if (user) redirect("/portal");

  const configured = isFirebaseConfigured();
  const [products, availability] = configured
    ? await Promise.all([listProducts({ activeOnly: true }), availabilityByProduct()])
    : [[], {} as Awaited<ReturnType<typeof availabilityByProduct>>];

  const items = products.map((product) =>
    toCatalogItem(product, availability[product.id]),
  );

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 pb-24 pt-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">The closet</h1>
            <p className="mt-2 max-w-xl text-stone">
              Everything here is available right now. Create a free account to
              start a box — you only pay when you choose a plan that covers
              what you picked.
            </p>
            <SizeRangeNotice className="mt-4 max-w-xl" />
          </div>
          <Link href="/signup?next=%2Fportal" className="btn-primary">
            Sign up to start a box
          </Link>
        </div>

        {!configured ? (
          <p className="mt-16 text-center text-stone">
            The closet is being stocked. Check back shortly.
          </p>
        ) : products.length === 0 ? (
          <p className="mt-16 text-center text-stone">
            The closet is being stocked. Check back shortly.
          </p>
        ) : (
          <div className="mt-10">
            <Catalog items={items} itemLimit={PREVIEW_ITEM_LIMIT} boxCount={0} mode="guest" />
          </div>
        )}
      </main>
    </>
  );
}
