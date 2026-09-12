"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ProductImage } from "@/components/ProductImage";

export type ProductFormValues = {
  id?: string;
  title: string;
  brand: string;
  category: string;
  description: string;
  tags: string;
  sizes: string;
  retailValue: string;
  images: string[];
  active: boolean;
};

export const EMPTY_PRODUCT: ProductFormValues = {
  title: "",
  brand: "",
  category: "",
  description: "",
  tags: "",
  sizes: "",
  retailValue: "",
  images: [],
  active: true,
};

function splitList(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((v) => v.trim())
    .filter(Boolean);
}

/**
 * Create/edit a style. Images can be uploaded to Firebase Storage or pasted in
 * as URLs, so the catalogue still works before Storage is configured.
 */
export function ProductForm({ initial }: { initial: ProductFormValues }) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [values, setValues] = useState<ProductFormValues>(initial);
  const [imageUrl, setImageUrl] = useState("");
  const [pending, setPending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const isEdit = Boolean(values.id);

  function set<K extends keyof ProductFormValues>(
    key: K,
    value: ProductFormValues[K],
  ) {
    setValues((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  async function onUpload(file: File) {
    setError(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/admin/upload", { method: "POST", body: form });
      const body = await res.json().catch(() => null);

      if (!res.ok || !body?.ok) {
        setError(body?.message ?? "Upload failed.");
        return;
      }
      set("images", [...values.images, body.url as string]);
    } catch {
      setError("Upload failed. Check your connection and try again.");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    setPending(true);

    const payload = {
      title: values.title,
      brand: values.brand,
      category: values.category,
      description: values.description,
      tags: splitList(values.tags),
      sizes: splitList(values.sizes),
      images: values.images,
      retailValueCents: values.retailValue
        ? Math.round(Number(values.retailValue) * 100)
        : undefined,
      active: values.active,
    };

    try {
      const res = await fetch(
        isEdit ? `/api/admin/products/${values.id}` : "/api/admin/products",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const body = await res.json().catch(() => null);

      if (!res.ok || !body?.ok) {
        setError(body?.message ?? "Could not save this product.");
        return;
      }

      if (isEdit) {
        setSaved(true);
        router.refresh();
      } else {
        router.push(`/admin/products/${body.product.id}`);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label" htmlFor="title">
            Title
          </label>
          <input
            id="title"
            className="input"
            required
            value={values.title}
            onChange={(e) => set("title", e.target.value)}
            placeholder="Silk slip dress"
          />
        </div>

        <div>
          <label className="label" htmlFor="brand">
            Brand
          </label>
          <input
            id="brand"
            className="input"
            value={values.brand}
            onChange={(e) => set("brand", e.target.value)}
          />
        </div>

        <div>
          <label className="label" htmlFor="category">
            Category
          </label>
          <input
            id="category"
            className="input"
            value={values.category}
            onChange={(e) => set("category", e.target.value)}
            placeholder="Dresses"
          />
        </div>

        <div className="sm:col-span-2">
          <label className="label" htmlFor="description">
            Description
          </label>
          <textarea
            id="description"
            className="input min-h-28"
            value={values.description}
            onChange={(e) => set("description", e.target.value)}
          />
        </div>

        <div>
          <label className="label" htmlFor="sizes">
            Sizes offered
          </label>
          <input
            id="sizes"
            className="input"
            value={values.sizes}
            onChange={(e) => set("sizes", e.target.value)}
            placeholder="XS, S, M, L"
          />
          <p className="mt-1.5 text-xs text-stone">
            Comma separated. Adding inventory keeps this in step automatically.
          </p>
        </div>

        <div>
          <label className="label" htmlFor="tags">
            Tags
          </label>
          <input
            id="tags"
            className="input"
            value={values.tags}
            onChange={(e) => set("tags", e.target.value)}
            placeholder="occasion, summer"
          />
        </div>

        <div>
          <label className="label" htmlFor="retail">
            Retail value ($)
          </label>
          <input
            id="retail"
            className="input"
            inputMode="decimal"
            value={values.retailValue}
            onChange={(e) => set("retailValue", e.target.value)}
            placeholder="180"
          />
        </div>

        <div className="flex items-end">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={values.active}
              onChange={(e) => set("active", e.target.checked)}
            />
            Visible in the member closet
          </label>
        </div>
      </div>

      <fieldset className="border-t border-line pt-6">
        <legend className="text-sm font-semibold">Images</legend>

        {values.images.length > 0 ? (
          <ul className="mt-4 flex flex-wrap gap-3">
            {values.images.map((url) => (
              <li key={url} className="relative">
                <ProductImage
                  src={url}
                  alt={values.title || "Product image"}
                  className="h-28 w-24 rounded-2xl"
                />
                <button
                  type="button"
                  aria-label="Remove image"
                  onClick={() =>
                    set(
                      "images",
                      values.images.filter((image) => image !== url),
                    )
                  }
                  className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full border border-line bg-card text-sm text-stone hover:text-ink"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="min-w-64 flex-1">
            <label className="label" htmlFor="image-url">
              Add by URL
            </label>
            <input
              id="image-url"
              className="input"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://…"
            />
          </div>
          <button
            type="button"
            className="btn-outline"
            disabled={!imageUrl.trim()}
            onClick={() => {
              set("images", [...values.images, imageUrl.trim()]);
              setImageUrl("");
            }}
          >
            Add
          </button>

          <label className="btn-outline cursor-pointer">
            {uploading ? "Uploading…" : "Upload file"}
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void onUpload(file);
              }}
            />
          </label>
        </div>
      </fieldset>

      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {saved ? (
        <p role="status" className="text-sm text-accent-dark">
          Saved.
        </p>
      ) : null}

      <div>
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "Saving…" : isEdit ? "Save changes" : "Create product"}
        </button>
      </div>
    </form>
  );
}
