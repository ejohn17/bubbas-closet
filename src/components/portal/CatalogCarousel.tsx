"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ProductImage } from "@/components/ProductImage";

const INTERVAL_MS = 4000;

/**
 * Browse-card photos. Multiple images rotate on their own; hover or leaving
 * the viewport pauses so the grid doesn't churn off-screen.
 */
export function CatalogCarousel({
  images,
  alt,
  href,
  offsetMs = 0,
}: {
  images: string[];
  alt: string;
  href: string;
  /** Stagger so neighbouring cards don't flip in lockstep. */
  offsetMs?: number;
}) {
  const rootRef = useRef<HTMLAnchorElement>(null);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [inView, setInView] = useState(true);
  const count = images.length;

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { threshold: 0.35 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (count < 2 || paused || !inView) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    let interval: ReturnType<typeof setInterval> | undefined;
    const start = window.setTimeout(() => {
      interval = setInterval(() => {
        if (document.hidden) return;
        setIndex((i) => (i + 1) % count);
      }, INTERVAL_MS);
    }, offsetMs);

    return () => {
      window.clearTimeout(start);
      if (interval) clearInterval(interval);
    };
  }, [count, inView, offsetMs, paused]);

  return (
    <Link
      ref={rootRef}
      href={href}
      className="group relative block h-64 overflow-hidden bg-line/40"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      {count === 0 ? (
        <ProductImage alt={alt} className="h-64 w-full" />
      ) : count === 1 ? (
        <ProductImage
          src={images[0]}
          alt={alt}
          className="h-64 w-full transition duration-300 group-hover:scale-[1.03]"
        />
      ) : (
        images.map((src, i) => (
          <ProductImage
            key={`${src}-${i}`}
            src={src}
            alt={i === index ? alt : ""}
            className={`absolute inset-0 h-64 w-full transition-opacity duration-700 ${
              i === index ? "opacity-100" : "opacity-0"
            }`}
          />
        ))
      )}

      {count > 1 ? (
        <>
          <span className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-ink/35 to-transparent" />
          <span className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
            {images.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 w-1.5 rounded-full ${
                  i === index ? "bg-card" : "bg-card/50"
                }`}
              />
            ))}
          </span>
        </>
      ) : null}
    </Link>
  );
}
