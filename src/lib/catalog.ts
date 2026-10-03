import type { UnitCondition } from "@/lib/types";
import { compareSizes } from "@/lib/sizes";

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
  tags?: string[];
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
    .sort((a, b) => compareSizes(a.size, b.size));
}

export function toCatalogItem(
  product: {
    id: string;
    title: string;
    brand?: string;
    category?: string;
    tags?: string[];
    description: string;
    images: string[];
  },
  availability?: Parameters<typeof catalogSizes>[0],
  flags?: { favorited?: boolean; inBox?: boolean },
): CatalogItem {
  return {
    id: product.id,
    title: product.title,
    brand: product.brand,
    category: product.category,
    tags: product.tags,
    description: product.description,
    images: product.images,
    sizes: catalogSizes(availability),
    favorited: flags?.favorited ?? false,
    inBox: flags?.inBox ?? false,
  };
}

