"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { PREVIEW_IMAGES } from "@/lib/preview-images";

const INTERVAL_MS = 4500;

/**
 * Closet preview for marketing pages. Landing shows a peeking strip;
 * signup shows one photo at a time beside the form.
 */
export function PreviewCarousel({
  variant = "landing",
}: {
  variant?: "landing" | "signup";
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [inView, setInView] = useState(true);
  const count = PREVIEW_IMAGES.length;
  const signup = variant === "signup";

  const goTo = useCallback(
    (next: number, behavior?: ScrollBehavior) => {
      const el = scrollerRef.current;
      if (!el) return;
      const wrapped = (next + count) % count;
      const child = el.children[wrapped] as HTMLElement | undefined;
      if (!child) return;
      const first = el.children[0] as HTMLElement;
      const dist = Math.abs(wrapped - index);
      el.scrollTo({
        left: child.offsetLeft - first.offsetLeft,
        behavior: behavior ?? (dist === 1 ? "smooth" : "auto"),
      });
      setIndex(wrapped);
    },
    [count, index],
  );

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

    const interval = setInterval(() => {
      if (document.hidden) return;
      goTo(index + 1);
    }, INTERVAL_MS);

    return () => clearInterval(interval);
  }, [count, goTo, inView, index, paused]);

  function onScroll() {
    const el = scrollerRef.current;
    if (!el) return;
    const first = el.children[0] as HTMLElement | undefined;
    if (!first) return;
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < el.children.length; i++) {
      const child = el.children[i] as HTMLElement;
      const dist = Math.abs(child.offsetLeft - first.offsetLeft - el.scrollLeft);
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    }
    setIndex(best);
  }

  return (
    <div
      ref={rootRef}
      className="relative"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (next instanceof Node && event.currentTarget.contains(next)) {
          return;
        }
        setPaused(false);
      }}
    >
      <div className="relative">
        <div
          ref={scrollerRef}
          className="preview-scroll flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth"
          onScroll={onScroll}
          tabIndex={0}
          role="region"
          aria-roledescription="carousel"
          aria-label="Closet preview"
          onKeyDown={(event) => {
            if (event.key === "ArrowRight") {
              event.preventDefault();
              goTo(index + 1);
            } else if (event.key === "ArrowLeft") {
              event.preventDefault();
              goTo(index - 1);
            }
          }}
        >
          {PREVIEW_IMAGES.map((image, i) => (
            <figure
              key={image.src}
              className={`relative shrink-0 snap-start overflow-hidden rounded-3xl bg-line/40 ${
                signup
                  ? "aspect-[4/5] w-full"
                  : "aspect-[4/5] w-[min(78%,20rem)] sm:w-[calc((100%-1rem)/2)] lg:w-[calc((100%-2rem)/3)]"
              }`}
            >
              <Image
                src={image.src}
                alt={image.alt}
                fill
                sizes={
                  signup
                    ? "(min-width: 1024px) 28rem, 100vw"
                    : "(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 80vw"
                }
                className="object-cover"
                priority={i === 0}
              />
            </figure>
          ))}
        </div>

        <button
          type="button"
          onClick={() => goTo(index - 1)}
          aria-label="Previous photo"
          className="absolute left-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-card/90 text-lg text-ink shadow-sm"
        >
          ‹
        </button>
        <button
          type="button"
          onClick={() => goTo(index + 1)}
          aria-label="Next photo"
          className="absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-card/90 text-lg text-ink shadow-sm"
        >
          ›
        </button>
      </div>

      <div className="mt-4 flex justify-center gap-1.5">
        {PREVIEW_IMAGES.map((image, i) => (
          <button
            key={image.src}
            type="button"
            aria-label={`Show photo ${i + 1}`}
            aria-current={i === index ? "true" : undefined}
            onClick={() => goTo(i)}
            className={`h-1.5 rounded-full transition ${
              i === index ? "w-5 bg-ink" : "w-1.5 bg-line hover:bg-stone/40"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
