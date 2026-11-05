"use client";

import { useRef, useState } from "react";
import { ProductImage } from "@/components/ProductImage";
import type { CarouselImage } from "@/lib/types";

/**
 * Edits the landing/signup "peek at the closet" carousel. Changes stay local
 * until saved; "Reset to defaults" drops the custom list entirely.
 */
export function CarouselForm({
  initialImages,
  initialIsDefault,
  maxImages,
}: {
  initialImages: CarouselImage[];
  initialIsDefault: boolean;
  maxImages: number;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [images, setImages] = useState<CarouselImage[]>(initialImages);
  const [isDefault, setIsDefault] = useState(initialIsDefault);
  const [dirty, setDirty] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const [newAlt, setNewAlt] = useState("");
  const [pending, setPending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const full = images.length >= maxImages;

  function update(next: CarouselImage[]) {
    setImages(next);
    setDirty(true);
    setStatus(null);
  }

  function addImage(src: string, alt: string) {
    setError(null);
    if (images.some((image) => image.src === src)) {
      setError("That image is already in the carousel.");
      return false;
    }
    update([...images, { src, alt }]);
    return true;
  }

  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= images.length) return;
    const next = [...images];
    [next[index], next[target]] = [next[target], next[index]];
    update(next);
  }

  async function onUpload(file: File) {
    setError(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("folder", "carousel");
      const res = await fetch("/api/admin/upload", { method: "POST", body: form });
      const body = await res.json().catch(() => null);

      if (!res.ok || !body?.ok) {
        setError(body?.message ?? "Upload failed.");
        return;
      }
      addImage(body.url as string, "");
    } catch {
      setError("Upload failed. Check your connection and try again.");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function send(method: "PUT" | "DELETE") {
    setError(null);
    setStatus(null);
    setPending(true);
    try {
      const res = await fetch("/api/admin/carousel", {
        method,
        headers: { "Content-Type": "application/json" },
        body: method === "PUT" ? JSON.stringify({ images }) : undefined,
      });
      const body = await res.json().catch(() => null);

      if (!res.ok || !body?.ok) {
        setError(body?.message ?? "Could not save the carousel.");
        return;
      }
      setImages(body.images as CarouselImage[]);
      setIsDefault(Boolean(body.isDefault));
      setDirty(false);
      setStatus(method === "PUT" ? "Saved. The carousel is live." : "Reset to the default images.");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setPending(false);
    }
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    await send("PUT");
  }

  async function onReset() {
    if (!window.confirm("Replace the current carousel with the default images?")) {
      return;
    }
    await send("DELETE");
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <p className="text-sm text-stone">
        {isDefault
          ? "Showing the built-in default images. Save any change to use your own list."
          : "Showing your custom list."}{" "}
        {images.length} of {maxImages} images.
      </p>

      {images.length === 0 ? (
        <p className="card p-6 text-sm text-stone">
          No images. Add at least one, or reset to the defaults.
        </p>
      ) : (
        <ol className="card divide-y divide-line">
          {images.map((image, i) => (
            <li
              key={image.src}
              className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center"
            >
              <div className="flex items-center gap-4">
                <span className="w-6 text-center text-sm font-medium text-stone">
                  {i + 1}
                </span>
                <ProductImage
                  src={image.src}
                  alt={image.alt || "Carousel image"}
                  className="aspect-[4/5] w-20 shrink-0 rounded-2xl"
                />
              </div>

              <div className="min-w-0 flex-1">
                <label className="label" htmlFor={`alt-${i}`}>
                  Description
                </label>
                <input
                  id={`alt-${i}`}
                  className="input"
                  required
                  value={image.alt}
                  onChange={(e) =>
                    update(
                      images.map((item, j) =>
                        j === i ? { ...item, alt: e.target.value } : item,
                      ),
                    )
                  }
                  placeholder="Pink knit romper with flutter sleeves"
                />
                <p className="mt-1.5 truncate text-xs text-stone" title={image.src}>
                  {image.src}
                </p>
              </div>

              <div className="flex gap-2 sm:flex-col">
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="btn-outline btn-sm"
                    aria-label={`Move image ${i + 1} up`}
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="btn-outline btn-sm"
                    aria-label={`Move image ${i + 1} down`}
                    disabled={i === images.length - 1}
                    onClick={() => move(i, 1)}
                  >
                    ↓
                  </button>
                </div>
                <button
                  type="button"
                  className="btn-danger btn-sm"
                  onClick={() => update(images.filter((_, j) => j !== i))}
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}

      <fieldset className="border-t border-line pt-6">
        <legend className="text-sm font-semibold">Add an image</legend>
        <p className="mt-1 text-xs text-stone">
          Portrait photos (4:5) look best. New images go to the end of the list.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div>
            <label className="label" htmlFor="carousel-url">
              Image URL
            </label>
            <input
              id="carousel-url"
              className="input"
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              placeholder="https://…"
            />
          </div>
          <div>
            <label className="label" htmlFor="carousel-alt">
              Description
            </label>
            <input
              id="carousel-alt"
              className="input"
              value={newAlt}
              onChange={(e) => setNewAlt(e.target.value)}
              placeholder="What's in the photo"
            />
          </div>
          <button
            type="button"
            className="btn-outline"
            disabled={full || !newUrl.trim() || !newAlt.trim()}
            onClick={() => {
              if (addImage(newUrl.trim(), newAlt.trim())) {
                setNewUrl("");
                setNewAlt("");
              }
            }}
          >
            Add
          </button>
        </div>

        <div className="mt-4">
          <label
            className={`btn-outline ${full || uploading ? "pointer-events-none opacity-60" : "cursor-pointer"}`}
          >
            {uploading ? "Uploading…" : "Upload file"}
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              className="hidden"
              disabled={full || uploading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void onUpload(file);
              }}
            />
          </label>
          <span className="ml-3 text-xs text-stone">
            You&apos;ll add its description in the list above.
          </span>
        </div>
      </fieldset>

      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {status ? (
        <p role="status" className="text-sm text-accent-dark">
          {status}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-6">
        <button
          type="submit"
          className="btn-primary"
          disabled={pending || !dirty || images.length === 0}
        >
          {pending ? "Saving…" : "Save carousel"}
        </button>
        {!isDefault ? (
          <button
            type="button"
            className="btn-outline"
            disabled={pending}
            onClick={() => void onReset()}
          >
            Reset to defaults
          </button>
        ) : null}
        {dirty ? <span className="text-sm text-stone">Unsaved changes</span> : null}
      </div>
    </form>
  );
}
