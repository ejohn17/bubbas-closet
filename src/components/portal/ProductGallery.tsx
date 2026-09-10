"use client";

import { useState } from "react";
import { ProductImage } from "@/components/ProductImage";

/** Cycles through a style's photos; one image is just shown, no chrome. */
export function ProductGallery({
  images,
  alt,
  className = "h-[28rem] w-full sm:h-[36rem]",
}: {
  images: string[];
  alt: string;
  className?: string;
}) {
  const [index, setIndex] = useState(0);
  const count = images.length;
  const current = count > 0 ? images[Math.min(index, count - 1)] : undefined;

  function go(delta: number) {
    if (count < 2) return;
    setIndex((i) => (i + delta + count) % count);
  }

  return (
    <div>
      <div className="relative overflow-hidden rounded-3xl bg-line/40">
        <ProductImage
          src={current}
          alt={count > 1 ? `${alt}, photo ${index + 1} of ${count}` : alt}
          className={className}
        />

        {count > 1 ? (
          <>
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label="Previous photo"
              className="absolute left-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-card/90 text-lg text-ink shadow-sm"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              aria-label="Next photo"
              className="absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-card/90 text-lg text-ink shadow-sm"
            >
              ›
            </button>
            <p className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-card/90 px-3 py-1 text-xs font-medium text-stone">
              {index + 1} / {count}
            </p>
          </>
        ) : null}
      </div>

      {count > 1 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {images.map((src, i) => (
            <button
              key={`${src}-${i}`}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Show photo ${i + 1}`}
              aria-current={i === index ? "true" : undefined}
              className={`overflow-hidden rounded-xl border ${
                i === index ? "border-ink" : "border-transparent hover:border-accent"
              }`}
            >
              <ProductImage src={src} alt="" className="h-16 w-16" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
