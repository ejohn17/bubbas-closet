import type { UnitCondition } from "@/lib/types";

export type CatalogSize = {
  size: string;
  count: number;
  condition: UnitCondition;
};

export type CatalogItem = {
  id: string;
  title: string;
  brand?: string;
  category?: string;
  description: string;
  images: string[];
  /** Availability per size, with the condition the member would receive. */
  sizes: CatalogSize[];
  favorited: boolean;
  inBox: boolean;
};

export function catalogSizes(availability?: {
  sizes: Record<string, { count: number; condition: UnitCondition }>;
}): CatalogSize[] {
  return Object.entries(availability?.sizes ?? {})
    .map(([size, info]) => ({
      size,
      count: info.count,
      condition: info.condition,
    }))
    .sort((a, b) =>
      a.size.localeCompare(b.size, undefined, { numeric: true }),
    );
}

