import Link from "next/link";
import { EMPTY_PRODUCT, ProductForm } from "@/components/admin/ProductForm";

export default function NewProductPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/admin/products" className="text-sm text-stone hover:text-ink">
        ← Products
      </Link>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight">New product</h1>
      <p className="mt-2 mb-8 text-stone">
        Create the style first, then add the physical garments you own in each
        size.
      </p>
      <ProductForm initial={EMPTY_PRODUCT} />
    </div>
  );
}
