import { describe, expect, it } from "vitest";
import { MAX_CAROUSEL_IMAGES, normalizeCarouselImages } from "@/lib/db/carousel";

describe("normalizeCarouselImages", () => {
  it("trims, keeps order, and drops duplicate sources", () => {
    expect(
      normalizeCarouselImages([
        { src: " https://storage.googleapis.com/b/carousel/a.jpg ", alt: " Coat " },
        { src: "/carousel/carousel-1.webp", alt: "Hoodie" },
        { src: "https://storage.googleapis.com/b/carousel/a.jpg", alt: "Dupe" },
      ]),
    ).toEqual([
      { src: "https://storage.googleapis.com/b/carousel/a.jpg", alt: "Coat" },
      { src: "/carousel/carousel-1.webp", alt: "Hoodie" },
    ]);
  });

  it.each([
    ["http://example.com/a.jpg"],
    ["//example.com/a.jpg"],
    ["javascript:alert(1)"],
    [""],
  ])("rejects the source %j", (src) => {
    expect(() => normalizeCarouselImages([{ src, alt: "Photo" }])).toThrow(
      /https:\/\/ URL/,
    );
  });

  it("requires a description", () => {
    expect(() =>
      normalizeCarouselImages([{ src: "/a.webp", alt: "   " }]),
    ).toThrow(/description/);
  });

  it("requires a non-empty list within the cap", () => {
    expect(() => normalizeCarouselImages([])).toThrow(/at least one/);
    expect(() => normalizeCarouselImages(undefined)).toThrow(/list/);

    const tooMany = Array.from({ length: MAX_CAROUSEL_IMAGES + 1 }, (_, i) => ({
      src: `/carousel/${i}.webp`,
      alt: `Photo ${i}`,
    }));
    expect(() => normalizeCarouselImages(tooMany)).toThrow(/up to/);
  });
});
